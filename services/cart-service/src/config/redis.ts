import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

let connected = false;
let client: Redis | null = null;

export async function connectRedis(): Promise<Redis> {
  if (connected && client) return client;

  client = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on('connect', () => {
    connected = true;
  });
  client.on('error', () => {
    connected = false;
  });

  await client.connect();
  connected = true;
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = null;
  connected = false;
}

export function isRedisConnected(): boolean {
  return connected && client !== null && client.status === 'ready';
}

export function getRedisClient(): Redis {
  if (!client) throw new Error('Redis client not initialised. Call connectRedis() first.');
  return client;
}