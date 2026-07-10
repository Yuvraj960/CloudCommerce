import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import { cartRouter } from './routes/cart';
import { healthRouter } from './routes/health';
import { errorHandler } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { connectRedis, closeRedis } from './config/redis';

const PORT = parseInt(process.env.PORT ?? '3003', 10);

async function main() {
  await connectRedis();

  const app = express();
  app.use(express.json());

  app.use('/api', cartRouter());  // cart endpoints under /api/cart
  app.use('/', healthRouter());   // health at /

  // Global error handler — last
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    errorHandler(err, req as unknown as Parameters<typeof errorHandler>[1], res as unknown as Parameters<typeof errorHandler>[2], next);
  });

  const server = app.listen(PORT, () => {
    logger.info(`cart-service listening on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await closeRedis();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start cart-service', { error: err.message });
  process.exit(1);
});