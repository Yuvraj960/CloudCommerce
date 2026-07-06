// packages/common — shared library for all CloudCommerce services
// Re-export everything so services only need one import

export { logger } from './logger';
export { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError, InternalError, errorHandler } from './errors';
export type { Logger } from './logger';

export {
  TOPICS,
  ok,
  fail,
  type ApiResponse,
  type JwtPayload,
  type User,
  type Product,
  type ProductInput,
  type ProductUpdateInput,
  type CartItem,
  type Cart,
  OrderStatus,
  type OrderItem,
  type ShippingAddress,
  type Order,
  PaymentStatus,
  type Payment,
  type OrderCreatedEvent,
  type OrderCompletedEvent,
  type OrderCancelledEvent,
  type PaymentSuccessEvent,
  type PaymentFailedEvent,
  OrderItemSchema,
  ShippingAddressSchema,
  ProductInputSchema,
  ProductUpdateInputSchema,
  StockDeltaSchema,
  CartItemSchema,
  AddToCartSchema,
  UpdateCartItemSchema,
} from './types';

export { verifyAccessToken, decodeToken } from './jwt';

export { getKafkaClient, publishEvent, type KafkaClient } from './kafka';