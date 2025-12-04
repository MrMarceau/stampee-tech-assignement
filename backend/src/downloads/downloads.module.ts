import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module.js';
import { DownloadsController } from './downloads.controller.js';

@Module({
    imports: [MessagesModule],
    controllers: [DownloadsController],
})
export class DownloadsModule {}
