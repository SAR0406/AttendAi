import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { meetingsRouter } from './routes/meetings';
import { identityRouter } from './routes/identity';
import { webhooksRouter } from './routes/webhooks';
import { reportsRouter } from './routes/reports';
import { redis } from './queue';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
});

async function bootstrap() {
  // Security middleware
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
  });

  // Routes
  await app.register(meetingsRouter, { prefix: '/api/meetings' });
  await app.register(identityRouter, { prefix: '/api/identity' });
  await app.register(webhooksRouter, { prefix: '/api/webhooks' });
  await app.register(reportsRouter, { prefix: '/api/reports' });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Data deletion endpoint (Zoom Marketplace + GDPR requirement)
  app.delete('/api/user-data', async (req, reply) => {
    const { userId, orgId } = req.body as { userId?: string; orgId?: string };
    if (!userId && !orgId) {
      return reply.status(400).send({ error: 'userId or orgId required' });
    }
    // Enqueue deletion job so it's processed asynchronously
    const { deletionQueue } = await import('./queue');
    await deletionQueue.add('delete-user-data', { userId, orgId });
    return reply.status(202).send({ message: 'Data deletion scheduled' });
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`AttendAi backend listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});

export { app };
