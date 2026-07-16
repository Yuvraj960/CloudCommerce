import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import { paymentsRouter } from './routes/payments';
import { healthRouter } from './routes/health';
import { errorHandler } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { migrate } from './db/migrate';
import { closePool } from './config/db';
import { startKafkaConsumer, disconnectKafka } from './config/kafka';

const PORT = parseInt(process.env.PORT ?? '3005', 10);

async function main() {
  // Run migrations
  await migrate();

  // Start Kafka consumer (listens for order_created)
  await startKafkaConsumer();

  const app = express();
  app.use(express.json());

  app.use('/api', paymentsRouter());
  app.use('/', healthRouter);

  // Global error handler — last
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    errorHandler(
      err,
      req as unknown as Parameters<typeof errorHandler>[1],
      res as unknown as Parameters<typeof errorHandler>[2],
      _next
    );
  });

  const server = app.listen(PORT, () => {
    logger.info(`payment-service listening on port ${PORT}`);
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
  logger.error('Failed to start payment-service', { error: err.message });
  process.exit(1);
});