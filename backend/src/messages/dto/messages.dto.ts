import { MessageStatus } from '../../entities/message.entity.js';
import { RecipientStatus } from '../../entities/recipient.entity.js';
import type { AttachmentDto } from './attachment.dto.js';

export interface MessageRecipientDto {
    email: string;
    status: RecipientStatus;
    downloadToken: string;
    expiresAt: Date;
    downloadedAt: Date | null;
}

export interface MessageResponseDto {
    id: string;
    subject: string;
    body: string;
    status: MessageStatus;
    createdAt: Date;
    recipients: MessageRecipientDto[];
    attachments: AttachmentDto[];
}
