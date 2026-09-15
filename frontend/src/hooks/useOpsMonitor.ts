import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpsOverview, probeOpsTargets, sendOpsWhatsAppTest, updateOpsInterval } from '@/api/opsMonitor.api';

export function useOpsOverview(refreshIntervalMs: number | false) {
  return useQuery({
    queryKey: ['statusWall', 'opsOverview'],
    queryFn: fetchOpsOverview,
    refetchInterval: refreshIntervalMs === 0 ? false : refreshIntervalMs,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useProbeOpsTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: probeOpsTargets,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['statusWall', 'opsOverview'] });
    },
  });
}

export function useSendOpsWhatsAppTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendOpsWhatsAppTest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['statusWall', 'opsOverview'] });
    },
  });
}

export function useUpdateOpsInterval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOpsInterval,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['statusWall', 'opsOverview'] });
    },
  });
}