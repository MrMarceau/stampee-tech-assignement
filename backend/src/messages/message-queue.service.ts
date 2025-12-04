import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue, Worker } from 'bullmq';
import { Repository } from 'typeorm';
import { EnvVars } from '../config/env.js';
import { Message, MessageStatus } from '../entities/message.entity.js';
import { Recipient, RecipientStatus } from '../entities/recipient.entity.js';
import { MailService } from '../mail/mail.service.js';
import type { MessageJob } from '../types/message-queue.js';

@Injectable()
export class MessageQueueService implements OnModuleDestroy {
    private readonly logger = new Logger(MessageQueueService.name);
    private readonly queue: Queue<MessageJob>;
    private readonly worker: Worker<MessageJob>;

    constructor(
        @Inject(ConfigService) private readonly config: ConfigService<EnvVars, true>,
        @InjectRepository(Message) private readonly messages: Repository<Message>,
        @InjectRepository(Recipient) private readonly recipients: Repository<Recipient>,
        private readonly mailer: MailService,
    ) {
        if (!this.config) {
            throw new Error('ConfigService not available in MessageQueueService');
        }

        const connection = {
            host: this.config.get('REDIS_HOST', { infer: true }),
            port: this.config.get('REDIS_PORT', { infer: true }),
        };

        this.queue = new Queue<MessageJob>('message-email', {
            connection,
            defaultJobOptions: {
                attempts: 3,
                removeOnComplete: 25,
                removeOnFail: 50,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        });

        this.worker = new Worker<MessageJob>(
            'message-email',
            async (job) => this.processJob(job),
            {
                connection,
            },
        );

        this.worker.on('failed', (job, err) => {
            const id = job?.id ?? 'unknown';
            this.logger.error(`Job ${id} failed`, err?.stack);
        });
    }

    async enqueueDispatch(messageId: string) {
        await this.queue.add('dispatch-email', { messageId });
    }

    private async processJob(job: Job<MessageJob>) {
        const message = await this.messages.findOne({
            where: { id: job.data.messageId },
            relations: ['recipients', 'attachments'],
        });

        if (!message) {
            this.logger.warn(`Message ${job.data.messageId} not found`);
            return;
        }

        try {
            for (const recipient of message.recipients) {
                await this.mailer.sendMessageNotification(message, recipient);
                recipient.status = RecipientStatus.Emailed;
                await this.recipients.save(recipient);
            }

            message.status = MessageStatus.Sent;
            await this.messages.save(message);
        } catch (error) {
            message.status = MessageStatus.Failed;
            await this.messages.save(message);
            this.logger.error(`Failed processing message ${message.id}`, (error as Error).stack);
            throw error;
        }
    }

    async onModuleDestroy() {
        await this.worker.close();
        await this.queue.close();
    }
}
