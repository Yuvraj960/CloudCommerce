import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne } from '../config/db';
import { AuthRequest, requireAuth } from '../middleware/auth';
import {
  ok,
  ValidationError,
  PaymentStatus,
} from '@cloudcommerce/common';
import { publishPaymentSuccess, publishPaymentFailed } from '../config/kafka';

const SimulatePaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
});

interface PaymentRow {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  payment_id: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowToResponse(row: PaymentRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    amount: Number(row.amount),
    status: row.status,
    paymentId: row.payment_id ?? undefined,
    failedReason: row.failed_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** POST /api/payments/simulate — simulates a payment (for manual testing) */
export async function handleSimulatePayment(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const parsed = SimulatePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError('Invalid input', parsed.error.flatten()));
  }

  const { orderId, amount } = parsed.data;
  const now = new Date().toISOString();

  // Deterministic simulation: amounts >= $1000 (100000 cents) fail
  const succeeds = amount < 100_000;

  if (succeeds) {
    const paymentId = `pay_${Date.now()}_${orderId.slice(0, 8)}`;
    const row = await queryOne<PaymentRow>(
      `INSERT INTO payments (order_id, amount, status, payment_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
      [orderId, amount, PaymentStatus.Success, paymentId, now]
    );
    if (!row) return next(new ValidationError('Failed to create payment record'));

    await publishPaymentSuccess({ orderId, paymentId, amount, paidAt: now });
    res.status(201).json(ok(rowToResponse(row)));
  } else {
    const reason = 'Amount exceeds risk threshold';
    const row = await queryOne<PaymentRow>(
      `INSERT INTO payments (order_id, amount, status, failed_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
      [orderId, amount, PaymentStatus.Failed, reason, now]
    );
    if (!row) return next(new ValidationError('Failed to create payment record'));

    await publishPaymentFailed({ orderId, reason, failedAt: now });
    res.status(201).json(ok(rowToResponse(row)));
  }
}

/** GET /api/payments/:orderId — get payment record by order ID */
export async function handleGetPayment(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { orderId } = req.params;
  const row = await queryOne<PaymentRow>(
    `SELECT * FROM payments WHERE order_id = $1`,
    [orderId]
  );
  if (!row) return next(new ValidationError('Payment not found'));
  res.json(ok(rowToResponse(row)));
}

/** Mount payment routes */
export function paymentsRouter() {
  const router = Router();
  router.post('/payments/simulate', requireAuth, handleSimulatePayment);
  router.get('/payments/:orderId', requireAuth, handleGetPayment);
  return router;
}