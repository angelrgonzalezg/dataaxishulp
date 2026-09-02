export interface JiraProjectDefinition {
  key: string;
  label: string;
  /** Jira project key, e.g. STA */
  projectKey: string;
  defaultSystemKey: string;
}

export interface JiraSettings {
  baseUrl: string;
  email: string;
  apiToken: string;
  doneStatus: string;
  maxResults: number;
  projects: JiraProjectDefinition[];
}

export const DEFAULT_JIRA_PROJECTS: JiraProjectDefinition[] = [
  {
    key: 'statia',
    label: 'Statia Issues',
    projectKey: 'STA',
    defaultSystemKey: 'kadaster_statia',
  },
  {
    key: 'saba',
    label: 'Saba Issues',
    projectKey: 'SAB',
    defaultSystemKey: 'kadaster_saba',
  },
  {
    key: 'bonaire',
    label: 'Bonaire Issues',
    projectKey: 'BON',
    defaultSystemKey: 'kadaster_bonaire',
  },
  {
    key: 'dlv',
    label: 'DLV Issues',
    projectKey: 'DLV',
    defaultSystemKey: 'dlv_aruba_prod',
  },
];

function parseProjectsFromEnv(): JiraProjectDefinition[] | null {
  const raw = process.env.JIRA_PROJECTS?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as JiraProjectDefinition[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.filter((p) => p.key && p.projectKey && p.label && p.defaultSystemKey);
  } catch {
    return null;
  }
}

export function getJiraSettings(): JiraSettings | null {
  const baseUrl = process.env.JIRA_BASE_URL?.trim().replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL?.trim();
  const apiToken = process.env.JIRA_API_TOKEN?.trim();
  if (!baseUrl || !email || !apiToken) return null;

  const maxResultsRaw = Number(process.env.JIRA_MAX_RESULTS ?? '100');
  const maxResults =
    Number.isFinite(maxResultsRaw) && maxResultsRaw > 0
      ? Math.min(Math.floor(maxResultsRaw), 200)
      : 100;

  return {
    baseUrl,
    email,
    apiToken,
    doneStatus: process.env.JIRA_DONE_STATUS?.trim() || 'Done',
    maxResults,
    projects: parseProjectsFromEnv() ?? DEFAULT_JIRA_PROJECTS,
  };
}

export function requireJiraSettings(): JiraSettings {
  const settings = getJiraSettings();
  if (!settings) {
    throw new Error('JIRA_NOT_CONFIGURED');
  }
  return settings;
}

export function getJiraProjectDefinition(
  settings: JiraSettings,
  projectKey: string,
): JiraProjectDefinition | null {
  return settings.projects.find((project) => project.key === projectKey) ?? null;
}

export function jiraExternalRef(issueKey: string): string {
  return `jira:${issueKey}`;
}
