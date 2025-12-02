import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { EnvVars } from '../config/env.js';
import { Message } from './entities/message.entity.js';
import { Recipient } from './entities/recipient.entity.js';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly transporter: Transporter;
    private readonly fromEmail: string;
    private readonly appBaseUrl: string;

    constructor(@Inject(ConfigService) private readonly config: ConfigService<EnvVars, true>) {
        if (!this.config) {
            throw new Error('ConfigService not available in MailService');
        }

        this.fromEmail = this.config.get('DEFAULT_SENDER_EMAIL', { infer: true });
        this.appBaseUrl = this.config.get('APP_BASE_URL', { infer: true });

        this.transporter = nodemailer.createTransport({
            host: this.config.get('SMTP_HOST', { infer: true }),
            port: this.config.get('SMTP_PORT', { infer: true }),
            secure: false,
            tls: {
                rejectUnauthorized: false,
            },
        });
    }

    async sendMessageNotification(message: Message, recipient: Recipient) {
        const downloadLink = `${this.appBaseUrl}/api/download/${recipient.downloadToken}`;

        await this.transporter.sendMail({
            from: this.fromEmail,
            to: recipient.email,
            subject: `[${this.config.get('APP_NAME', { infer: true })}] ${message.subject}`,
            text: `${message.body}\n\nTélécharger le message et les pièces jointes: ${downloadLink}`,
            html: `<p>${message.body}</p><p><a href="${downloadLink}">Télécharger le message et les pièces jointes</a></p>`,
        });

        this.logger.log(`Enqueued email for ${recipient.email} with download link ${downloadLink}`);
    }
}
