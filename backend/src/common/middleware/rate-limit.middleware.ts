import { Inject, Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import type { RateLimitBucket } from '../../types/rate-limit.js';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
    private readonly buckets = new Map<string, RateLimitBucket>();
    private readonly windowMs: number;
    private readonly maxRequests: number;

    constructor(@Inject(ConfigService) config: ConfigService) {
        this.windowMs = Number(config.get('RATE_LIMIT_WINDOW_MS') ?? 60_000);
        this.maxRequests = Number(config.get('RATE_LIMIT_MAX') ?? 100);
    }

    use(req: Request, _res: Response, next: NextFunction) {
        const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
        const now = Date.now();
        const bucket = this.buckets.get(key) ?? { count: 0, windowStart: now };

        if (now - bucket.windowStart > this.windowMs) {
            bucket.count = 0;
            bucket.windowStart = now;
        }

        bucket.count += 1;
        this.buckets.set(key, bucket);

        if (bucket.count > this.maxRequests) {
            throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }

        next();
    }
}
