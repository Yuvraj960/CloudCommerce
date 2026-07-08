import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
import express, { Router } from 'express';
import multer from 'multer';
import { productRouter } from './routes/products';
import { healthRouter } from './routes/health';
import { errorHandler } from '@cloudcommerce/common';
import { logger } from '@cloudcommerce/common';
import { connectMongo, closeMongo } from './config/db';

const PORT = parseInt(process.env.PORT ?? '3002', 10);

// In-memory storage for multer — keeps buffer in RAM for S3 upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function main() {
  await connectMongo();

  const app = express();

  app.use(express.json());
  app.use('/api/products', upload.single('image'), productRouter());
  app.use('/', healthRouter());

  // Global error handler — last
  // Cast to handle Express's overload; keep it simple
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    errorHandler(err, req as unknown as Parameters<typeof errorHandler>[1], res as unknown as Parameters<typeof errorHandler>[2], next);
  });

  const server = app.listen(PORT, () => {
    logger.info(`product-service listening on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await closeMongo();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start product-service', { error: err.message });
  process.exit(1);
});