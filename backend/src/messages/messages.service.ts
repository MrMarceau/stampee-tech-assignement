import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnvVars } from '../config/env.js';
import { Attachment } from './entities/attachment.entity.js';
import { Message, MessageStatus } from './entities/message.entity.js';
import { Recipient, RecipientStatus } from './entities/recipient.entity.js';
import { MessageQueueService } from './message-queue.service.js';
import { CreateMessageDto } from './dto/create-message.schema.js';

@Injectable()
export class MessagesService implements OnModuleInit {
    private readonly storageRoot: string;
    private readonly maxFiles: number;
    private readonly maxTotalBytes: number;

    constructor(
        @Inject(ConfigService) private readonly config: ConfigService<EnvVars, true>,
        @InjectRepository(Message) private readonly messages: Repository<Message>,
        @InjectRepository(Recipient) private readonly recipients: Repository<Recipient>,
        @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
        private readonly queue: MessageQueueService,
    ) {
        if (!this.config) {
            throw new Error('ConfigService not available in MessagesService');
        }

        this.storageRoot = path.resolve(this.config.get('STORAGE_PATH', { infer: true }));
        this.maxFiles = this.config.get('MAX_FILES_PER_MESSAGE', { infer: true });
        this.maxTotalBytes = this.config.get('MAX_TOTAL_UPLOAD_BYTES', { infer: true });
    }

    async onModuleInit() {
        await fs.mkdir(this.storageRoot, { recursive: true });
    }

    async createMessage(payload: CreateMessageDto, files: Express.Multer.File[] = []) {
        this.enforceLimits(files.length, files.reduce((acc, f) => acc + f.size, 0));

        const messageId = randomUUID();
        const message = this.messages.create({
            id: messageId,
            subject: payload.subject,
            body: payload.body,
            status: MessageStatus.Queued,
        });

        message.recipients = payload.recipients.map((email) =>
            this.recipients.create({
                email,
                downloadToken: randomUUID(),
                status: RecipientStatus.Pending,
                messageId,
            }),
        );

        const targetDir = path.join(this.storageRoot, messageId);
        await fs.mkdir(targetDir, { recursive: true });

        message.attachments = await this.persistAttachments(targetDir, messageId, files);

        await this.messages.save(message);
        await this.queue.enqueueDispatch(message.id);

        return this.messages.findOne({
            where: { id: message.id },
            relations: ['recipients', 'attachments'],
        });
    }

    async addAttachments(messageId: string, files: Express.Multer.File[] = []) {
        const message = await this.messages.findOne({ where: { id: messageId } });
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        const existingTotals = await this.computeAttachmentTotals(messageId);
        this.enforceLimits(
            existingTotals.count + files.length,
            existingTotals.totalSize + files.reduce((acc, f) => acc + f.size, 0),
        );

        const targetDir = path.join(this.storageRoot, messageId);
        await fs.mkdir(targetDir, { recursive: true });

        const newAttachments = await this.persistAttachments(targetDir, messageId, files);
        await this.attachments.save(newAttachments);

        return this.attachments.find({
            where: { messageId },
            order: { createdAt: 'ASC' },
        });
    }

    private enforceLimits(fileCount: number, totalBytes: number) {
        if (fileCount > this.maxFiles) {
            throw new BadRequestException(
                `Too many files: received ${fileCount}, maximum allowed is ${this.maxFiles}`,
            );
        }

        if (totalBytes > this.maxTotalBytes) {
            throw new BadRequestException(
                `Total upload size exceeds limit of ${this.maxTotalBytes / (1024 * 1024)}MB`,
            );
        }
    }

    private async persistAttachments(
        targetDir: string,
        messageId: string,
        files: Express.Multer.File[],
    ) {
        const attachments: Attachment[] = [];

        for (const file of files) {
            const storedName = `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`;
            const fullPath = path.join(targetDir, storedName);

            await fs.writeFile(fullPath, file.buffer);

            attachments.push(
                this.attachments.create({
                    messageId,
                    originalName: file.originalname,
                    storedName,
                    mimeType: file.mimetype,
                    size: file.size,
                    path: fullPath,
                }),
            );
        }

        return attachments;
    }

    private async computeAttachmentTotals(messageId: string) {
        const attachments = await this.attachments.find({
            where: { messageId },
        });

        return attachments.reduce(
            (acc, att) => {
                acc.count += 1;
                acc.totalSize += Number(att.size);
                return acc;
            },
            { count: 0, totalSize: 0 },
        );
    }
}
