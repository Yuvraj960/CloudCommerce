import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import { healthRouter } from './routes/health';
import { errorHandler, metricsHandler } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { startKafkaConsumer, disconnectKafka } from './config/kafka';

const PORT = parseInt(process.env.PORT ?? '3006', 10);

async function main() {
  // Start Kafka consumer in background — topics may not exist yet (created on first produce).
  // Do NOT await: Health endpoint must start immediately regardless of Kafka state.
  startKafkaConsumer().catch(err => {
    logger.warn('startKafkaConsumer raised (non-fatal)', { error: String(err) });
  });

  const app = express();
  app.use(express.json());

  app.use('/', healthRouter());
  app.use('/metrics', metricsHandler());

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
    logger.info(`notification-service listening on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectKafka();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start notification-service', { error: err.message });
  process.exit(1);
});