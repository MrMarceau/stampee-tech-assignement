import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { Attachment } from './entities/attachment.entity.js';
import { Message } from './entities/message.entity.js';
import { Recipient } from './entities/recipient.entity.js';
import { MailService } from './mail.service.js';
import { MessageQueueService } from './message-queue.service.js';
import { DownloadsController } from './downloads.controller.js';

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([Message, Recipient, Attachment])],
    controllers: [MessagesController, DownloadsController],
    providers: [MessagesService, MailService, MessageQueueService],
})
export class MessagesModule {}
