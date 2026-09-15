import { useQuery } from '@tanstack/react-query';
import { fetchLocalHostHealth, fetchSystemsHealth } from '@/api/statusWall.api';
import { fetchMondayItems } from '@/api/monday.api';
import { fetchJiraItems } from '@/api/jira.api';

export function useSystemsHealth(refreshIntervalMs: number) {
  return useQuery({
    queryKey: ['statusWall', 'systemsHealth'],
    queryFn: fetchSystemsHealth,
    refetchInterval: refreshIntervalMs,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useLocalHostHealth(refreshIntervalMs: number) {
  return useQuery({
    queryKey: ['statusWall', 'localHostHealth'],
    queryFn: fetchLocalHostHealth,
    refetchInterval: refreshIntervalMs,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMondayWall(refreshIntervalMs: number) {
  return useQuery({
    queryKey: ['statusWall', 'monday'],
    queryFn: () => fetchMondayItems(undefined, true),
    refetchInterval: refreshIntervalMs,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useJiraWall(refreshIntervalMs: number) {
  return useQuery({
    queryKey: ['statusWall', 'jira'],
    queryFn: () => fetchJiraItems(undefined, true),
    refetchInterval: refreshIntervalMs,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
