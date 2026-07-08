import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken as verifyToken } from '@cloudcommerce/common';
import { UnauthorizedError, ForbiddenError, type JwtPayload } from '@cloudcommerce/common';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

function getSecret(): string {
  return JWT_SECRET;
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token, getSecret());
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  requireAuth(req, _res, () => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (req.user.role !== 'admin') {
      return next(new ForbiddenError('Admin access required'));
    }
    next();
  });
}