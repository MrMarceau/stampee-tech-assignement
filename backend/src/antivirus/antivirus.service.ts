import { Inject, Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as clamav from 'clamav.js';
import { Readable } from 'stream';

@Injectable()
export class AntivirusService {
    private readonly logger = new Logger(AntivirusService.name);

    constructor(@Inject(ConfigService) private readonly config: ConfigService) {
        if (!this.config) {
            throw new Error('ConfigService not available in AntivirusService');
        }
    }

    async scanBuffer(buffer: Buffer) {
        const host = String(this.config.get('CLAMAV_HOST') ?? 'clamav');
        const port = Number(this.config.get('CLAMAV_PORT') ?? 3310);

        await this.ensureHealthy(host, port);

        const scanner = clamav.createScanner(port, host);
        const stream = Readable.from(buffer);

        return new Promise<void>((resolve, reject) => {
            scanner.scan(stream, (err: Error | null, object: string) => {
                if (err) {
                    this.logger.error(`Scan failed: ${err.message}`);
                    return reject(new ServiceUnavailableException('Virus scan failed'));
                }

                if (object && object.includes('FOUND')) {
                    return reject(new BadRequestException('Virus detected in uploaded file'));
                }

                resolve();
            });
        });
    }

    private async ensureHealthy(host: string, port: number) {
        return new Promise<void>((resolve, reject) => {
            clamav.ping(port, host, 2000, (err) => {
                if (err) {
                    this.logger.error(`ClamAV not reachable: ${err.message}`);
                    reject(new ServiceUnavailableException('Antivirus unavailable'));
                } else {
                    resolve();
                }
            });
        });
    }
}
