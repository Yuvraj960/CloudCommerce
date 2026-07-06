import { pool } from '../config/db';
import { logger } from '@cloudcommerce/common';

export async function migrate(): Promise<void> {
  logger.info('Running database migrations...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name        VARCHAR(255) NOT NULL,
      role        VARCHAR(20) NOT NULL DEFAULT 'customer',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT valid_role CHECK (role IN ('customer', 'admin'))
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       VARCHAR(512) NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Index for token lookup during refresh
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
  `);

  logger.info('Migrations complete');
}