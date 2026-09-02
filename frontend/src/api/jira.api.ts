import { api } from './client';
import type { JiraAllItemsResult, JiraImportResult } from '@/types';

export async function fetchJiraItems(projectKey?: string, includeDone = false) {
  const { data } = await api.get('/issues/jira/items', {
    params: {
      ...(projectKey ? { projectKey } : {}),
      ...(includeDone ? { includeDone: 'true' } : {}),
    },
  });
  return data.data as JiraAllItemsResult;
}

export async function importJiraItem(jiraIssueKey: string, projectKey: string) {
  const { data } = await api.post(
    `/issues/jira/items/${encodeURIComponent(jiraIssueKey)}/import`,
    null,
    { params: { projectKey } },
  );
  return data.data as JiraImportResult;
}
