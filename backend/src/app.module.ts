import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { envSchema, EnvVars } from './config/env.js';
import { MessagesModule } from './messages/messages.module.js';
import { DownloadsModule } from './downloads/downloads.module.js';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            validate: (config) => envSchema.parse(config),
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService<EnvVars, true>) => {
                const isTest = config.get('NODE_ENV', { infer: true }) === 'test';
                return {
                    type: 'mysql',
                    host: config.get('DB_HOST', { infer: true }),
                    port: config.get('DB_PORT', { infer: true }),
                    username: config.get('DB_USER', { infer: true }),
                    password: config.get('DB_PASSWORD', { infer: true }),
                    database: isTest
                        ? config.get('DB_TEST_NAME', { infer: true })
                        : config.get('DB_NAME', { infer: true }),
                    synchronize: config.get('DB_SYNC', { infer: true }),
                    autoLoadEntities: true,
                    retryAttempts: 10,
                    retryDelay: 2000,
                };
            },
        }),
        MessagesModule,
        DownloadsModule,
    ],
    controllers: [AppController],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(RateLimitMiddleware).forRoutes('*');
    }
}
