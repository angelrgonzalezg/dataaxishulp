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
  /** Cap across all projects when discovering everything. */
  maxTotalResults: number;
  /** When true (default), list every accessible Jira project/space. */
  discoverAllProjects: boolean;
  defaultSystemKey: string;
  /** Optional overrides / fallbacks keyed by Jira project key. */
  projectOverrides: JiraProjectDefinition[];
}

export const DEFAULT_JIRA_PROJECT_OVERRIDES: JiraProjectDefinition[] = [
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

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function getJiraSettings(): JiraSettings | null {
  const baseUrl = process.env.JIRA_BASE_URL?.trim().replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL?.trim();
  const apiToken = process.env.JIRA_API_TOKEN?.trim();
  if (!baseUrl || !email || !apiToken) return null;

  const maxResultsRaw = Number(process.env.JIRA_MAX_RESULTS ?? '100');
  const maxResults =
    Number.isFinite(maxResultsRaw) && maxResultsRaw > 0
      ? Math.min(Math.floor(maxResultsRaw), 100)
      : 100;

  const maxTotalRaw = Number(process.env.JIRA_MAX_TOTAL_RESULTS ?? '1000');
  const maxTotalResults =
    Number.isFinite(maxTotalRaw) && maxTotalRaw > 0
      ? Math.min(Math.floor(maxTotalRaw), 5000)
      : 1000;

  const envProjects = parseProjectsFromEnv();
  // If JIRA_PROJECTS is explicitly set, keep that fixed list unless discover is forced on.
  const discoverAllProjects = parseBool(
    process.env.JIRA_DISCOVER_ALL_PROJECTS,
    envProjects == null,
  );

  return {
    baseUrl,
    email,
    apiToken,
    doneStatus: process.env.JIRA_DONE_STATUS?.trim() || 'Done',
    maxResults,
    maxTotalResults,
    discoverAllProjects,
    defaultSystemKey:
      process.env.JIRA_DEFAULT_SYSTEM_KEY?.trim() || 'kadaster_statia',
    projectOverrides: envProjects ?? DEFAULT_JIRA_PROJECT_OVERRIDES,
  };
}

export function requireJiraSettings(): JiraSettings {
  const settings = getJiraSettings();
  if (!settings) {
    throw new Error('JIRA_NOT_CONFIGURED');
  }
  return settings;
}

export function getJiraProjectOverride(
  settings: JiraSettings,
  projectKeyOrInternalKey: string,
): JiraProjectDefinition | null {
  const needle = projectKeyOrInternalKey.trim().toLowerCase();
  return (
    settings.projectOverrides.find(
      (project) =>
        project.key.toLowerCase() === needle ||
        project.projectKey.toLowerCase() === needle,
    ) ?? null
  );
}

export function jiraExternalRef(issueKey: string): string {
  return `jira:${issueKey}`;
}
