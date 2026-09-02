import { prisma } from '../../config/db';
import type { JiraProjectDefinition, JiraSettings } from '../../config/jira';
import {
  getJiraProjectDefinition,
  getJiraSettings,
  jiraExternalRef,
  requireJiraSettings,
} from '../../config/jira';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';
import type { IssuePriority } from '../../types/database.types';
import * as issuesService from '../issues/issues.service';
import {
  browseUrl,
  fetchIssueByKey,
  searchProjectIssues,
  type JiraRawIssue,
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

async function listJiraProjectItems(
  settings: JiraSettings,
  project: JiraProjectDefinition,
  includeDone: boolean,
): Promise<JiraProjectItemsResult> {
  const rawItems = await searchProjectIssues(settings, project.projectKey);
  const mapped = rawItems.map((issue) => mapJiraItem(issue, settings, project.label));
  const openItems = mapped.filter((item) => !isDoneItem(item, settings.doneStatus));
  const doneItems = includeDone
    ? mapped.filter((item) => isDoneItem(item, settings.doneStatus))
    : [];
  const linkSource = includeDone ? [...openItems, ...doneItems] : openItems;

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
    local_issue_by_jira_key: await attachLocalIssueLinks(linkSource),
  };
}

export async function listJiraItems(
  projectKey?: string,
  options?: { includeDone?: boolean },
): Promise<JiraAllItemsResult> {
  const includeDone = options?.includeDone ?? false;
  const settings = assertJiraConfigured();
  const projects = projectKey
    ? (() => {
        const project = getJiraProjectDefinition(settings, projectKey);
        if (!project) {
          throw new NotFoundError(`Jira project "${projectKey}" is not configured`);
        }
        return [project];
      })()
    : settings.projects;

  const projectResults = await Promise.all(
    projects.map((project) => listJiraProjectItems(settings, project, includeDone)),
  );

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
  const project = getJiraProjectDefinition(settings, projectKey);
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

    const totals = jiraData.projects.reduce(
      (acc, project) => ({
        open: acc.open + project.counts.open,
        done: acc.done + project.counts.done,
        total: acc.total + project.counts.total,
      }),
      { open: 0, done: 0, total: 0 },
    );

    return {
      configured: true,
      site: jiraData.site,
      last_synced_at: jiraData.synced_at,
      totals: {
        ...totals,
        imported_local: importedLocal,
      },
      by_project: jiraData.projects.map((project) => ({
        project_key: project.project_key,
        label: project.label,
        open: project.counts.open,
        done: project.counts.done,
        total: project.counts.total,
      })),
    };
  } catch {
    return {
      configured: true,
      site: settings.baseUrl,
      last_synced_at: null,
      totals: { open: 0, done: 0, total: 0, imported_local: 0 },
      by_project: settings.projects.map((project) => ({
        project_key: project.key,
        label: project.label,
        open: 0,
        done: 0,
        total: 0,
      })),
    };
  }
}
