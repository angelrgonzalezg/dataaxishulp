import { prisma } from '../../config/db';
import type { JiraProjectDefinition, JiraSettings } from '../../config/jira';
import {
  getJiraProjectOverride,
  getJiraSettings,
  jiraExternalRef,
  requireJiraSettings,
} from '../../config/jira';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';
import { daysSinceUpdate, isStaleIssue, STALE_ISSUE_DAYS } from '../../utils/staleIssue';
import type { IssuePriority } from '../../types/database.types';
import * as issuesService from '../issues/issues.service';
import {
  assertJiraAuthenticated,
  browseUrl,
  fetchIssueByKey,
  listAccessibleProjects,
  searchAllAccessibleIssues,
  searchProjectIssues,
  type JiraRawIssue,
  type JiraRawProject,
} from './jira.client';
import type {
  JiraAllItemsResult,
  JiraDashboardSummary,
  JiraImportResult,
  JiraItemDto,
  JiraProjectItemsResult,
} from './jira.types';

function mapPriority(status: string | null, priorityText: string | null): IssuePriority {
  const source = `${priorityText ?? ''} ${status ?? ''}`.toLowerCase();
  if (source.includes('critical') || source.includes('highest') || source.includes('blocker')) {
    return 'critical';
  }
  if (source.includes('high')) return 'high';
  if (source.includes('low') || source.includes('lowest') || source.includes('trivial')) {
    return 'low';
  }
  return 'medium';
}

function mapJiraItem(issue: JiraRawIssue, settings: JiraSettings, projectLabel: string): JiraItemDto {
  const status = issue.fields.status?.name?.trim() || null;
  const statusCategory = issue.fields.status?.statusCategory?.key?.trim() || null;

  return {
    jira_issue_id: issue.id,
    jira_issue_key: issue.key,
    name: issue.fields.summary?.trim() || issue.key,
    status,
    status_category: statusCategory,
    priority: issue.fields.priority?.name?.trim() || null,
    assignee:
      issue.fields.assignee?.displayName?.trim() ||
      issue.fields.assignee?.emailAddress?.trim() ||
      null,
    issue_type: issue.fields.issuetype?.name?.trim() || null,
    project: projectLabel,
    updated_at: issue.fields.updated ?? null,
    jira_url: browseUrl(settings.baseUrl, issue.key),
  };
}

function isDoneItem(item: JiraItemDto, doneStatus: string): boolean {
  if ((item.status_category ?? '').toLowerCase() === 'done') return true;
  return (item.status ?? '').trim().toLowerCase() === doneStatus.trim().toLowerCase();
}

