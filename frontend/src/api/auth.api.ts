import { api } from './client';
import type { LoginResponse } from '@/types';

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post('/auth/login', { username, password });
  return data.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // ignore logout errors
  }
}
