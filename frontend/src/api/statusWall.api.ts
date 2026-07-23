import { api } from './client';
import type { SystemHealth } from '@/types';

export async function fetchSystemsHealth() {
  const { data } = await api.get('/systems/health');
  return data.data as SystemHealth[];
}
