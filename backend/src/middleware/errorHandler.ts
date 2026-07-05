import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/client';
import { AppError, ValidationError } from '../utils/AppError';
import type { ApiErrorResponse } from '../types/api.types';
import { env } from '../config/env';

function prismaErrorToAppError(err: Prisma.PrismaClientKnownRequestError): AppError {
  switch (err.code) {
    case 'P2002': {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta.target as string[]).join(', ')
        : 'field';
      return new ValidationError(`Duplicate value for ${target}`);
    }
    case 'P2025':
      return new AppError(404, 'Record not found', 'NOT_FOUND');
    default:
      return new AppError(500, 'Database error', 'DATABASE_ERROR', { code: err.code });
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: err.message,
      code: err.code,
      ...(err.details !== undefined && { details: err.details }),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const appError = prismaErrorToAppError(err);
    const body: ApiErrorResponse = {
      success: false,
      error: appError.message,
      code: appError.code,
      ...(appError.details !== undefined && { details: appError.details }),
    };
    res.status(appError.statusCode).json(body);
    return;
  }

  console.error('Unhandled error:', err);

  const message =
    err.message && err.message !== '[object Object]'
      ? err.message
      : typeof (err as { originalError?: unknown }).originalError === 'object'
        ? JSON.stringify((err as { originalError?: unknown }).originalError)
        : String(err);

  const body: ApiErrorResponse = {
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal server error' : message,
    code: 'INTERNAL_ERROR',
  };
  res.status(500).json(body);
}

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
  };
  res.status(404).json(body);
}
