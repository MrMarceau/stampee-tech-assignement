import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException, INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { vi, describe, beforeAll, afterAll, it, expect, beforeEach } from 'vitest';
import { envSchema } from '../src/config/env.js';
import { MessagesModule } from '../src/messages/messages.module.js';
import { DownloadsModule } from '../src/downloads/downloads.module.js';
import { Message } from '../src/entities/message.entity.js';
import { Recipient } from '../src/entities/recipient.entity.js';
import { Attachment } from '../src/entities/attachment.entity.js';
import { MessageQueueService } from '../src/messages/message-queue.service.js';
import { AntivirusService } from '../src/antivirus/antivirus.service.js';

const createTestingApp = async (opts: { antivirusThrows?: boolean } = {}) => {
    const storageDir = path.join(tmpdir(), `stampee-test-${Date.now()}`);
    mkdirSync(storageDir, { recursive: true });

    process.env.STORAGE_PATH = storageDir;
    process.env.DB_SYNC = 'true';

    const mockQueue: Partial<MessageQueueService> = {
        enqueueDispatch: vi.fn().mockResolvedValue(undefined),
    };

    const mockAntivirus: Partial<AntivirusService> = {
        scanBuffer: opts.antivirusThrows
            ? vi.fn().mockImplementation(() => {
                  throw new BadRequestException('Virus detected');
              })
            : vi.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                isGlobal: true,
                validate: (config) =>
                    envSchema.parse({
                        ...config,
                        DB_SYNC: 'true',
                        STORAGE_PATH: storageDir,
                    }),
            }),
            TypeOrmModule.forRoot({
                type: 'mysql',
                host: '127.0.0.1',
                port: Number(process.env.DB_PORT ?? 3306),
                username: process.env.DB_USER ?? 'stampee',
                password: process.env.DB_PASSWORD ?? 'stampee',
                database: process.env.DB_TEST_NAME ?? 'stampee_test',
                entities: [Message, Recipient, Attachment],
                synchronize: true,
                dropSchema: true,
            }),
            MessagesModule,
            DownloadsModule,
        ],
    })
        .overrideProvider(MessageQueueService)
        .useValue(mockQueue)
        .overrideProvider(AntivirusService)
        .useValue(mockAntivirus)
        .compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', {
        exclude: ['health'],
    });
    await app.init();

    return { app, storageDir, mockQueue, mockAntivirus };
};

describe('Messages e2e', () => {
    let app: INestApplication;
    let storageDir: string;
    let mockAntivirus: Partial<AntivirusService>;

    beforeAll(async () => {
        const setup = await createTestingApp();
        app = setup.app;
        storageDir = setup.storageDir;
        mockAntivirus = setup.mockAntivirus;
    }, 30000);

    afterAll(async () => {
        if (app) {
            await app.close();
        }
        if (storageDir) {
            rmSync(storageDir, { recursive: true, force: true });
        }
    }, 15000);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a message with attachment and allows download', async () => {
        const filePath = path.join(storageDir, 'hello.txt');
        writeFileSync(filePath, 'hello world');

        const createResponse = await request(app.getHttpServer())
            .post('/api/messages')
            .field('subject', 'Test')
            .field('body', 'Body')
            .field('recipients', 'user@example.com')
            .attach('attachments', filePath);
        expect(createResponse.status).toBe(201);
        const token = createResponse.body.recipients[0].downloadToken;
        expect(token).toBeDefined();

        const downloadResponse = await request(app.getHttpServer()).get(`/api/download/${token}`);
        expect(downloadResponse.status).toBe(200);
        expect(downloadResponse.headers['content-type']).toContain('application/zip');
    });

    it('rejects invalid payload with 400', async () => {
        const invalidPayloads = [
            { subject: undefined, body: 'Body', recipients: 'user@example.com' },
            { subject: '', body: 'Body', recipients: 'user@example.com' },
            { subject: 'A'.repeat(201), body: 'Body', recipients: 'user@example.com' },
            { subject: 'Ok', body: '', recipients: 'user@example.com' },
            { subject: 'Ok', body: 'Body', recipients: '' },
            { subject: 'Ok', body: 'Body', recipients: 'not-an-email' },
        ];

        for (const payload of invalidPayloads) {
            const response = await request(app!.getHttpServer())
                .post('/api/messages')
                .field('subject', payload.subject ?? '')
                .field('body', payload.body ?? '')
                .field('recipients', payload.recipients ?? '');

            expect(response.status).toBe(400);
        }
    });

    it('rejects more than 10 attachments', async () => {
        const files = Array.from({ length: 11 }, (_, idx) => {
            const filePath = path.join(storageDir, `file-${idx}.txt`);
            writeFileSync(filePath, `content-${idx}`);
            return filePath;
        });

        const req = request(app.getHttpServer())
            .post('/api/messages')
            .field('subject', 'Too many')
            .field('body', 'Body')
            .field('recipients', 'user@example.com');

        for (const filePath of files) {
            req.attach('attachments', filePath);
        }

        const response = await req;
        expect(response.status).toBe(400);
    });

    it('rejects when total size exceeds 256MB', async () => {
        const bigFile = path.join(storageDir, 'big.bin');
        // Slightly above 256MB
        const size = 257 * 1024 * 1024;
        writeFileSync(bigFile, Buffer.alloc(size, 1));

        const response = await request(app.getHttpServer())
            .post('/api/messages')
            .field('subject', 'Big payload')
            .field('body', 'Body')
            .field('recipients', 'user@example.com')
            .attach('attachments', bigFile);

        expect(response.status).toBe(400);
    });

    it('rejects disallowed file extension', async () => {
        const filePath = path.join(storageDir, 'malicious.exe');
        writeFileSync(filePath, 'binary');

        const response = await request(app.getHttpServer())
            .post('/api/messages')
            .field('subject', 'Bad file')
            .field('body', 'Body')
            .field('recipients', 'user@example.com')
            .attach('attachments', filePath);

        expect(response.status).toBe(400);
    });

    it('rejects upload when antivirus detects a virus', async () => {
        // Force antivirus to throw
        (mockAntivirus?.scanBuffer as ReturnType<typeof vi.fn>)?.mockImplementationOnce(() => {
            throw new BadRequestException('Virus detected :(');
        });

        const infectedFile = path.join(storageDir as string, 'infected.txt');
        writeFileSync(infectedFile, 'virus payload');

        const response = await request(app!.getHttpServer())
            .post('/api/messages')
            .field('subject', 'Test')
            .field('body', 'Body')
            .field('recipients', 'user@example.com')
            .attach('attachments', infectedFile);

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Virus detected :(');
        expect((mockAntivirus?.scanBuffer as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
});
