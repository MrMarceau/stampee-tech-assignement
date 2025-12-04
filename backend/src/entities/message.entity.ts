import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Attachment } from './attachment.entity.js';
import { Recipient } from './recipient.entity.js';

export enum MessageStatus {
    Draft = 'draft',
    Queued = 'queued',
    Sent = 'sent',
    Failed = 'failed',
    Received = 'received',
}

@Entity({ name: 'messages' })
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('varchar', { length: 200 })
    subject!: string;

    @Column('text')
    body!: string;

    @Column({ type: 'enum', enum: MessageStatus, default: MessageStatus.Queued })
    status!: MessageStatus;

    @OneToMany(() => Recipient, (recipient) => recipient.message, {
        cascade: ['insert'],
    })
    recipients!: Recipient[];

    @OneToMany(() => Attachment, (attachment) => attachment.message, {
        cascade: ['insert'],
    })
    attachments!: Attachment[];

    @CreateDateColumn({ type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt!: Date;
}
