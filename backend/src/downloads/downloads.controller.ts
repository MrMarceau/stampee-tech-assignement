import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MessagesService } from '../messages/messages.service.js';

@Controller('download')
export class DownloadsController {
    constructor(@Inject(MessagesService) private readonly messagesService: MessagesService) {}

    @Get(':token')
    async download(@Param('token') token: string, @Res() res: Response) {
        await this.messagesService.streamDownload(token, res);
    }
}
