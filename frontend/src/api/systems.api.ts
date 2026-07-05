import { api } from './client';
import type { SystemConnection } from '@/types';

export async function fetchSystems() {
  const { data } = await api.get('/systems');
  return data.data as SystemConnection[];
}

export async function testSystem(id: number) {
  const { data } = await api.post(`/systems/${id}/test`);
  return data.data as SystemConnection;
}
