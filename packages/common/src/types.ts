// Shared TypeScript types for all services
// Kafka events, API response wrappers, and domain models

import { z } from 'zod';

// ---- API Response wrapper ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Wrap a value into the standard response shape
export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  return { success: false, error: { code, message, details } };
}

// ---- Auth ----
export interface JwtPayload {
  sub: string;        // userId
  role: 'customer' | 'admin';
  iat: number;
  exp: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'customer' | 'admin';
  createdAt: string;  // ISO 8601
}

// ---- Product ----
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;       // cents
  category: string;
  stock: number;
  imageUrl?: string;
  imageKey?: string;   // S3 key (stored, not returned directly)
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  description: string;
  price: number;       // cents — must be non-negative integer
  category: string;
  stock?: number;
  imageUrl?: string;
}

export interface ProductUpdateInput extends Partial<ProductInput> {}

// Cart interfaces
export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
}

// Cart schemas
export const CartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const AddToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().nonnegative('Quantity must be zero or positive'),
});

// ---- Order ----
export enum OrderStatus {
  Created = 'created',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;       // cents — snapshot at time of order
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number; // cents
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  createdAt: string;
  updatedAt: string;
}

// ---- Payment ----
export enum PaymentStatus {
  Pending = 'pending',
  Success = 'success',
  Failed = 'failed',
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;      // cents
  status: PaymentStatus;
  paymentId?: string;   // external reference
  failedAt?: string;
  paidAt?: string;
  createdAt: string;
}

// ---- Kafka event payloads (match API_CONTRACTS.md) ----
export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

export interface OrderCompletedEvent {
  orderId: string;
  completedAt: string;
}

export interface OrderCancelledEvent {
  orderId: string;
  reason: string;
  cancelledAt: string;
}

export interface PaymentSuccessEvent {
  orderId: string;
  paymentId: string;
  amount: number;
  paidAt: string;
}

export interface PaymentFailedEvent {
  orderId: string;
  reason: string;
  failedAt: string;
}

// ---- Zod schemas for input validation (used by services) ----
export const OrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

export const ShippingAddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2).max(2),
});

// Product schemas
export const ProductInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).default(''),
  price: z.number().int().nonnegative('Price must be a non-negative integer (cents)'),
  category: z.string().min(1).max(100),
  stock: z.number().int().nonnegative().default(0),
  imageUrl: z.string().url().optional(),
});

export const ProductUpdateInputSchema = ProductInputSchema.partial();

export const StockDeltaSchema = z.object({
  delta: z.number().int(), // positive = add stock, negative = remove
});

// ---- Kafka topic names ----
export const TOPICS = {
  ORDER_CREATED: 'order_created',
  ORDER_COMPLETED: 'order_completed',
  ORDER_CANCELLED: 'order_cancelled',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
} as const;