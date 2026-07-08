import mongoose from 'mongoose';
import { logger } from '@cloudcommerce/common';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/cloudcommerce';

let connected = false;

export async function connectMongo(): Promise<void> {
  if (connected) return;

  await mongoose.connect(MONGO_URI);
  connected = true;
  logger.info('MongoDB connected', { uri: MONGO_URI.replace(/\/\/.*@/, '//<redacted>@') });
}

export async function closeMongo(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
  logger.info('MongoDB disconnected');
}

// Helper to check connection health
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}