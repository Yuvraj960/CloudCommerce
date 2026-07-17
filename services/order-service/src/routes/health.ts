import { Router, Request, Response } from 'express';
import { ok } from '@cloudcommerce/common';
import { pool } from '../config/db';

export function healthRouter() {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.json(ok({ status: 'healthy', service: 'order-service' }));
    } catch {
      res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Postgres query failed' },
      });
    }
  });

  return router;
}