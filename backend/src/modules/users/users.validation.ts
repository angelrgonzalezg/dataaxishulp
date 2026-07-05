import { z } from 'zod';
import { USER_ROLES } from '../../types/database.types';

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const userCreateSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(100),
  password: z.string().min(6).max(100),
  full_name: z.string().max(150).optional(),
  role: z.enum(USER_ROLES as [string, ...string[]]),
});

export const userUpdateSchema = z.object({
  email: z.string().email().max(100).optional(),
  full_name: z.string().max(150).nullable().optional(),
  role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
});

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
