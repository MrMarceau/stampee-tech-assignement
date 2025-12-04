import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
    name = 'InitSchema1700000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE messages (
                id char(36) NOT NULL PRIMARY KEY,
                subject varchar(200) NOT NULL,
                body text NOT NULL,
                status ENUM('draft','queued','sent','failed','received') NOT NULL DEFAULT 'queued',
                createdAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updatedAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
            )
        `);

        await queryRunner.query(`
            CREATE TABLE recipients (
                id char(36) NOT NULL PRIMARY KEY,
                messageId char(36) NOT NULL,
                email varchar(255) NOT NULL,
                downloadToken varchar(255) NOT NULL,
                status ENUM('pending','emailed','failed','downloaded') NOT NULL DEFAULT 'pending',
                expiresAt timestamp(6) NOT NULL,
                downloadedAt timestamp(6) NULL,
                createdAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT fk_recipient_message FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE,
                INDEX idx_recipient_message (messageId),
                INDEX idx_recipient_email (email),
                UNIQUE KEY uq_recipient_download_token (downloadToken)
            )
        `);

        await queryRunner.query(`
            CREATE TABLE attachments (
                id char(36) NOT NULL PRIMARY KEY,
                messageId char(36) NOT NULL,
                originalName varchar(255) NOT NULL,
                storedName varchar(255) NOT NULL,
                mimeType varchar(255) NOT NULL,
                size bigint NOT NULL,
                path varchar(500) NOT NULL,
                createdAt timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                CONSTRAINT fk_attachment_message FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE,
                INDEX idx_attachment_message (messageId)
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS attachments');
        await queryRunner.query('DROP TABLE IF EXISTS recipients');
        await queryRunner.query('DROP TABLE IF EXISTS messages');
    }
}
