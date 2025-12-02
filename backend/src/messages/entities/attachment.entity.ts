import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Message } from './message.entity.js';

@Entity({ name: 'attachments' })
export class Attachment {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column('char', { length: 36 })
    messageId!: string;

    @ManyToOne(() => Message, (message) => message.attachments, {
        onDelete: 'CASCADE',
    })
    message!: Message;

    @Column('varchar', { length: 255 })
    originalName!: string;

    @Column('varchar', { length: 255 })
    storedName!: string;

    @Column('varchar', { length: 255 })
    mimeType!: string;

    @Column({ type: 'bigint' })
    size!: number;

    @Column('varchar', { length: 500 })
    path!: string;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt!: Date;
}
