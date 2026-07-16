/**
 * Payment Service — Route Handler Unit Tests
 * Tests payment simulation, retrieval, and Kafka publishing.
 * Mocks pg Pool and Kafka client so no real DB/Kafka needed.
 */

// ─── Mock functions ──────────────────────────────────────────────────────────
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
const mockPublish = jest.fn();
const mockVerify = jest.fn();

jest.mock('@cloudcommerce/common', () => {
  const actual = jest.requireActual('@cloudcommerce/common') as Record<string, unknown>;
  return {
    ...actual,
    verifyAccessToken: (...args: unknown[]) => mockVerify(...args),
    errorHandler: jest.fn(),
    logger: { info: jest.fn(), error: jest.fn() },
    publishEvent: (...args: unknown[]) => mockPublish(...args),
    TOPICS: actual.TOPICS ?? {},
    PaymentStatus: actual.PaymentStatus,
    ok: actual.ok,
    fail: actual.fail,
    AppError: actual.AppError,
    ValidationError: actual.ValidationError,
    NotFoundError: actual.NotFoundError,
    UnauthorizedError: actual.UnauthorizedError,
    ForbiddenError: actual.ForbiddenError,
    InternalError: actual.InternalError,
    type: actual.type,
  };
});

jest.mock('../config/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  pool: { query: jest.fn() },
  closePool: jest.fn(),
  isPoolHealthy: () => true,
}));

jest.mock('../config/kafka', () => ({
  startKafkaConsumer: jest.fn().mockResolvedValue(undefined),
  publishPaymentSuccess: jest.fn().mockImplementation((event: unknown) => mockPublish(event)),
  publishPaymentFailed: jest.fn().mockImplementation((event: unknown) => mockPublish(event)),
  disconnectKafka: jest.fn().mockResolvedValue(undefined),
  kafkaClient: null,
}));

jest.mock('../middleware/auth', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {
  handleSimulatePayment,
  handleGetPayment,
} from '../routes/payments';
import type { AuthRequest } from '../middleware/auth';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const NOW = '2026-07-05T12:00:00.000Z';

const mockPaymentRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'pay-1',
  order_id: 'order-1',
  amount: 50_000,
  status: 'success',
  payment_id: 'pay_12345678_order-1',
  failed_reason: null,
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
  r.json = jest.fn();
  return r as unknown as Parameters<typeof handleSimulatePayment>[1];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getJsonBody = (res: ReturnType<typeof mockRes>): unknown => {
  const r = res.json as unknown as { mock: { calls: any[][] } };
  return r.mock.calls[0]?.[0];
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── handleSimulatePayment ────────────────────────────────────────────────────
describe('handleSimulatePayment', () => {
  it('simulates successful payment and publishes payment_success', async () => {
    mockQueryOne.mockResolvedValueOnce(mockPaymentRow());

    const res = mockRes();
    await handleSimulatePayment(
      mockReq({
        body: { orderId: 'order-1', amount: 50_000 },
      }),
      res,
      jest.fn()
    );

    expect(mockQueryOne).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', paymentId: expect.any(String) })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          status: 'success',
        }),
      })
    );
  });

  it('simulates failed payment for amounts >= 100000 cents', async () => {
    mockQueryOne.mockResolvedValueOnce(
      mockPaymentRow({ status: 'failed', payment_id: null, amount: 100_000 })
    );

    const res = mockRes();
    await handleSimulatePayment(
      mockReq({
        body: { orderId: 'order-1', amount: 100_000 },
      }),
      res,
      jest.fn()
    );

    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', reason: 'Amount exceeds risk threshold' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const body = getJsonBody(res) as { data: { status: string } };
    expect(body.data?.status).toBe('failed');
  });

  it('rejects invalid input with 400', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleSimulatePayment(
      mockReq({ body: { orderId: '', amount: -1 } }),
      res,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejects missing orderId', async () => {
    const res = mockRes();
    const next = jest.fn();
    await handleSimulatePayment(
      mockReq({ body: { amount: 50_000 } }),
      res,
      next
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ─── handleGetPayment ─────────────────────────────────────────────────────────
describe('handleGetPayment', () => {
  it('returns payment record when found', async () => {
    mockQueryOne.mockResolvedValueOnce(mockPaymentRow());

    const res = mockRes();
    await handleGetPayment(
      mockReq({ params: { orderId: 'order-1' } }),
      res,
      jest.fn()
    );

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM payments WHERE order_id = $1'),
      ['order-1']
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderId: 'order-1' }) })
    );
  });

  it('returns 400 when payment not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    const res = mockRes();
    const next = jest.fn();
    await handleGetPayment(
      mockReq({ params: { orderId: 'nonexistent' } }),
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});