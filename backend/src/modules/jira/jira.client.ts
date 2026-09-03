import { AppError } from '../../utils/AppError';
import type { JiraSettings } from '../../config/jira';

export interface JiraRawProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string | null;
  style?: string | null;
}

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
    project?: {
      id?: string | null;
      key?: string | null;
      name?: string | null;
    } | null;
  };
}

interface JiraSearchJqlResponse {
  issues?: JiraRawIssue[];
  nextPageToken?: string | null;
  isLast?: boolean;
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
        error?: string;
      };
      const messages = body.errorMessages?.filter(Boolean) ?? [];
      if (messages.length > 0) detail = messages.join('; ');
      else if (body.message) detail = body.message;
      else if (body.error) detail = body.error;
    } catch {
      // ignore parse errors
    }

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        response.status,
        `Jira authentication failed (${response.status}). Check JIRA_EMAIL + JIRA_API_TOKEN (must be an Atlassian API token for that email). ${detail}`,
        'JIRA_AUTH_ERROR',
      );
    }

    throw new AppError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      detail,
      'JIRA_API_ERROR',
    );
  }

  return (await response.json()) as T;
}

/** Verifies Basic auth works for this site/token. */
export async function assertJiraAuthenticated(settings: JiraSettings): Promise<{
  accountId: string | null;
  displayName: string | null;
  emailAddress: string | null;
}> {
  try {
    const me = await jiraFetch<{
      accountId?: string;
      displayName?: string;
      emailAddress?: string;
    }>(settings, '/rest/api/3/myself');
    return {
      accountId: me.accountId ?? null,
      displayName: me.displayName ?? null,
      emailAddress: me.emailAddress ?? null,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === 'JIRA_AUTH_ERROR') {
      throw error;
    }
    throw new AppError(
      401,
      'Jira authentication failed on /myself. Recreate the API token at https://id.atlassian.com/manage-profile/security/api-tokens and ensure JIRA_EMAIL matches that Atlassian account.',
      'JIRA_AUTH_ERROR',
    );
  }
}

/** All Jira projects/spaces visible to the configured account. */
export async function listAccessibleProjects(
  settings: JiraSettings,
): Promise<JiraRawProject[]> {
  const data = await jiraFetch<{ values?: JiraRawProject[]; total?: number } | JiraRawProject[]>(
    settings,
    '/rest/api/3/project/search?maxResults=100&status=live',
  );
  if (Array.isArray(data)) return data;
  const values = data.values ?? [];
  // If first page is full, keep paging.
  if ((data.total ?? values.length) <= values.length) return values;

  const all = [...values];
  let startAt = values.length;
  const total = data.total ?? values.length;
  while (startAt < total && startAt < 500) {
    const page = await jiraFetch<{ values?: JiraRawProject[] }>(
      settings,
      `/rest/api/3/project/search?maxResults=100&status=live&startAt=${startAt}`,
    );
    const batch = page.values ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    startAt += batch.length;
  }
  return all;
}

async function searchJqlPage(
  settings: JiraSettings,
  jql: string,
  maxResults: number,
  nextPageToken?: string | null,
): Promise<JiraSearchJqlResponse> {
  const body: Record<string, unknown> = {
    jql,
    maxResults,
    fields: ['summary', 'status', 'priority', 'assignee', 'updated', 'issuetype', 'project'],
  };
  if (nextPageToken) body.nextPageToken = nextPageToken;

  return jiraFetch<JiraSearchJqlResponse>(settings, '/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Paginated JQL search via /rest/api/3/search/jql (old /search is gone). */
export async function searchIssuesPaginated(
  settings: JiraSettings,
  jql: string,
): Promise<JiraRawIssue[]> {
  const pageSize = settings.maxResults;
  const hardCap = settings.maxTotalResults;
  const all: JiraRawIssue[] = [];
  let nextPageToken: string | null | undefined;

  while (all.length < hardCap) {
    const take = Math.min(pageSize, hardCap - all.length);
    const page = await searchJqlPage(settings, jql, take, nextPageToken);
    const issues = page.issues ?? [];
    all.push(...issues);

    if (page.isLast !== false && !page.nextPageToken) break;
    if (!page.nextPageToken || issues.length === 0) break;
    nextPageToken = page.nextPageToken;
  }

  return all;
}

export async function searchProjectIssues(
  settings: JiraSettings,
  projectKey: string,
): Promise<JiraRawIssue[]> {
  const safeKey = projectKey.replace(/"/g, '\\"');
  // Bounded JQL required by /search/jql
  const jql = `project = "${safeKey}" AND updated >= -730d ORDER BY updated DESC`;
  return searchIssuesPaginated(settings, jql);
}

/** Issues across every accessible project/space. */
export async function searchAllAccessibleIssues(
  settings: JiraSettings,
): Promise<JiraRawIssue[]> {
  // /search/jql rejects unbounded queries; restrict by updated window.
  return searchIssuesPaginated(
    settings,
    'updated >= -730d ORDER BY project ASC, updated DESC',
  );
}

export async function fetchIssueByKey(
  settings: JiraSettings,
  issueKey: string,
): Promise<JiraRawIssue | null> {
  try {
    return await jiraFetch<JiraRawIssue>(
      settings,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,priority,assignee,updated,issuetype,description,project`,
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
