import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJiraItems, importJiraItem } from '@/api/jira.api';
import type { JiraAllItemsResult } from '@/types';

const JIRA_ALL_QUERY_KEY = ['jira', 'items', 'all'] as const;

export function useJiraInbox(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...JIRA_ALL_QUERY_KEY, 'withDone'],
    queryFn: () => fetchJiraItems(undefined, true),
    enabled,
    staleTime: 30_000,
  });

  async function refreshProject(projectKey: string) {
    const projectResult = await fetchJiraItems(projectKey, true);
    const nextProject = projectResult.projects[0];
    if (!nextProject) return;

    queryClient.setQueryData<JiraAllItemsResult>([...JIRA_ALL_QUERY_KEY, 'withDone'], (current) => {
      if (!current) return projectResult;
      const exists = current.projects.some((project) => project.project_key === projectKey);
      return {
        ...current,
        site: projectResult.site,
        synced_at: projectResult.synced_at,
        projects: exists
          ? current.projects.map((project) =>
              project.project_key === projectKey ? nextProject : project,
            )
          : [...current.projects, nextProject],
      };
    });
  }

  async function refreshAll() {
    await query.refetch();
  }

  return {
    ...query,
    refreshProject,
    refreshAll,
  };
}

export function useImportJiraItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      jiraIssueKey,
      projectKey,
    }: {
      jiraIssueKey: string;
      projectKey: string;
    }) => importJiraItem(jiraIssueKey, projectKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jira', 'items'] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
