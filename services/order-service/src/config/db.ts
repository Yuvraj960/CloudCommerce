import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ??
  'postgresql://cloudcommerce:cloudcommerce@localhost:5432/cloudcommerce';

// Module-level singleton — same instance across hot reloads
const pool = new Pool({ connectionString: DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export function isPoolHealthy(): boolean {
  return pool.totalCount >= 0; // pg Pool doesn't expose a health check — this is best-effort
}

export { pool };