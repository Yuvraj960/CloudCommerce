import { Router, Response, NextFunction } from 'express';
import {
  ProductInputSchema,
  ProductUpdateInputSchema,
  StockDeltaSchema,
  NotFoundError,
  ValidationError,
  ConflictError,
  ok,
} from '@cloudcommerce/common';
import { ProductModel, type ProductResponse } from '../models/product';
import { uploadToS3 } from '../config/s3';
import { AuthRequest, requireAuth, requireAdmin } from '../middleware/auth';

const PAGE_SIZE = 20;
const ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566';
const BUCKET   = process.env.S3_BUCKET ?? 'cloudcommerce-images';

function pageNum(q: unknown): number {
  const n = typeof q === 'string' ? parseInt(q, 10) : Number(q);
  return isFinite(n) && n > 0 ? n : 1;
}

/** Build the external imageUrl from an imageKey, or undefined */
function imageUrlFrom(key: string | null): string | undefined {
  return key ? `${ENDPOINT}/${BUCKET}/${key}` : undefined;
}

/** Transform a plain Mongoose lean doc into API response shape (adds `id` from _id, imageUrl from imageKey) */
function toResponse(raw: Record<string, unknown>): ProductResponse {
  return {
    id: (raw._id as { toHexString(): string }).toHexString(),
    name: raw.name as string,
    description: raw.description as string,
    price: raw.price as number,
    category: raw.category as string,
    stock: raw.stock as number,
    imageUrl: imageUrlFrom(raw.imageKey as string | null),
    createdAt: (raw.createdAt as Date)?.toISOString() ?? '',
    updatedAt: (raw.updatedAt as Date)?.toISOString() ?? '',
  };
}

// GET /products
export async function handleListProducts(req: AuthRequest, res: Response, _next: NextFunction) {
  const { search, category } = req.query as { search?: string; category?: string };
  const page = pageNum(req.query.page);

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (search) {
    // MongoDB text search — requires a text index on name/description
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * PAGE_SIZE;

  const [rawProducts, total] = await Promise.all([
    ProductModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(PAGE_SIZE).lean(),
    ProductModel.countDocuments(filter),
  ]);

  const products = rawProducts.map(r => toResponse(r as Record<string, unknown>));
  res.json(ok({ products, total, page, pageSize: PAGE_SIZE }));
}

// GET /products/:id
export async function handleGetProduct(req: AuthRequest, res: Response, next: NextFunction) {
  const raw = await ProductModel.findById(req.params.id).lean();
  if (!raw) return next(new NotFoundError('Product'));
  res.json(ok(toResponse(raw as Record<string, unknown>)));
}

// POST /products  (admin)
export async function handleCreateProduct(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = ProductInputSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError('Invalid product data', parsed.error.flatten()));

  const existing = await ProductModel.findOne({ name: parsed.data.name }).lean();
  if (existing) return next(new ConflictError('Product with this name already exists'));

  const created = await ProductModel.create(parsed.data);
  // .create() returns a Mongoose doc with toJSON applied; lean() doesn't, so we manually transform
  res.status(201).json(ok({
    id: (created._id as { toHexString(): string }).toHexString(),
    name: created.name,
    description: created.description,
    price: created.price,
    category: created.category,
    stock: created.stock,
    imageUrl: imageUrlFrom(created.imageKey ?? null),
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  }));
}

// PUT /products/:id  (admin)
export async function handleUpdateProduct(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = ProductUpdateInputSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError('Invalid update data', parsed.error.flatten()));

  const raw = await ProductModel.findByIdAndUpdate(
    req.params.id,
    { $set: parsed.data },
    { new: true, runValidators: true }
  ).lean();

  if (!raw) return next(new NotFoundError('Product'));
  res.json(ok(toResponse(raw as Record<string, unknown>)));
}

// PATCH /products/:id/stock  (internal — called by Order Service via HTTP)
export async function handleUpdateStock(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = StockDeltaSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError('Invalid delta', parsed.error.flatten()));
  const { delta } = parsed.data;

  // Atomic: only succeed if stock doesn't go negative
  const doc = await ProductModel.findOneAndUpdate(
    { _id: req.params.id, stock: { $gte: -delta } },
    { $inc: { stock: delta } },
    { new: true }
  ).lean();

  if (!doc) {
    const exists = await ProductModel.exists({ _id: req.params.id });
    if (!exists) return next(new NotFoundError('Product'));
    return next(new ValidationError('Insufficient stock for this adjustment'));
  }

  res.json(ok({ id: (doc._id as { toHexString(): string }).toHexString(), stock: doc.stock }));
}

// POST /products/:id/image  (multipart — admin)
export async function handleUploadImage(req: AuthRequest, res: Response, next: NextFunction) {
  const file = req.file;
  if (!file) return next(new ValidationError('No file uploaded'));

  const { imageKey } = await uploadToS3(file.buffer, file.originalname, file.mimetype);

  const doc = await ProductModel.findByIdAndUpdate(
    req.params.id,
    { $set: { imageKey } },
    { new: true }
  ).lean();

  if (!doc) return next(new NotFoundError('Product'));
  res.json(ok({ imageUrl: imageUrlFrom(doc.imageKey ?? null) ?? `products/${imageKey}` }));
}

// Mount all routes
export function productRouter() {
  const router = Router();
  router.get('/', handleListProducts);
  router.get('/:id', handleGetProduct);
  router.post('/', requireAdmin, handleCreateProduct);
  router.put('/:id', requireAdmin, handleUpdateProduct);
  router.patch('/:id/stock', handleUpdateStock);
  router.post('/:id/image', requireAdmin, handleUploadImage);
  return router;
}