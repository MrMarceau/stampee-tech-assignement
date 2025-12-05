import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EnvVars } from '../config/env.js';

@Injectable()
export class CacheService implements OnModuleDestroy {
    private readonly logger = new Logger(CacheService.name);
    private readonly client: Redis | null;
    private readonly enabled: boolean;
    private readonly ttlSeconds: number;

    constructor(@Inject(ConfigService) private readonly config: ConfigService<EnvVars, true>) {
        const nodeEnv = this.config.get('NODE_ENV', { infer: true });
        const enabledFlag = this.config.get('CACHE_ENABLED', { infer: true });
        this.ttlSeconds = this.config.get('CACHE_TTL_SECONDS', { infer: true });

        const isEnabled = enabledFlag && nodeEnv !== 'test';
        this.enabled = isEnabled;

        const host = this.config.get('REDIS_HOST', { infer: true });
        const port = this.config.get('REDIS_PORT', { infer: true });

        if (isEnabled) {
            this.client = new Redis({ host, port });
            this.client.on('error', (err) => {
                this.logger.error(`Redis cache error: ${err.message}`);
            });
        } else {
            this.client = null;
            this.logger.log('Cache disabled (CACHE_ENABLED=false or NODE_ENV=test)');
        }
    }

    async getJSON<T>(key: string): Promise<T | null> {
        if (!this.enabled || !this.client) return null;
        try {
            const raw = await this.client.get(key);
            return raw ? (JSON.parse(raw) as T) : null;
        } catch (err) {
            this.logger.warn(`Cache get failed for key=${key}: ${(err as Error).message}`);
            return null;
        }
    }

    async setJSON<T>(key: string, value: T, ttlSeconds = this.ttlSeconds) {
        if (!this.enabled || !this.client) return;
        try {
            await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        } catch (err) {
            this.logger.warn(`Cache set failed for key=${key}: ${(err as Error).message}`);
        }
    }

    async del(key: string) {
        if (!this.enabled || !this.client) return;
        try {
            await this.client.del(key);
        } catch (err) {
            this.logger.warn(`Cache del failed for key=${key}: ${(err as Error).message}`);
        }
    }

    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit();
        }
    }
}
