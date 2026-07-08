/**
 * Product Service — Route Handler Unit Tests
 * Tests schema validation, pagination, stock guard, conflict checks.
 * Mocks ProductModel via jest.mock so no real DB needed.
 */

import { ProductInputSchema, StockDeltaSchema, ProductUpdateInputSchema } from '@cloudcommerce/common';

// ─── Mock functions (declared before jest.mock so factory can reference them) ─
const mockExists = jest.fn();

jest.mock('../config/s3', () => ({
  uploadToS3: jest.fn().mockResolvedValue({ imageKey: 'uploads/test.jpg' }),
}));
jest.mock('../middleware/auth', () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../models/product', () => ({
  ProductModel: {
    create: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    exists: mockExists,
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

import { handleUpdateStock, handleListProducts } from '../routes/products';
import { handleCreateProduct } from '../routes/products';
import type { AuthRequest } from '../middleware/auth';

const ProductModel = require('../models/product').ProductModel;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const mockReq = (overrides: Record<string, unknown> = {}): AuthRequest =>
  ({ params: {}, query: {}, body: {}, user: { sub: 'user-1', role: 'admin' }, file: undefined, ...overrides } as unknown as AuthRequest);

const mockRes = () => {
  const r: Record<string, jest.Mock> = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r as unknown as Parameters<typeof handleUpdateStock>[1];
};

// Chainable mock for find().sort().skip().limit().lean()
interface MockChain {
  sort(): MockChain;
  skip(): MockChain;
  limit(): MockChain;
  lean(): Promise<unknown[]>;
}
const makeChain = (resolved: unknown[]): MockChain => ({
  sort: jest.fn().mockReturnThis(),
  skip:  jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean:  jest.fn().mockResolvedValue(resolved),
});

// Query-with-lean: findOneAndUpdate(...).lean() pattern
const makeQueryWithLean = <T>(resolved: T) => ({
  lean: jest.fn().mockResolvedValue(resolved),
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Schema validation (pure — no DB needed) ─────────────────────────────────
describe('ProductInputSchema', () => {
  it('accepts a valid payload', () => {
    expect(ProductInputSchema.safeParse({ name: 'Wireless Mouse', description: 'Ergonomic', price: 2999, category: 'Electronics', stock: 50 }).success).toBe(true);
  });
  it('rejects negative price', () => {
    const r = ProductInputSchema.safeParse({ name: 'X', price: -100, category: 'X', description: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toContain('price');
  });
  it('rejects non-integer price', () => {
    expect(ProductInputSchema.safeParse({ name: 'X', price: 10.5, category: 'X', description: '' }).success).toBe(false);
  });
  it('rejects missing required fields', () => {
    expect(ProductInputSchema.safeParse({}).success).toBe(false);
    expect(ProductInputSchema.safeParse({ name: 'X' }).success).toBe(false);
  });
  it('accepts zero stock', () => {
    expect(ProductInputSchema.safeParse({ name: 'X', price: 100, category: 'X', stock: 0, description: '' }).success).toBe(true);
  });
});

describe('StockDeltaSchema', () => {
  it('accepts positive delta',     () => expect(StockDeltaSchema.safeParse({ delta: 5 }).success).toBe(true));
  it('accepts negative delta',     () => expect(StockDeltaSchema.safeParse({ delta: -20 }).success).toBe(true));
  it('rejects non-integer delta',  () => expect(StockDeltaSchema.safeParse({ delta: 1.5 }).success).toBe(false));
  it('rejects missing delta',       () => expect(StockDeltaSchema.safeParse({}).success).toBe(false));
});

describe('ProductUpdateInputSchema', () => {
  it('accepts partial updates',     () => expect(ProductUpdateInputSchema.safeParse({ name: 'New' }).success).toBe(true));
  it('accepts empty object',        () => expect(ProductUpdateInputSchema.safeParse({}).success).toBe(true));
});

// ─── Pagination via handleListProducts ───────────────────────────────────────
describe('pageNum pagination (via handleListProducts)', () => {
  it('skips 0 when page absent (page 1)', async () => {
    const chain = makeChain([]);
    ProductModel.find.mockReturnValue(chain);
    ProductModel.countDocuments.mockResolvedValue(0);
    await handleListProducts(mockReq({ query: {} }), mockRes(), jest.fn());
    expect(chain.skip).toHaveBeenCalledWith(0);
  });

  it('skips 0 for invalid page', async () => {
    const chain = makeChain([]);
    ProductModel.find.mockReturnValue(chain);
    ProductModel.countDocuments.mockResolvedValue(0);
    await handleListProducts(mockReq({ query: { page: 'abc' } }), mockRes(), jest.fn());
    expect(chain.skip).toHaveBeenCalledWith(0);
  });

  it('skips 0 for page=0', async () => {
    const chain = makeChain([]);
    ProductModel.find.mockReturnValue(chain);
    ProductModel.countDocuments.mockResolvedValue(0);
    await handleListProducts(mockReq({ query: { page: '0' } }), mockRes(), jest.fn());
    expect(chain.skip).toHaveBeenCalledWith(0);
  });

  it('skips 20 for page=2', async () => {
    const chain = makeChain([]);
    ProductModel.find.mockReturnValue(chain);
    ProductModel.countDocuments.mockResolvedValue(0);
    await handleListProducts(mockReq({ query: { page: '2' } }), mockRes(), jest.fn());
    expect(chain.skip).toHaveBeenCalledWith(20);
  });

  it('skips 80 for page=5', async () => {
    const chain = makeChain([]);
    ProductModel.find.mockReturnValue(chain);
    ProductModel.countDocuments.mockResolvedValue(0);
    await handleListProducts(mockReq({ query: { page: '5' } }), mockRes(), jest.fn());
    expect(chain.skip).toHaveBeenCalledWith(80);
  });
});

// ─── handleUpdateStock — stock guard ─────────────────────────────────────────
describe('handleUpdateStock', () => {
  it('calls next with 400 when stock would go negative', async () => {
    ProductModel.findOneAndUpdate.mockReturnValueOnce(makeQueryWithLean(null));
    mockExists.mockResolvedValueOnce({ _id: 'some-id' });

    const res = mockRes();
    const nextFn = jest.fn();
    await handleUpdateStock(mockReq({ params: { id: 'some-id' }, body: { delta: -200 } }), res, nextFn);

    expect(nextFn).toHaveBeenCalled();
    const err = (nextFn as jest.Mock).mock.calls[0][0] as { statusCode: number; message: string };
    expect(err.statusCode).toBe(400);
    expect(err.message.toLowerCase()).toMatch(/stock|insufficient|delta/i);
  });

  it('calls next with 404 when product does not exist', async () => {
    ProductModel.findOneAndUpdate.mockReturnValueOnce(makeQueryWithLean(null));
    mockExists.mockResolvedValueOnce(null);

    const res = mockRes();
    const nextFn = jest.fn();
    await handleUpdateStock(mockReq({ params: { id: 'bad' }, body: { delta: 5 } }), res, nextFn);

    expect(nextFn).toHaveBeenCalled();
    const err = (nextFn as jest.Mock).mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(404);
  });

  it('returns updated stock on success', async () => {
    const doc = { _id: { toHexString: () => 'some-id' }, stock: 55 };
    ProductModel.findOneAndUpdate.mockReturnValueOnce(makeQueryWithLean(doc));

    const res = mockRes();
    const nextFn = jest.fn();
    await handleUpdateStock(mockReq({ params: { id: 'some-id' }, body: { delta: 5 } }), res, nextFn);

    expect(nextFn).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { id: 'some-id', stock: 55 } }));
  });
});

// ─── handleCreateProduct validation ───────────────────────────────────────────
describe('handleCreateProduct', () => {
  it('calls next with 400 for negative price', async () => {
    const res = mockRes();
    const nextFn = jest.fn();
    await handleCreateProduct(
      mockReq({ body: { name: 'Test', price: -999, category: 'X', description: '' } }),
      res, nextFn
    );
    expect(nextFn).toHaveBeenCalled();
    const err = (nextFn as jest.Mock).mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(400);
  });

  it('calls next with 409 when product name already exists', async () => {
    ProductModel.findOne.mockReturnValueOnce(makeQueryWithLean({ _id: 'existing' }));

    const res = mockRes();
    const nextFn = jest.fn();
    await handleCreateProduct(
      mockReq({ body: { name: 'Taken', price: 100, category: 'X', description: '' } }),
      res, nextFn
    );
    expect(nextFn).toHaveBeenCalled();
    const err = (nextFn as jest.Mock).mock.calls[0][0] as { statusCode: number };
    expect(err.statusCode).toBe(409);
  });
});