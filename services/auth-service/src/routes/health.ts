import { Router, Request, Response } from 'express';
import { pool } from '../config/db';
import { ok } from '@cloudcommerce/common';

export function healthRouter() {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      // Check DB connectivity
      await pool.query('SELECT 1');
      return res.json(ok({ status: 'healthy', service: 'auth-service' }));
    } catch {
      return res.status(503).json({
        success: false,
        error: { code: 'UNHEALTHY', message: 'Service unavailable — db check failed' },
      });
    }
  });

  return router;
}