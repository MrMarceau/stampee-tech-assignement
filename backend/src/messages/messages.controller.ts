import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Inject,
    Param,
    Post,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import path from 'node:path';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { createMessageSchema, type CreateMessageDto } from './dto/create-message.schema.js';
import { MessagesService } from './messages.service.js';
import type { MessageResponseDto } from './dto/messages.dto.js';
import type { AttachmentDto } from './dto/attachment.dto.js';
import type { MessageResponseDto } from './dto/messages.dto.js';
import type { AttachmentDto } from './dto/attachment.dto.js';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256MB across the brief; enforced again in service
const ALLOWED_EXTENSIONS = new Set([
    '.pdf',
    '.docx',
    '.xlsx',
    '.pptx',
    '.txt',
    '.png',
    '.jpg',
    '.jpeg',
]);

const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new BadRequestException(`File type not allowed: ${ext}`), false);
    }
    cb(null, true);
};

@Controller('messages')
export class MessagesController {
    constructor(@Inject(MessagesService) private readonly messagesService: MessagesService) {}

    @Get(':id')
    async getById(@Param('id') id: string): Promise<MessageResponseDto> {
        return this.messagesService.getMessageById(id);
    }

    @Post()
    @UseInterceptors(
        FilesInterceptor('attachments', MAX_FILES, {
            storage: memoryStorage(),
            fileFilter,
            limits: {
                fileSize: MAX_FILE_SIZE,
                files: MAX_FILES,
            },
        }),
    )
    async create(
        @Body(new ZodValidationPipe(createMessageSchema)) payload: CreateMessageDto,
        @UploadedFiles() files: Express.Multer.File[] = [],
    ): Promise<MessageResponseDto> {
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        if (totalSize > MAX_FILE_SIZE) {
            throw new BadRequestException('Total upload size exceeds 256MB');
        }
        return this.messagesService.createMessage(payload, files);
    }

    @Post(':id/attachments')
    @UseInterceptors(
        FilesInterceptor('attachments', MAX_FILES, {
            storage: memoryStorage(),
            fileFilter,
            limits: {
                fileSize: MAX_FILE_SIZE,
                files: MAX_FILES,
            },
        }),
    )
    async addAttachments(
        @Param('id') id: string,
        @UploadedFiles() files: Express.Multer.File[] = [],
    ): Promise<AttachmentDto[]> {
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        if (totalSize > MAX_FILE_SIZE) {
            throw new BadRequestException('Total upload size exceeds 256MB');
        }

        return this.messagesService.addAttachments(id, files);
    }
}
