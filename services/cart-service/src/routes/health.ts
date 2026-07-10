import { Router, Request, Response } from 'express';
import { getRedisClient, isRedisConnected } from '../config/redis';
import { ok } from '@cloudcommerce/common';

export function healthRouter() {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    if (!isRedisConnected()) {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not connected' },
      });
    }

    try {
      const redis = getRedisClient();
      await redis.ping();
      res.json(ok({ status: 'healthy', service: 'cart-service' }));
    } catch {
      res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis ping failed' },
      });
    }
  });

  return router;
}