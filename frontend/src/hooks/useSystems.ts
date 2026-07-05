import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSystems, testSystem } from '@/api/systems.api';

export function useSystems() {
  return useQuery({
    queryKey: ['systems'],
    queryFn: fetchSystems,
  });
}

export function useTestSystem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: testSystem,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['systems'] });
    },
  });
}
