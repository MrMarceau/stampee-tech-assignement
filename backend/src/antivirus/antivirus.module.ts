import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AntivirusService } from './antivirus.service.js';

@Module({
    imports: [ConfigModule],
    providers: [AntivirusService],
    exports: [AntivirusService],
})
export class AntivirusModule {}
