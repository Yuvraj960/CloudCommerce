import { Router, Request, Response } from 'express';
import { isKafkaConnected } from '../config/kafka';

export function healthRouter() {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const kafka = isKafkaConnected();
    const healthy = kafka;
    res.status(healthy ? 200 : 503).json({
      service: 'notification-service',
      healthy,
      checks: { kafka: kafka },
    });
  });

  return router;
}