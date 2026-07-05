import type { User as PrismaUser } from '../generated/client';
import type { UserRole } from '../types/database.types';

export interface AppUser {
  user_id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapUser(row: PrismaUser): AppUser {
  return {
    user_id: row.userId,
    username: row.username,
    email: row.email,
    full_name: row.fullName,
    role: row.role as UserRole,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
