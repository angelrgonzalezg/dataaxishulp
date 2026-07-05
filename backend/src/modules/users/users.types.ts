import type { AppUser } from '../../utils/userMapper';
import type { UserRole } from '../../types/database.types';
import type { PaginationMeta } from '../../types/api.types';

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface UserListResult {
  users: AppUser[];
  pagination: PaginationMeta;
}

export interface UserCreateInput {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
}

export interface UserUpdateInput {
  email?: string;
  full_name?: string | null;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

export type UserResponse = AppUser;
