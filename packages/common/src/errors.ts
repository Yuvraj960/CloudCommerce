// Error classes — unified AppError used across all services
// Services bind to Express themselves; this module is transport-agnostic.

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return { success: false, error: { code: this.code, message: this.message, details: this.details } };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalError';
  }
}

// Express error handler — implement this in each service, e.g.:
//   app.use((err, req, res, next) => errorHandler(err, req, res, next));
// Import { errorHandler } from '@cloudcommerce/common/errors' in the service.
export function errorHandler(err: Error, _req: unknown, res: unknown, _next: unknown): void {
  const resObj = res as { status: (code: number) => { json: (body: object) => void } };
  if (err instanceof AppError) {
    resObj.status(err.statusCode).json(err.toJSON());
    return;
  }
  // Unexpected — hide detail
  resObj.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}