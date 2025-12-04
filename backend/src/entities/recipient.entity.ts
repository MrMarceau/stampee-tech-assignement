import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Message } from './message.entity.js';

export enum RecipientStatus {
    Pending = 'pending',
    Emailed = 'emailed',
    Failed = 'failed',
    Downloaded = 'downloaded',
}

@Entity({ name: 'recipients' })
export class Recipient {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column('char', { length: 36 })
    messageId!: string;

    @ManyToOne(() => Message, (message) => message.recipients, {
        onDelete: 'CASCADE',
    })
    message!: Message;

    @Index()
    @Column('varchar', { length: 255 })
    email!: string;

    @Index({ unique: true })
    @Column('varchar', { length: 255 })
    downloadToken!: string;

    @Column({ type: 'enum', enum: RecipientStatus, default: RecipientStatus.Pending })
    status!: RecipientStatus;

    @Column({ type: 'timestamp' })
    expiresAt!: Date;

    @Column({ type: 'timestamp', nullable: true })
    downloadedAt!: Date | null;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt!: Date;
}
