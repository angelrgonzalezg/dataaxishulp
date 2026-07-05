import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createIssue,
  fetchIssue,
  fetchIssues,
  resolveIssue,
  updateIssue,
  type IssuesQuery,
} from '@/api/issues.api';

export function useIssues(params: IssuesQuery = {}) {
  return useQuery({
    queryKey: ['issues', params],
    queryFn: () => fetchIssues(params),
  });
}

export function useIssue(id: number) {
  return useQuery({
    queryKey: ['issues', id],
    queryFn: () => fetchIssue(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useIssueMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['issues'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: createIssue,
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateIssue>[1] }) =>
      updateIssue(id, payload),
    onSuccess: invalidate,
  });

  const resolve = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof resolveIssue>[1];
    }) => resolveIssue(id, payload),
    onSuccess: invalidate,
  });

  return { create, update, resolve };
}
