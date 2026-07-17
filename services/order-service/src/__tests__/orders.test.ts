/**
 * Order Service — Route Handler Unit Tests
 * Tests order creation, listing, retrieval, and Kafka publishing.
 * Mocks pg Pool and Kafka client so no real DB/Kafka needed.
 */

// ─── Mock functions (declared before jest.mock so factory can reference them) ─
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockPublish = jest.fn();
const mockVerify = jest.fn();

jest.mock('@cloudcommerce/common', () => {
  const actual = jest.requireActual('@cloudcommerce/common') as Record<string, unknown>;
  return {
    ...actual,
    // Auth
    verifyAccessToken: (...args: unknown[]) => mockVerify(...args),
    errorHandler: jest.fn(),
    logger: { info: jest.fn(), error: jest.fn() },
    // Kafka (override publishEvent)
    publishEvent: (...args: unknown[]) => mockPublish(...args),
    TOPICS: actual.TOPICS ?? {},
    // Keep real types/zod schemas from actual
    OrderStatus: actual.OrderStatus,
    ok: actual.ok,
    fail: actual.fail,
    AppError: actual.AppError,
    ValidationError: actual.ValidationError,
    NotFoundError: actual.NotFoundError,
    UnauthorizedError: actual.UnauthorizedError,
    ForbiddenError: actual.ForbiddenError,
    InternalError: actual.InternalError,
    type: actual.type,
    'type OrderStatus': actual['type OrderStatus'],
  };
});

jest.mock('../config/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  pool: { query: jest.fn() },
  closePool: jest.fn(),
  isPoolHealthy: () => true,
}));

jest.mock('../middleware/auth', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../config/kafka', () => ({
  startKafkaConsumer: jest.fn().mockResolvedValue(undefined),
  publishOrderCreated: jest.fn().mockImplementation((event: unknown) => mockPublish(event)),
  disconnectKafka: jest.fn().mockResolvedValue(undefined),
}));

import {
  handleCreateOrder,
  handleListOrders,
  handleGetOrder,
} from '../routes/orders';
import type { AuthRequest } from '../middleware/auth';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const NOW = '2026-07-05T12:00:00.000Z';

const mockOrderRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'order-1',
  user_id: 'user-1',
  items: [{ productId: 'p1', quantity: 2, price: 1000 }],
  total_amount: 2000,
  status: 'created',
  shipping_address: { line1: '123 St', city: 'NYC', state: 'NY', postalCode: '10001', country: 'US' },
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockReq = (overrides: Record<string, unknown> = {}): AuthRequest =>
  ({
    params: {},
    query: {},
    body: {},
    user: { sub: 'user-1', role: 'customer' },
    ...overrides,
  } as unknown as AuthRequest);

