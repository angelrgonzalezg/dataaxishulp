import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/jwt';
import { roleHasPermission, type Permission } from '../config/permissions';
import { UnauthorizedError, ForbiddenError } from '../utils/AppError';
import type { UserRole } from '../types/database.types';

const PUBLIC_PATHS = ['/health', '/auth/login', '/auth/refresh'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.endsWith(p));
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  if (isPublicPath(req.path)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const role = req.user.role as UserRole;
    const allowed = permissions.every((permission) => roleHasPermission(role, permission));
    if (!allowed) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
