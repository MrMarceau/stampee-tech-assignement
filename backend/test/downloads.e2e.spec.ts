import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect, beforeEach, vi } from 'vitest';
import { envSchema } from '../src/config/env.js';
import { MessagesModule } from '../src/messages/messages.module.js';
import { DownloadsModule } from '../src/downloads/downloads.module.js';
import { Message } from '../src/entities/message.entity.js';
import { Recipient, RecipientStatus } from '../src/entities/recipient.entity.js';
import { Attachment } from '../src/entities/attachment.entity.js';
import { MessageQueueService } from '../src/messages/message-queue.service.js';
import { AntivirusService } from '../src/antivirus/antivirus.service.js';

const createTestingApp = async (opts: { antivirusThrows?: boolean } = {}) => {
    const storageDir = path.join(tmpdir(), `stampee-downloads-test-${Date.now()}`);
    mkdirSync(storageDir, { recursive: true });

    process.env.STORAGE_PATH = storageDir;
    process.env.DB_SYNC = 'true';

    const mockQueue: Partial<MessageQueueService> = {
        enqueueDispatch: vi.fn().mockResolvedValue(undefined),
    };

    const mockAntivirus: Partial<AntivirusService> = {
        scanBuffer: opts.antivirusThrows
            ? vi.fn().mockImplementation(() => {
                  throw new Error('Virus detected');
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
                        CACHE_ENABLED: 'false',
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

describe('Downloads e2e', () => {
    let app: INestApplication;
    let storageDir: string;

    beforeAll(async () => {
        const setup = await createTestingApp();
        app = setup.app;
        storageDir = setup.storageDir;
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

    const createMessage = async () => {
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
        const messageId = createResponse.body.id;
        return { token, messageId };
    };

    it('returns 404 for invalid token', async () => {
        const response = await request(app.getHttpServer()).get('/api/download/invalid-token');
        expect(response.status).toBe(404);
    });

    it('returns 410 for expired token', async () => {
        const { token } = await createMessage();

        // update expiresAt to past
        const repo = app.get<Repository<Recipient>>(getRepositoryToken(Recipient));
        await repo.update({ downloadToken: token }, { expiresAt: new Date(Date.now() - 1000) });

        const response = await request(app.getHttpServer()).get(`/api/download/${token}`);
        expect(response.status).toBe(410);
    });

    it('returns 404 when file missing on disk', async () => {
        const { token, messageId } = await createMessage();

        // Delete the file from storage
        const attachmentsRepo = app.get<Repository<Attachment>>(getRepositoryToken(Attachment));
        const attachment = await attachmentsRepo.findOne({ where: { messageId } });
        rmSync(attachment.path);

        const response = await request(app.getHttpServer()).get(`/api/download/${token}`);
        expect(response.status).toBe(404);
    });

    it('updates statuses on download', async () => {
        const { token, messageId } = await createMessage();

        const response = await request(app.getHttpServer()).get(`/api/download/${token}`);
        expect(response.status).toBe(200);

        // Timeout to wait before checking update in DB
        await new Promise((resolve) => setTimeout(resolve, 100));

        const recipientsRepo = app.get<Repository<Recipient>>(getRepositoryToken(Recipient));
        const messagesRepo = app.get<Repository<Message>>(getRepositoryToken(Message));

        const recipient = await recipientsRepo.findOne({ where: { downloadToken: token } });
        const message = await messagesRepo.findOne({ where: { id: messageId } });

        expect(recipient.status).toBe(RecipientStatus.Downloaded);
        expect(message.status).toBe('received');
    });
});
