import path from 'node:path';
import { z } from 'zod';

export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),

    APP_NAME: z.string().default('stampee-tech-assignement'),
    APP_BASE_URL: z.string().default('http://localhost:3000'),
    DEFAULT_SENDER_EMAIL: z.string().email().default('no-reply@stampee-tech-assignement.test'),

    DB_HOST: z.string().default('mysql'),
    DB_PORT: z.coerce.number().default(3306),
    DB_USER: z.string().default('stampee'),
    DB_PASSWORD: z.string().default('stampee'),
    DB_NAME: z.string().default('stampee'),
    DB_SYNC: z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    DB_TEST_NAME: z.string().default('stampee_test'),

    REDIS_HOST: z.string().default('redis'),
    REDIS_PORT: z.coerce.number().default(6379),

    SMTP_HOST: z.string().default('maildev'),
    SMTP_PORT: z.coerce.number().default(1025),

    CLAMAV_HOST: z.string().default('clamav'),
    CLAMAV_PORT: z.coerce.number().default(3310),

    STORAGE_PATH: z.string().default(path.join(process.cwd(), 'uploads')),
    DOWNLOAD_TTL_HOURS: z.coerce.number().default(48),
    MAX_FILES_PER_MESSAGE: z.coerce.number().default(10),
    MAX_TOTAL_UPLOAD_BYTES: z.coerce.number().default(256 * 1024 * 1024),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    CACHE_ENABLED: z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    CACHE_TTL_SECONDS: z.coerce.number().default(60),
});

export type EnvVars = z.infer<typeof envSchema>;
