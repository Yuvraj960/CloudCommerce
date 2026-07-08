import { Router, Request, Response } from 'express';
import { ok } from '@cloudcommerce/common';
import { isMongoConnected } from '../config/db';

export function healthRouter() {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    if (!isMongoConnected()) {
      return res.status(503).json({
        success: false,
        error: { code: 'UNHEALTHY', message: 'MongoDB not connected' },
      });
    }
    return res.json(ok({ status: 'healthy', service: 'product-service' }));
  });

  return router;
}