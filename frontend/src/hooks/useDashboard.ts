import { useQuery } from '@tanstack/react-query';
import { fetchDashboardOverview } from '@/api/dashboard.api';

export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: fetchDashboardOverview,
  });
}
