import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { AuthRequest, requireAuth } from '../middleware/auth';
import {
  ok,
  ValidationError,
  NotFoundError,
  OrderStatus,
  type OrderItem,
  type ShippingAddress,
} from '@cloudcommerce/common';
import { publishOrderCreated } from '../config/kafka';

const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        price: z.number().int().nonnegative(),
      })
    )
    .min(1, 'Order must have at least one item'),
  shippingAddress: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().length(2),
  }),
});

interface OrderRow {
  id: string;
  user_id: string;
  items: OrderItem[];
  total_amount: number;
  status: string;
  shipping_address: ShippingAddress;
  created_at: string;
  updated_at: string;
}

function rowToResponse(row: OrderRow) {
  return {
    id: row.id,
    userId: row.user_id,
    items: row.items,
    totalAmount: Number(row.total_amount),
    status: row.status,
    shippingAddress: row.shipping_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** POST /api/orders — create order, publish order_created to Kafka */
export async function handleCreateOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError('Invalid input', parsed.error.flatten()));

  const { items, shippingAddress } = parsed.data;
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const row = await queryOne<OrderRow>(
    `INSERT INTO orders (user_id, items, total_amount, status, shipping_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      req.user.sub,
      JSON.stringify(items),
      totalAmount,
      OrderStatus.Created,
      JSON.stringify(shippingAddress),
    ]
  );
  if (!row) return next(new ValidationError('Failed to create order'));

  const order = rowToResponse(row);

  // Publish to Kafka — Payment and Notification services consume this
  await publishOrderCreated({
    orderId: row.id,
    userId: req.user.sub,
    items,
    totalAmount,
    createdAt: row.created_at,
  });

  res.status(201).json(ok(order));
}

/** GET /api/orders — list current user's orders */
export async function handleListOrders(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const rows = await query<OrderRow>(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.sub]
  );

  res.json(ok({ orders: rows.map(rowToResponse) }));
}

/** GET /api/orders/:id — get single order (owner only) */
export async function handleGetOrder(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const row = await queryOne<OrderRow>(
    `SELECT * FROM orders WHERE id = $1`,
    [req.params.id]
  );

  if (!row) return next(new NotFoundError('Order'));
  if (row.user_id !== req.user.sub) return next(new NotFoundError('Order'));

  res.json(ok(rowToResponse(row)));
}

/** Mount all order routes */
export function ordersRouter() {
  const router = Router();
  router.post('/orders', requireAuth, handleCreateOrder);
  router.get('/orders', requireAuth, handleListOrders);
  router.get('/orders/:id', requireAuth, handleGetOrder);
  return router;
}