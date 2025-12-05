import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    BadRequestException,
    GoneException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import archiver from 'archiver';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnvVars } from '../config/env.js';
import { Attachment } from '../entities/attachment.entity.js';
import { Message, MessageStatus } from '../entities/message.entity.js';
import { Recipient, RecipientStatus } from '../entities/recipient.entity.js';
import { MessageQueueService } from './message-queue.service.js';
import { CreateMessageDto } from './dto/create-message.schema.js';
import { AntivirusService } from '../antivirus/antivirus.service.js';
import { CacheService } from '../common/cache.service.js';
import type { MessageResponseDto } from './dto/messages.dto.js';
import type { AttachmentDto } from './dto/attachment.dto.js';

@Injectable()
export class MessagesService implements OnModuleInit {
    private readonly storageRoot: string;
    private readonly maxFiles: number;
    private readonly maxTotalBytes: number;
    private readonly downloadTtlHours: number;
    private readonly logger = new Logger(MessagesService.name);

    constructor(
        @Inject(ConfigService) private readonly config: ConfigService<EnvVars, true>,
        @InjectRepository(Message) private readonly messages: Repository<Message>,
        @InjectRepository(Recipient) private readonly recipients: Repository<Recipient>,
        @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
        @Inject(MessageQueueService) private readonly queue: MessageQueueService,
        @Inject(AntivirusService) private readonly antivirus: AntivirusService,
        @Inject(CacheService) private readonly cache: CacheService,
    ) {
        if (!this.config) {
            throw new Error('ConfigService not available in MessagesService');
        }

        this.storageRoot = path.resolve(this.config.get('STORAGE_PATH', { infer: true }));
        this.maxFiles = this.config.get('MAX_FILES_PER_MESSAGE', { infer: true });
        this.maxTotalBytes = this.config.get('MAX_TOTAL_UPLOAD_BYTES', { infer: true });
        this.downloadTtlHours = this.config.get('DOWNLOAD_TTL_HOURS', { infer: true });
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
                expiresAt: this.computeExpiry(),
                downloadedAt: null,
            }),
        );

        const targetDir = path.join(this.storageRoot, messageId);
        await fs.mkdir(targetDir, { recursive: true });

        message.attachments = await this.persistAttachments(targetDir, messageId, files);

        await this.messages.save(message);
        await this.queue.enqueueDispatch(message.id);
        this.logger.log(
            `Message created: id=${message.id} recipients=${message.recipients.length} attachments=${message.attachments.length}`,
        );

        const snapshot = await this.getMessageById(message.id);
        await this.cache.setJSON(this.cacheKey(message.id), snapshot);
        return snapshot;
    }

    async addAttachments(messageId: string, files: Express.Multer.File[] = []): Promise<AttachmentDto[]> {
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
        this.logger.log(
            `Attachments added: messageId=${messageId} added=${newAttachments.length} total=${
                existingTotals.count + newAttachments.length
            }`,
        );
        await this.cache.del(this.cacheKey(messageId));

        const all = await this.attachments.find({
            where: { messageId },
            order: { createdAt: 'ASC' },
        });
        return all.map((attachment) => this.toAttachmentDto(attachment));
    }

    async getMessageById(id: string) {
        const cached = await this.cache.getJSON<MessageResponseDto>(this.cacheKey(id));
        if (cached) {
            return cached;
        }

        const message = await this.messages.findOne({
            where: { id },
            relations: ['recipients', 'attachments'],
        });
        if (!message) {
            throw new NotFoundException('Message not found');
        }

        const snapshot: MessageResponseDto = {
            id: message.id,
            subject: message.subject,
            body: message.body,
            status: message.status,
            createdAt: message.createdAt,
            recipients: message.recipients.map((recipient) => ({
                email: recipient.email,
                status: recipient.status,
                downloadToken: recipient.downloadToken,
                expiresAt: recipient.expiresAt,
                downloadedAt: recipient.downloadedAt,
            })),
            attachments: message.attachments.map((attachment) => this.toAttachmentDto(attachment)),
        };
        await this.cache.setJSON(this.cacheKey(id), snapshot);
        return snapshot;
    }

    async streamDownload(token: string, res: import('express').Response) {
        const recipient = await this.recipients.findOne({
            where: { downloadToken: token },
        });

        if (!recipient) {
            throw new NotFoundException('Invalid download token');
        }

        if (recipient.expiresAt.getTime() < Date.now()) {
            throw new GoneException('Download link expired');
        }

        const message = await this.messages.findOne({
            where: { id: recipient.messageId },
            relations: ['attachments', 'recipients'],
        });

        if (!message) {
            throw new NotFoundException('Message not found');
        }

        // Ensure all attachments exist on disk before streaming
        for (const attachment of message.attachments) {
            try {
                await fs.access(attachment.path);
            } catch {
                throw new NotFoundException('Attachment file not found on disk');
            }
        }

        const archive = archiver('zip', { zlib: { level: 9 } });
        const zipName = `message-${message.id}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

        archive.pipe(res);

        const messageContent = `Subject: ${message.subject}\n\n${message.body}`;
        archive.append(messageContent, { name: 'message.txt' });

        for (const attachment of message.attachments) {
            archive.file(attachment.path, { name: attachment.originalName });
        }

        archive.on('error', (err: Error) => {
            throw err;
        });

        await archive.finalize();

        const dataSource = this.messages.manager.connection;
        if (!dataSource.isInitialized) {
            return;
        }

        try {
            await this.markDownloaded(recipient, message);
        } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            if (messageText.includes('connection is in closed state')) {
                this.logger.warn('Connection closed while marking download');
                return;
            }
            this.logger.error('Failed to mark download as received', error as Error);
        }
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
            await this.antivirus.scanBuffer(file.buffer);

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

    private computeExpiry() {
        return new Date(Date.now() + this.downloadTtlHours * 60 * 60 * 1000);
    }

    private async markDownloaded(recipient: Recipient, message: Message) {
        recipient.status = RecipientStatus.Downloaded;
        recipient.downloadedAt = new Date();
        await this.recipients.save(recipient);

        // Mark message as received when any recipient downloads
        message.status = MessageStatus.Received;
        await this.messages.save(message);
        this.logger.log(
            `Download marked: messageId=${message.id} recipient=${recipient.email} status=${recipient.status}`,
        );
    }

    private cacheKey(id: string) {
        return `message:${id}`;
    }

    private toAttachmentDto(attachment: Attachment): AttachmentDto {
        return {
            id: attachment.id,
            name: attachment.originalName,
            size: Number(attachment.size),
            mimeType: attachment.mimeType,
        };
    }
}
