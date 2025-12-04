import dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Message } from './entities/message.entity.js';
import { Recipient } from './entities/recipient.entity.js';
import { Attachment } from './entities/attachment.entity.js';
import { envSchema } from './config/env.js';

dotenv.config({ path: '.env' });

const env = envSchema.parse(process.env);
const dbName = env.NODE_ENV === 'test' ? env.DB_TEST_NAME : env.DB_NAME;

export default new DataSource({
    type: 'mysql',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: dbName,
    entities: [Message, Recipient, Attachment],
    migrations: ['dist/migrations/*.js'],
    synchronize: false,
});
