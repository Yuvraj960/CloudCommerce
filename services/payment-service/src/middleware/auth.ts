import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@cloudcommerce/common';
import { UnauthorizedError } from '@cloudcommerce/common';
import type { JwtPayload } from '@cloudcommerce/common';

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export interface AuthenticatedUser {
  sub: string;
  role: 'customer' | 'admin';
}

/** Attaches decoded JWT payload to req.user */
export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    // Late-bound secret — tests can swap env at runtime
    const secret = process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-prod';
    const token = header.slice(7);
    const payload = verifyAccessToken(token, secret) as JwtPayload;
    req.user = { sub: payload.sub, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}