import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, decodeToken } from '../config/jwt';
import { UnauthorizedError, ForbiddenError, JwtPayload } from '@cloudcommerce/common';

// Attach decoded user to req
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowed: Array<'customer' | 'admin'>) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    if (!allowed.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of roles: ${allowed.join(' or ')}`));
    }
    next();
  };
}

// Extract bearer token
export function getToken(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// Check token expiry without throwing (for client-side refresh prompts)
export function tokenExpiry(token: string): Date | null {
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload?.exp) return null;
  return new Date(payload.exp * 1000);
}