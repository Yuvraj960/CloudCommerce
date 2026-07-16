import { pool, query } from '../config/db';
import { logger } from '@cloudcommerce/common';

export async function migrate(): Promise<void> {
  // Payments table — stores simulated payment records
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR(255) NOT NULL,
      amount BIGINT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      payment_id VARCHAR(255),
      failed_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Index for looking up payments by order_id
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
  `);

  logger.info('Payment-service migrations complete');
}