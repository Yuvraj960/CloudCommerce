import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
import express from 'express';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { errorHandler } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { migrate } from './db/migrate';
import { closePool } from './config/db';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  // Run migrations
  await migrate();

  const app = express();

  app.use(express.json());

  // Routes
  app.use('/api/auth', authRouter());
  app.use('/', healthRouter());

  // Global error handler (must be last)
  app.use(errorHandler as express.ErrorRequestHandler);

  const server = app.listen(PORT, () => {
    logger.info(`auth-service listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start auth-service', { error: err.message });
  process.exit(1);
});