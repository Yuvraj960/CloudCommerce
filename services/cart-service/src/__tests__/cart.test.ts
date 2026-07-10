/**
 * Cart Service — Route Handler Unit Tests
 * Tests auth guard, validation, and cart operations.
 * Mocks Redis client so no real Redis needed.
 */

// ─── Mock Redis (must be declared before jest.mock) ─────────────────────────
const mockHgetall = jest.fn();
const mockHget = jest.fn();
const mockHset = jest.fn();
const mockHincrby = jest.fn();
const mockHdel = jest.fn();
const mockExpire = jest.fn();
const mockDel = jest.fn();

jest.mock('../config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    hgetall: mockHgetall,
    hget: mockHget,
    hset: mockHset,
    hincrby: mockHincrby,
    hdel: mockHdel,
    expire: mockExpire,
    del: mockDel,
  })),
  isRedisConnected: jest.fn(() => true),
}));

jest.mock('../middleware/auth', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {
  handleGetCart,
  handleAddToCart,
  handleUpdateCartItem,
  handleRemoveFromCart,
  handleClearCart,
} from '../routes/cart';
import type { AuthRequest } from '../middleware/auth';

// ─── Helpers ────────────────────────────────────────────────────────────────
const mockReq = (overrides: Record<string, unknown> = {}): AuthRequest =>
  ({ params: {}, query: {}, body: {}, user: { sub: 'user-1', role: 'customer' }, ...overrides } as unknown as AuthRequest);

const mockRes = () => {
  const r: Record<string, jest.Mock> = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r as unknown as Parameters<typeof handleGetCart>[1];
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── handleGetCart ───────────────────────────────────────────────────────────
describe('handleGetCart', () => {
  it('returns empty items array when cart is empty', async () => {
    mockHgetall.mockResolvedValueOnce({});

    const res = mockRes();
    await handleGetCart(mockReq(), res, jest.fn());

    expect(mockHgetall).toHaveBeenCalledWith('cart:user-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { userId: 'user-1', items: [] } })
    );
  });

  it('returns cart items mapped from Redis hash', async () => {
    mockHgetall.mockResolvedValueOnce({ 'product-1': '3', 'product-2': '7' });

    const res = mockRes();
    await handleGetCart(mockReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'user-1',
          items: [
            { productId: 'product-1', quantity: 3 },
            { productId: 'product-2', quantity: 7 },
          ],
        },
      })
    );
  });

  it('passes 400 when user.sub is missing', () => {
    const badUser = { sub: '', role: 'customer' } as unknown as never;
    const res = mockRes();
    const next = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleGetCart(mockReq({ user: badUser } as any), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── handleAddToCart ─────────────────────────────────────────────────────────
describe('handleAddToCart', () => {
  it('adds item with hincrby and sets 7-day TTL', async () => {
    mockHincrby.mockResolvedValueOnce(3);
    mockHget.mockResolvedValueOnce('3');
    mockExpire.mockResolvedValueOnce(1);

    const res = mockRes();
    await handleAddToCart(
      mockReq({ body: { productId: 'p1', quantity: 3 } }),
      res,
      jest.fn()
    );

    expect(mockHincrby).toHaveBeenCalledWith('cart:user-1', 'p1', 3);
    expect(mockExpire).toHaveBeenCalledWith('cart:user-1', 7 * 24 * 60 * 60);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { productId: 'p1', quantity: 3 } })
    );
  });

  it('passes 400 for negative quantity', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleAddToCart(
      mockReq({ body: { productId: 'p1', quantity: -1 } }),
      res, next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('passes 400 for missing productId', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleAddToCart(
      mockReq({ body: { quantity: 2 } }),
      res, next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── handleUpdateCartItem ─────────────────────────────────────────────────────
describe('handleUpdateCartItem', () => {
  it('sets new quantity when item exists', async () => {
    mockHget.mockResolvedValueOnce('5');
    mockHset.mockResolvedValueOnce(1);

    const res = mockRes();
    await handleUpdateCartItem(
      mockReq({ params: { productId: 'p1' }, body: { quantity: 10 } }),
      res, jest.fn()
    );

    expect(mockHset).toHaveBeenCalledWith('cart:user-1', 'p1', 10);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { productId: 'p1', quantity: 10 } })
    );
  });

  it('deletes item when quantity is 0', async () => {
    mockHget.mockResolvedValueOnce('3');
    mockHdel.mockResolvedValueOnce(1);

    const res = mockRes();
    await handleUpdateCartItem(
      mockReq({ params: { productId: 'p1' }, body: { quantity: 0 } }),
      res, jest.fn()
    );

    expect(mockHdel).toHaveBeenCalledWith('cart:user-1', 'p1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { productId: 'p1', quantity: 0, removed: true } })
    );
  });

  it('returns 404 when item not in cart', async () => {
    mockHget.mockResolvedValueOnce(null);

    const res = mockRes();
    const next = jest.fn();
    await handleUpdateCartItem(
      mockReq({ params: { productId: 'nonexistent' }, body: { quantity: 5 } }),
      res, next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ─── handleRemoveFromCart ─────────────────────────────────────────────────────
describe('handleRemoveFromCart', () => {
  it('deletes item and returns removed:true', async () => {
    mockHget.mockResolvedValueOnce('2');
    mockHdel.mockResolvedValueOnce(1);

    const res = mockRes();
    await handleRemoveFromCart(
      mockReq({ params: { productId: 'p1' } }),
      res, jest.fn()
    );

    expect(mockHdel).toHaveBeenCalledWith('cart:user-1', 'p1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { productId: 'p1', removed: true } })
    );
  });

  it('returns 404 when item not in cart', async () => {
    mockHget.mockResolvedValueOnce(null);

    const res = mockRes();
    const next = jest.fn();
    await handleRemoveFromCart(
      mockReq({ params: { productId: 'nonexistent' } }),
      res, next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ─── handleClearCart ─────────────────────────────────────────────────────────
describe('handleClearCart', () => {
  it('deletes cart key and returns cleared:true', async () => {
    mockDel.mockResolvedValueOnce(1);

    const res = mockRes();
    await handleClearCart(mockReq(), res, jest.fn());

    expect(mockDel).toHaveBeenCalledWith('cart:user-1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cleared: true } })
    );
  });
});

// ─── Schema validation (pure — no Redis needed) ──────────────────────────────
describe('CartInputSchema / AddToCartSchema', () => {
  const { AddToCartSchema, UpdateCartItemSchema, CartItemSchema } = require('@cloudcommerce/common');

  it('accepts positive quantity', () => {
    expect(AddToCartSchema.safeParse({ productId: 'p1', quantity: 3 }).success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const result = AddToCartSchema.safeParse({ productId: 'p1', quantity: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero quantity in AddToCartSchema', () => {
    expect(AddToCartSchema.safeParse({ productId: 'p1', quantity: 0 }).success).toBe(false);
  });

  it('accepts zero quantity in UpdateCartItemSchema', () => {
    expect(UpdateCartItemSchema.safeParse({ quantity: 0 }).success).toBe(true);
  });

  it('rejects missing productId', () => {
    expect(AddToCartSchema.safeParse({ quantity: 1 }).success).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    expect(AddToCartSchema.safeParse({ productId: 'p1', quantity: 1.5 }).success).toBe(false);
  });
});