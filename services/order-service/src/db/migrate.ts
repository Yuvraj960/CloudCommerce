import { pool } from '../config/db';

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     VARCHAR(255) NOT NULL,
      items       JSONB NOT NULL,
      total_amount BIGINT NOT NULL,
      status      VARCHAR(50) NOT NULL DEFAULT 'created',
      shipping_address JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Index on user_id for fast lookup
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
  `);

  // Index on status
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
  `);
}