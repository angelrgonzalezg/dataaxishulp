import { api } from './client';
import type { DashboardOverview } from '@/types';

export async function fetchDashboardOverview() {
  const { data } = await api.get('/dashboard/overview');
  return data.data as DashboardOverview;
}