function buildDescription(item: JiraItemDto, projectLabel: string): string {
  return [
    `Imported from Jira (${projectLabel}) issue ${item.jira_issue_key}.`,
    item.jira_url ? `Jira link: ${item.jira_url}` : null,
    item.status ? `Status: ${item.status}` : null,
    item.priority ? `Priority: ${item.priority}` : null,
    item.assignee ? `Assignee: ${item.assignee}` : null,
    item.issue_type ? `Type: ${item.issue_type}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function assertJiraConfigured(): JiraSettings {
  try {
    return requireJiraSettings();
  } catch {
    throw new AppError(
      503,
      'Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in backend/.env',
      'JIRA_NOT_CONFIGURED',
    );
  }
}

function toProjectDefinition(
  settings: JiraSettings,
  raw: Pick<JiraRawProject, 'key' | 'name'>,
): JiraProjectDefinition {
  const override = getJiraProjectOverride(settings, raw.key);
  return {
    key: override?.key ?? raw.key.toLowerCase(),
    label: override?.label ?? raw.name,
    projectKey: raw.key,
    defaultSystemKey: override?.defaultSystemKey ?? settings.defaultSystemKey,
  };
}

async function resolveProjects(
  settings: JiraSettings,
  projectKey?: string,
): Promise<JiraProjectDefinition[]> {
  if (!settings.discoverAllProjects) {
    const projects = settings.projectOverrides;
    if (!projectKey) return projects;
    const match = getJiraProjectOverride(settings, projectKey);
    if (!match) {
      throw new NotFoundError(`Jira project "${projectKey}" is not configured`);
    }
    return [match];
  }

  const accessible = await listAccessibleProjects(settings);
  const mapped = accessible
    .filter((project) => Boolean(project.key?.trim()))
    .map((project) => toProjectDefinition(settings, project))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (!projectKey) return mapped;

  const needle = projectKey.trim().toLowerCase();
  const match = mapped.find(
    (project) =>
      project.key.toLowerCase() === needle ||
      project.projectKey.toLowerCase() === needle,
  );
  if (!match) {
    throw new NotFoundError(`Jira project/space "${projectKey}" was not found or is not accessible`);
  }
  return [match];
}

async function attachLocalIssueLinks(items: JiraItemDto[]): Promise<Record<string, number>> {
  const externalRefs = items.map((item) => jiraExternalRef(item.jira_issue_key));
  const existingIssues = externalRefs.length
    ? await prisma.issue.findMany({
        where: { externalRef: { in: externalRefs } },
        select: { issueId: true, externalRef: true },
      })
    : [];

  const localIssueByJiraKey: Record<string, number> = {};
  for (const issue of existingIssues) {
    if (!issue.externalRef?.startsWith('jira:')) continue;
    const key = issue.externalRef.replace(/^jira:/, '');
    localIssueByJiraKey[key] = issue.issueId;
  }
  return localIssueByJiraKey;
}

function buildProjectResult(
  settings: JiraSettings,
  project: JiraProjectDefinition,
  rawItems: JiraRawIssue[],
  includeDone: boolean,
  localLinks: Record<string, number>,
): JiraProjectItemsResult {
  const mapped = rawItems.map((issue) => mapJiraItem(issue, settings, project.label));
  const openItems = mapped.filter((item) => !isDoneItem(item, settings.doneStatus));
  const doneItems = includeDone
    ? mapped.filter((item) => isDoneItem(item, settings.doneStatus))
    : [];

  return {
    project_key: project.key,
    label: project.label,
    site: settings.baseUrl,
    jira_project_key: project.projectKey,
    open_items: openItems,
    done_items: doneItems,
    items: openItems,
    counts: {
      open: openItems.length,
      done: doneItems.length,
      total: openItems.length + doneItems.length,
    },
    local_issue_by_jira_key: Object.fromEntries(
      [...openItems, ...doneItems]
        .map((item) => [item.jira_issue_key, localLinks[item.jira_issue_key]] as const)
        .filter((entry): entry is [string, number] => entry[1] != null),
    ),
  };
}

export async function listJiraItems(
  projectKey?: string,
  options?: { includeDone?: boolean },
): Promise<JiraAllItemsResult> {
  const includeDone = options?.includeDone ?? false;
  const settings = assertJiraConfigured();
  await assertJiraAuthenticated(settings);
  const projects = await resolveProjects(settings, projectKey);

  let projectResults: JiraProjectItemsResult[];

  if (settings.discoverAllProjects && !projectKey) {
    const rawItems = await searchAllAccessibleIssues(settings);
    const byJiraProjectKey = new Map<string, JiraRawIssue[]>();
    for (const issue of rawItems) {
      const key =
        issue.fields.project?.key?.trim() ||
        issue.key.split('-')[0] ||
        'UNKNOWN';
      const bucket = byJiraProjectKey.get(key) ?? [];
      bucket.push(issue);
      byJiraProjectKey.set(key, bucket);
    }

    const allMappedForLinks = rawItems.map((issue) => {
      const jiraKey = issue.fields.project?.key?.trim() || issue.key.split('-')[0] || 'UNKNOWN';
      const project =
        projects.find((item) => item.projectKey === jiraKey) ??
        toProjectDefinition(settings, {
          key: jiraKey,
          name: issue.fields.project?.name?.trim() || jiraKey,
        });
      return mapJiraItem(issue, settings, project.label);
    });
    const localLinks = await attachLocalIssueLinks(allMappedForLinks);

    // Keep every accessible space, even if the recent issue page didn't include it.
    projectResults = projects.map((project) =>
      buildProjectResult(
        settings,
        project,
        byJiraProjectKey.get(project.projectKey) ?? [],
        includeDone,
        localLinks,
      ),
    );

    // Also surface any unexpected project keys present in the issue page.
    for (const [jiraKey, issues] of byJiraProjectKey.entries()) {
      if (projects.some((project) => project.projectKey === jiraKey)) continue;
      const synthetic = toProjectDefinition(settings, {
        key: jiraKey,
        name: issues[0]?.fields.project?.name?.trim() || jiraKey,
      });
      projectResults.push(
        buildProjectResult(settings, synthetic, issues, includeDone, localLinks),
      );
    }
  } else {
    const settled = await Promise.all(
      projects.map(async (project) => {
        const rawItems = await searchProjectIssues(settings, project.projectKey);
        const mapped = rawItems.map((issue) => mapJiraItem(issue, settings, project.label));
        const localLinks = await attachLocalIssueLinks(mapped);
        return buildProjectResult(settings, project, rawItems, includeDone, localLinks);
      }),
    );
    projectResults = settled;
  }

  projectResults.sort((a, b) => a.label.localeCompare(b.label));

  return {
    site: settings.baseUrl,
    synced_at: new Date().toISOString(),
    projects: projectResults,
  };
}

export async function importJiraItem(
  jiraIssueKey: string,
  projectKey: string,
  actorId: number,
): Promise<JiraImportResult> {
  const settings = assertJiraConfigured();
  const projects = await resolveProjects(settings, projectKey);
  const project = projects[0];
  if (!project) {
    throw new ValidationError(`Jira project "${projectKey}" is not configured`);
  }

  const key = jiraIssueKey.trim().toUpperCase();
  const externalRef = jiraExternalRef(key);

  const existing = await prisma.issue.findFirst({
    where: { externalRef },
    select: { issueId: true },
  });
  if (existing) {
    const raw = await fetchIssueByKey(settings, key);
    if (!raw) throw new NotFoundError(`Jira issue ${key} not found`);
    return {
      issue_id: existing.issueId,
      created: false,
      project_key: project.key,
      jira_item: mapJiraItem(raw, settings, project.label),
    };
  }

  const raw = await fetchIssueByKey(settings, key);
  if (!raw) throw new NotFoundError(`Jira issue ${key} not found`);

  const jiraItem = mapJiraItem(raw, settings, project.label);
  if (isDoneItem(jiraItem, settings.doneStatus)) {
    throw new ValidationError(`Jira issue is already Done (${jiraItem.status ?? 'done'})`);
  }

  const system = await prisma.systemConnection.findUnique({
    where: { systemKey: project.defaultSystemKey },
  });
  if (!system || !system.isActive) {
    throw new ValidationError(
      `Default system "${project.defaultSystemKey}" not found or inactive`,
    );
  }

  const created = await issuesService.createIssue(
    {
      title: jiraItem.name.slice(0, 200),
      description: buildDescription(jiraItem, project.label),
      system_id: system.systemId,
      priority: mapPriority(jiraItem.status, jiraItem.priority),
      category: 'jira',
      external_ref: externalRef,
    },
    actorId,
  );

  return {
    issue_id: created.issue_id,
    created: true,
    project_key: project.key,
    jira_item: jiraItem,
  };
}

export function isJiraConfigured(): boolean {
  return getJiraSettings() != null;
}

export async function getJiraDashboardSummary(): Promise<JiraDashboardSummary | null> {
  const settings = getJiraSettings();
  if (!settings) {
    return null;
  }

  try {
    const [jiraData, importedLocal] = await Promise.all([
      listJiraItems(undefined, { includeDone: true }),
      prisma.issue.count({
        where: { externalRef: { startsWith: 'jira:' } },
      }),
    ]);

    const now = new Date();
    const by_project = jiraData.projects.map((project) => {
      const openItems = project.open_items ?? project.items;
      const stale_open = openItems.filter((item) => isStaleIssue(item.updated_at, now)).length;
      return {
        project_key: project.project_key,
        jira_project_key: project.jira_project_key,
        label: project.label,
        open: project.counts.open,
        done: project.counts.done,
        total: project.counts.total,
        stale_open,
      };
    });

    const totals = by_project.reduce(
      (acc, project) => ({
        open: acc.open + project.open,
        done: acc.done + project.done,
        total: acc.total + project.total,
        stale_open: acc.stale_open + project.stale_open,
      }),
      { open: 0, done: 0, total: 0, stale_open: 0 },
    );

    const stale_items = jiraData.projects
      .flatMap((project) =>
        (project.open_items ?? project.items)
          .filter((item) => isStaleIssue(item.updated_at, now))
          .map((item) => {
            const days = daysSinceUpdate(item.updated_at, now) ?? STALE_ISSUE_DAYS;
            return {
              id: item.jira_issue_id,
              key: item.jira_issue_key,
              title: item.name,
              project_key: project.project_key,
              project_label: project.label,
              updated_at: item.updated_at,
              days_stale: days,
              url: item.jira_url,
            };
          }),
      )
      .sort((a, b) => b.days_stale - a.days_stale)
      .slice(0, 8);

    return {
      configured: true,
      site: jiraData.site,
      last_synced_at: jiraData.synced_at,
      stale_threshold_days: STALE_ISSUE_DAYS,
      totals: {
        ...totals,
        imported_local: importedLocal,
      },
      by_project,
      stale_items,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Jira sync failed';
    return {
      configured: true,
      site: settings.baseUrl,
      last_synced_at: null,
      error: message,
      stale_threshold_days: STALE_ISSUE_DAYS,
      totals: { open: 0, done: 0, total: 0, imported_local: 0, stale_open: 0 },
      by_project: [],
      stale_items: [],
    };
  }
}
