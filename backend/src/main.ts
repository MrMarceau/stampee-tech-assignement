import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { EnvVars } from './config/env.js';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        cors: true,
    });

    const config = app.get<ConfigService<EnvVars, true>>(ConfigService);

    app.setGlobalPrefix('api', {
        exclude: ['health'],
    });

    const port = config.get('PORT', { infer: true });
    const host = '0.0.0.0';

    await app.listen(port, host);
    // eslint-disable-next-line no-console
    console.log(`Server ready on http://${host}:${port}`);
}

void bootstrap();
