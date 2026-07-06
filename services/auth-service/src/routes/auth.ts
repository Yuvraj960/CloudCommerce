import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query, queryOne } from '../config/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../config/jwt';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { ValidationError, ConflictError, fail, ok, UnauthorizedError } from '@cloudcommerce/common';

const BCRYPT_ROUNDS = 12;

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255).trim(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'customer' | 'admin';
  created_at: string;
}

// POST /api/auth/register
export async function handleRegister(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError('Invalid input', parsed.error.flatten()));
  }
  const { email, password, name } = parsed.data;

  const existing = await queryOne<UserRow>(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (existing) {
    return next(new ConflictError('Email already registered'));
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await queryOne<UserRow>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, role, created_at`,
    [email.toLowerCase(), passwordHash, name]
  );
  if (!result) return next(new ValidationError('Failed to create user'));

  const accessToken = signAccessToken(result.id, result.role);
  const refreshToken = signRefreshToken(result.id);

  // Store refresh token hashed in DB
  const hashed = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [result.id, hashed, expiresAt]
  );

  res.status(201).json(ok({ accessToken, refreshToken, user: { id: result.id, email: result.email, name: result.name, role: result.role } }));
}

// POST /api/auth/login
export async function handleLogin(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError('Invalid input', parsed.error.flatten()));
  }
  const { email, password } = parsed.data;

  const user = await queryOne<UserRow>(
    'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (!user) {
    return next(new UnauthorizedError('Invalid email or password'));
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return next(new UnauthorizedError('Invalid email or password'));
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);

  // Store refresh token
  const hashed = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, hashed, expiresAt]
  );

  res.json(ok({ accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }));
}

// POST /api/auth/refresh
export async function handleRefresh(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = RefreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError('Invalid input', parsed.error.flatten()));
  }
  const { refreshToken } = parsed.data;

  let userId: string;
  try {
    const payload = verifyRefreshToken(refreshToken);
    userId = payload.sub;
  } catch {
    return next(new UnauthorizedError('Invalid or expired refresh token'));
  }

  // Look up user
  const user = await queryOne<UserRow>(
    'SELECT id, role FROM users WHERE id = $1',
    [userId]
  );
  if (!user) {
    return next(new UnauthorizedError('User not found'));
  }

  const newAccessToken = signAccessToken(user.id, user.role);
  const newRefreshToken = signRefreshToken(user.id);

  // Rotate refresh token in DB
  const hashed = await bcrypt.hash(newRefreshToken, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query(
    `DELETE FROM refresh_tokens WHERE user_id = $1
     AND token = (SELECT token FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
    [userId]
  );
  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, hashed, expiresAt]
  );

  res.json(ok({ accessToken: newAccessToken, refreshToken: newRefreshToken }));
}

// GET /api/auth/me
export async function handleMe(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.sub) return next(new UnauthorizedError());

  const user = await queryOne<{ id: string; email: string; name: string; role: 'customer' | 'admin'; created_at: string }>(
    'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
    [req.user.sub]
  );
  if (!user) return next(new UnauthorizedError('User not found'));

  res.json(ok(user));
}

// Mount all routes
export function authRouter() {
  const router = Router();
  router.post('/register', handleRegister);
  router.post('/login', handleLogin);
  router.post('/refresh', handleRefresh);
  router.get('/me', requireAuth, handleMe);
  return router;
}