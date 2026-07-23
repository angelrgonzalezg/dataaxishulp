import { api } from './client';
import type { SystemConnection } from '@/types';

export async function fetchSystems() {
  const { data } = await api.get('/systems');
  return data.data as SystemConnection[];
}

export async function testSystem(id: number) {
  // Use {} — posting `null` with Content-Type application/json sends the
  // literal body "null" and breaks JSON parsing in some layers.
  const { data } = await api.post(`/systems/${id}/test`, {}, {
    timeout: 20000,
  });
  return data.data as SystemConnection;
}