const mockRes = () => {
  const r: Record<string, jest.Mock> = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r as unknown as Parameters<typeof handleCreateOrder>[1];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getJsonBody = (res: ReturnType<typeof mockRes>): unknown => {
  const r = res.json as unknown as { mock: { calls: any[][] } };
  return r.mock.calls[0]?.[0];
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── handleCreateOrder ────────────────────────────────────────────────────────
describe('handleCreateOrder', () => {
  it('creates order and publishes Kafka event', async () => {
    mockQueryOne.mockResolvedValueOnce(mockOrderRow());
    mockPublish.mockResolvedValueOnce(undefined);

    const res = mockRes();
    await handleCreateOrder(
      mockReq({
        body: {
          items: [{ productId: 'p1', quantity: 2, price: 1000 }],
          shippingAddress: { line1: '123 St', city: 'NYC', state: 'NY', postalCode: '10001', country: 'US' },
        },
      }),
      res,
      jest.fn()
    );

    expect(mockQueryOne).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'order-1',
          totalAmount: 2000,
          status: 'created',
        }),
      })
    );
  });

  it('rejects order with no items', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleCreateOrder(
      mockReq({ body: { items: [], shippingAddress: { line1: 'X', city: 'Y', state: 'Z', postalCode: '1', country: 'US' } } }),
      res,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejects order with missing shipping address', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleCreateOrder(
      mockReq({ body: { items: [{ productId: 'p1', quantity: 1, price: 100 }] } }),
      res,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejects order with invalid country code length', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleCreateOrder(
      mockReq({
        body: {
          items: [{ productId: 'p1', quantity: 1, price: 100 }],
          shippingAddress: { line1: 'X', city: 'Y', state: 'Z', postalCode: '1', country: 'USA' },
        },
      }),
      res,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── handleListOrders ─────────────────────────────────────────────────────────
describe('handleListOrders', () => {
  it('returns all orders for the user', async () => {
    mockQuery.mockResolvedValueOnce([mockOrderRow(), mockOrderRow({ id: 'order-2' })]);

    const res = mockRes();
    await handleListOrders(mockReq(), res, jest.fn());

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM orders WHERE user_id = $1'),
      ['user-1']
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { orders: expect.any(Array) } })
    );
    const json = getJsonBody(res) as { data: { orders: unknown[] } };
    expect(json.data.orders).toHaveLength(2);
  });

  it('returns empty array when user has no orders', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const res = mockRes();
    await handleListOrders(mockReq(), res, jest.fn());

    const json = getJsonBody(res) as { data: { orders: unknown[] } };
    expect(json.data.orders).toHaveLength(0);
  });
});

// ─── handleGetOrder ───────────────────────────────────────────────────────────
describe('handleGetOrder', () => {
  it('returns order when user owns it', async () => {
    mockQueryOne.mockResolvedValueOnce(mockOrderRow());

    const res = mockRes();
    await handleGetOrder(mockReq({ params: { id: 'order-1' } }), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: 'order-1' }) })
    );
  });

  it('returns 404 when order not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    const res = mockRes();
    const next = jest.fn();
    await handleGetOrder(mockReq({ params: { id: 'nonexistent' } }), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('returns 404 when user does not own the order', async () => {
    mockQueryOne.mockResolvedValueOnce(mockOrderRow({ user_id: 'other-user' }));

    const res = mockRes();
    const next = jest.fn();
    await handleGetOrder(mockReq({ params: { id: 'order-1' } }), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ─── Schema validation (pure — no DB needed) ──────────────────────────────────
describe('CreateOrderSchema validation', () => {
  const { AddToCartSchema } = require('@cloudcommerce/common');

  it('accepts valid order payload', () => {
    const payload = {
      items: [{ productId: 'p1', quantity: 2, price: 1000 }],
      shippingAddress: { line1: '123 St', city: 'NYC', state: 'NY', postalCode: '10001', country: 'US' },
    };
    // Re-import schema directly to test (not through route handler)
    const { OrderItemSchema, ShippingAddressSchema } = require('@cloudcommerce/common');
    const result = OrderItemSchema.safeParse({ productId: 'p1', quantity: 2, price: 1000 });
    expect(result.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const { OrderItemSchema } = require('@cloudcommerce/common');
    const result = OrderItemSchema.safeParse({ productId: 'p1', quantity: 0, price: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const { OrderItemSchema } = require('@cloudcommerce/common');
    const result = OrderItemSchema.safeParse({ productId: 'p1', quantity: 1, price: -100 });
    expect(result.success).toBe(false);
  });

  it('accepts valid shipping address', () => {
    const { ShippingAddressSchema } = require('@cloudcommerce/common');
    const result = ShippingAddressSchema.safeParse({
      line1: '123 St',
      city: 'NYC',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid country code', () => {
    const { ShippingAddressSchema } = require('@cloudcommerce/common');
    const result = ShippingAddressSchema.safeParse({
      line1: 'X', city: 'Y', state: 'Z', postalCode: '1', country: 'USA',
    });
    expect(result.success).toBe(false);
  });
});