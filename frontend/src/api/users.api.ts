import { api } from './client';
import type { AppUser, PaginationMeta, UserRole } from '@/types';

export interface UsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  is_active?: boolean;
}

export async function fetchUsers(params: UsersQuery = {}) {
  const { data } = await api.get('/users', { params });
  return {
    users: data.data as AppUser[],
    pagination: data.pagination as PaginationMeta,
  };
}

export async function fetchUser(id: number) {
  const { data } = await api.get(`/users/${id}`);
  return data.data as AppUser;
}

export async function createUser(payload: {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
}) {
  const { data } = await api.post('/users', payload);
  return data.data as AppUser;
}

export async function updateUser(
  id: number,
  payload: Partial<{
    email: string;
    full_name: string | null;
    role: UserRole;
    is_active: boolean;
    password: string;
  }>,
) {
  const { data } = await api.patch(`/users/${id}`, payload);
  return data.data as AppUser;
}
