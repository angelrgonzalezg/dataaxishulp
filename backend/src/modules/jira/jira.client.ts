import { AppError } from '../../utils/AppError';
import type { JiraSettings } from '../../config/jira';

export interface JiraRawIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary?: string | null;
    updated?: string | null;
    status?: {
      name?: string | null;
      statusCategory?: { key?: string | null; name?: string | null } | null;
    } | null;
    priority?: { name?: string | null } | null;
    assignee?: { displayName?: string | null; emailAddress?: string | null } | null;
    issuetype?: { name?: string | null } | null;
    description?: unknown;
  };
}

interface JiraSearchResponse {
  issues?: JiraRawIssue[];
  total?: number;
  errorMessages?: string[];
  errors?: Record<string, string>;
}

function authHeader(settings: JiraSettings): string {
  const token = Buffer.from(`${settings.email}:${settings.apiToken}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function jiraFetch<T>(
  settings: JiraSettings,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${settings.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(settings),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = `Jira API HTTP ${response.status}`;
    try {
      const body = (await response.json()) as {
        errorMessages?: string[];
        message?: string;
      };
      const messages = body.errorMessages?.filter(Boolean) ?? [];
      if (messages.length > 0) detail = messages.join('; ');
      else if (body.message) detail = body.message;
    } catch {
      // ignore parse errors
    }
    throw new AppError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      detail,
      'JIRA_API_ERROR',
    );
  }

  return (await response.json()) as T;
}

export async function searchProjectIssues(
  settings: JiraSettings,
  projectKey: string,
): Promise<JiraRawIssue[]> {
  const jql = `project = "${projectKey.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
  const params = new URLSearchParams({
    jql,
    maxResults: String(settings.maxResults),
    fields: 'summary,status,priority,assignee,updated,issuetype',
  });

  const data = await jiraFetch<JiraSearchResponse>(
    settings,
    `/rest/api/3/search?${params.toString()}`,
  );

  return data.issues ?? [];
}

export async function fetchIssueByKey(
  settings: JiraSettings,
  issueKey: string,
): Promise<JiraRawIssue | null> {
  try {
    return await jiraFetch<JiraRawIssue>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,priority,assignee,updated,issuetype,description`,
    );
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

export function browseUrl(baseUrl: string, issueKey: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/browse/${issueKey}`;
}
