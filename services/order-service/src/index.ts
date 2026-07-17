import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import { ordersRouter } from './routes/orders';
import { healthRouter } from './routes/health';
import { errorHandler, metricsHandler } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { migrate } from './db/migrate';
import { closePool } from './config/db';
import { startKafkaConsumer, disconnectKafka } from './config/kafka';

const PORT = parseInt(process.env.PORT ?? '3004', 10);

async function main() {
  // Run migrations
  await migrate();

  // Start Kafka consumer in background — topics may not exist yet (created on first produce).
  // Do NOT await: HTTP/Health endpoints must start immediately regardless of Kafka state.
  startKafkaConsumer().catch(err => {
    logger.warn('startKafkaConsumer raised (non-fatal)', { error: String(err) });
  });

  const app = express();
  app.use(express.json());

  app.use('/api', ordersRouter());
  app.use('/', healthRouter());
  app.use('/metrics', metricsHandler());

  // Global error handler — last
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    errorHandler(
      err,
      req as unknown as Parameters<typeof errorHandler>[1],
      res as unknown as Parameters<typeof errorHandler>[2],
      next
    );
  });

  const server = app.listen(PORT, () => {
    logger.info(`order-service listening on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectKafka();
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start order-service', { error: err.message });
  process.exit(1);
});