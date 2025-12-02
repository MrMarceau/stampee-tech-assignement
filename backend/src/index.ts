import Fastify from 'fastify';
import cors from '@fastify/cors';

const fastify = Fastify({
    logger: true,
});

await fastify.register(cors, {
    origin: true,
});


fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});


fastify.get('/api/hello', async () => {
    return { message: 'Hello World from Stampee!' };
});


const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '3000', 10);
        const host = process.env.HOST || '0.0.0.0';

        await fastify.listen({ port, host });
        console.log(`Server is running on http://${host}:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();