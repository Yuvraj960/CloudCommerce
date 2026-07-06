// Generic JWT utilities — each service passes its own secret.
// Keep secrets in service env vars, not in packages/common.

import jwt from 'jsonwebtoken';
import type { JwtPayload } from './types';

/**
 * Verify an access token using the service's JWT_SECRET.
 * Throws UnauthorizedError on failure.
 */
export function verifyAccessToken(token: string, secret: string): JwtPayload {
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    const { UnauthorizedError } = require('./errors');
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

/**
 * Decode without verifying (for logging/expiry checks only).
 */
export function decodeToken(token: string): JwtPayload | null {
  return jwt.decode(token) as JwtPayload | null;
}