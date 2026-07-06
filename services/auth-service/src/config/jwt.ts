import jwt, { type SignOptions } from 'jsonwebtoken';
import { JwtPayload, UnauthorizedError } from '@cloudcommerce/common';

const DEFAULT_SECRET = 'dev-secret-change-in-production';
const ACCESS_EXPIRY_SECONDS = parseInt(process.env.JWT_ACCESS_EXPIRY_SECONDS ?? '900', 10);
const REFRESH_EXPIRY_DAYS = 7;

function getSecret(): string {
  return process.env.JWT_SECRET ?? DEFAULT_SECRET;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signAccessToken(userId: string, role: 'customer' | 'admin'): string {
  const opts = { expiresIn: ACCESS_EXPIRY_SECONDS } as SignOptions;
  return jwt.sign({ sub: userId, role }, getSecret(), opts);
}

export function signRefreshToken(userId: string): string {
  const opts = { expiresIn: `${REFRESH_EXPIRY_DAYS}d` as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, type: 'refresh' }, getSecret(), opts);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): { sub: string } {
  try {
    const payload = jwt.verify(token, getSecret()) as { sub: string; type?: string };
    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid refresh token');
    }
    return { sub: payload.sub };
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

export function decodeToken(token: string): JwtPayload | null {
  return jwt.decode(token) as JwtPayload | null;
}