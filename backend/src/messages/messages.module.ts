import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { MessageQueueService } from './message-queue.service.js';
import { Attachment } from '../entities/attachment.entity.js';
import { Message } from '../entities/message.entity.js';
import { Recipient } from '../entities/recipient.entity.js';
import { MailModule } from '../mail/mail.module.js';
import { AntivirusModule } from '../antivirus/antivirus.module.js';
import { CacheService } from '../common/cache.service.js';

@Module({
    imports: [
        ConfigModule,
        MailModule,
        AntivirusModule,
        TypeOrmModule.forFeature([Message, Recipient, Attachment]),
    ],
    controllers: [MessagesController],
    providers: [MessagesService, MessageQueueService, CacheService],
    exports: [MessagesService],
})
export class MessagesModule {}
