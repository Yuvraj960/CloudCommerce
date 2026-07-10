import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getRedisClient } from '../config/redis';
import { AddToCartSchema, UpdateCartItemSchema, type CartItem } from '@cloudcommerce/common';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { ValidationError, NotFoundError, ok } from '@cloudcommerce/common';

const CART_KEY_PREFIX = 'cart:';

/** Redis key for a user's cart */
function cartKey(userId: string): string {
  return `${CART_KEY_PREFIX}${userId}`;
}

/** GET /api/cart */
export async function handleGetCart(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const redis = getRedisClient();
  const data = await redis.hgetall(cartKey(req.user.sub));

  const items: CartItem[] = Object.entries(data).map(([productId, qty]) => ({
    productId,
    quantity: parseInt(qty, 10),
  }));

  res.json(ok({ userId: req.user.sub, items }));
}

/** POST /api/cart/items */
export async function handleAddToCart(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const parsed = AddToCartSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError('Invalid input', parsed.error.flatten()));

  const { productId, quantity } = parsed.data;
  const redis = getRedisClient();
  const key = cartKey(req.user.sub);

  // Increment quantity if item already exists, else set it
  await redis.hincrby(key, productId, quantity);

  // Set TTL of 7 days on cart
  await redis.expire(key, 7 * 24 * 60 * 60);

  // Return updated cart item count or the whole cart
  const newQty = await redis.hget(key, productId);
  res.status(201).json(ok({ productId, quantity: parseInt(newQty ?? '0', 10) }));
}

/** PATCH /api/cart/items/:productId */
export async function handleUpdateCartItem(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const parsed = UpdateCartItemSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError('Invalid input', parsed.error.flatten()));

  const { quantity } = parsed.data;
  const { productId } = req.params;
  const redis = getRedisClient();
  const key = cartKey(req.user.sub);

  // Check item exists
  const existing = await redis.hget(key, productId);
  if (existing === null) return next(new NotFoundError('Cart item'));

  // quantity=0 means remove
  if (quantity === 0) {
    await redis.hdel(key, productId);
    return res.json(ok({ productId, quantity: 0, removed: true }));
  }

  await redis.hset(key, productId, quantity);
  res.json(ok({ productId, quantity }));
}

/** DELETE /api/cart/items/:productId */
export async function handleRemoveFromCart(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const { productId } = req.params;
  const redis = getRedisClient();
  const key = cartKey(req.user.sub);

  const existed = await redis.hget(key, productId);
  if (existed === null) return next(new NotFoundError('Cart item'));

  await redis.hdel(key, productId);
  res.json(ok({ productId, removed: true }));
}

/** POST /api/cart/clear */
export async function handleClearCart(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.sub) return next(new ValidationError('User ID not found in token'));

  const redis = getRedisClient();
  const key = cartKey(req.user.sub);
  await redis.del(key);
  res.json(ok({ cleared: true }));
}

/** Mount all cart routes */
export function cartRouter() {
  const router = Router();

  router.get('/cart', requireAuth, handleGetCart);
  router.post('/cart/items', requireAuth, handleAddToCart);
  router.patch('/cart/items/:productId', requireAuth, handleUpdateCartItem);
  router.delete('/cart/items/:productId', requireAuth, handleRemoveFromCart);
  router.post('/cart/clear', requireAuth, handleClearCart);

  return router;
}