import { Router } from 'express';
import { isPoolHealthy } from '../config/db';
import { logger } from '@cloudcommerce/common';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const db = await isPoolHealthy();
  const healthy = db;
  res.status(healthy ? 200 : 503).json({
    service: 'payment-service',
    healthy,
    checks: { database: db },
  });
});