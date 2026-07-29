import { api } from './client';
import type { LocalHostHealth, SystemHealth } from '@/types';

export async function fetchSystemsHealth() {
  const { data } = await api.get('/systems/health', {
    // Probing several SQL Server targets (local + VPN/Azure) can take a while.
    timeout: 120000,
  });
  return data.data as SystemHealth[];
}

export async function fetchLocalHostHealth() {
  const { data } = await api.get('/systems/host-health');
  return data.data as LocalHostHealth;
}
