import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ExternalLink, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { PermissionGate } from '@/components/PermissionGate';
import { extractErrorMessage } from '@/api/client';
import { useIssues } from '@/hooks/useIssues';
import { useImportMondayItem, useMondayInbox } from '@/hooks/useMondayIssues';
import { useImportJiraItem, useJiraInbox } from '@/hooks/useJiraIssues';
import { useSystems } from '@/hooks/useSystems';
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  JiraItem,
  JiraProjectItemsResult,
  MondayBoardItemsResult,
  MondayItem,
} from '@/types';
import { mondayBoardTheme } from '@/lib/mondayBoardThemes';
import { daysSinceUpdate, isStaleIssue } from '@/lib/staleIssue';

const STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES: IssuePriority[] = ['low', 'medium', 'high', 'critical'];

type IssuesTab = 'local' | 'monday' | 'jira';
type ExternalStatusFilter = 'all' | 'open' | 'done';

function priorityClass(priority: IssuePriority): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-50 text-red-700';
    case 'high':
      return 'bg-orange-50 text-orange-700';
    case 'medium':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-ink-100 text-ink-600';
  }
}

function LimboBadge({ updatedAt }: { updatedAt: string | Date | null | undefined }) {
  const { t } = useTranslation();
  if (!isStaleIssue(updatedAt)) return null;
  const days = daysSinceUpdate(updatedAt) ?? 0;
  return (
    <span
      title={t('issues.limboBadgeTitle', { days })}
      className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-800"
    >
      {t('issues.limboBadge', { days })}
    </span>
  );
}

function IssueRow({ issue, index }: { issue: Issue; index: number }) {
  const { t } = useTranslation();
  const showLimbo = issue.status === 'open' || issue.status === 'in_progress';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Link
        to={`/issues/${issue.issue_id}`}
        className="flex items-center gap-4 border-b border-ink-100 px-6 py-4 last:border-0 hover:bg-ink-50/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-ink-900">{issue.title}</p>
            {showLimbo && <LimboBadge updatedAt={issue.updated_at} />}
          </div>
          <p className="truncate text-sm text-ink-500">
            {issue.system.name}
            {issue.external_ref ? ` · ${issue.external_ref}` : ''}
          </p>
        </div>
        <span className="hidden text-sm text-ink-600 sm:inline">
          {t(`issues.statuses.${issue.status}`)}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityClass(issue.priority)}`}>
          {t(`issues.priorities.${issue.priority}`)}
        </span>
      </Link>
    </motion.div>
  );
}

function MondayItemRow({
  item,
  boardKey,
  localIssueId,
  index,
  isDone = false,
  onImport,
  importing,
}: {
  item: MondayItem;
  boardKey: string;
  localIssueId?: number;
  index: number;
  isDone?: boolean;
  onImport: (item: MondayItem, boardKey: string) => void;
  importing: boolean;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      className={`flex flex-col gap-3 border-b border-ink-100 px-6 py-4 last:border-0 sm:flex-row sm:items-center ${
        isDone ? 'bg-ink-50/40 opacity-80' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate font-semibold ${isDone ? 'text-ink-600' : 'text-ink-900'}`}>
            {item.name}
          </p>
          {!isDone && <LimboBadge updatedAt={item.updated_at} />}
          {isDone && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              Done
            </span>
          )}
        </div>
        <p className="truncate text-sm text-ink-500">
          {item.status ?? '—'}
          {item.assignee ? ` · ${item.assignee}` : ''}
          {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleDateString()}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.monday_url && (
          <a
            href={item.monday_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <ExternalLink style={{ width: 14, height: 14 }} />
            Monday
          </a>
        )}
        {localIssueId ? (
          <Link to={`/issues/${localIssueId}`}>
            <Button variant="secondary" size="sm">
              {t('issues.monday.openExisting')}
            </Button>
          </Link>
        ) : (
          !isDone && (
            <PermissionGate permission="issues.create">
              <Button size="sm" loading={importing} onClick={() => onImport(item, boardKey)}>
                {t('issues.monday.startResolution')}
              </Button>
            </PermissionGate>
          )
        )}
      </div>
    </motion.div>
  );
}

function MondayBoardSection({
  board,
  statusFilter,
  onImport,
  onRefresh,
  refreshing,
  importing,
}: {
  board: MondayBoardItemsResult;
  statusFilter: ExternalStatusFilter;
  onImport: (item: MondayItem, boardKey: string) => void;
  onRefresh: (boardKey: string) => void;
  refreshing: boolean;
  importing: boolean;
}) {
  const { t } = useTranslation();
  const theme = mondayBoardTheme(board.board_key);
  const openItems = board.open_items ?? board.items;
  const doneItems = board.done_items ?? [];
  const counts = board.counts ?? {
    open: openItems.length,
    done: doneItems.length,
    total: openItems.length + doneItems.length,
  };
  const showOpen = statusFilter === 'all' || statusFilter === 'open';
  const showDone = statusFilter === 'all' || statusFilter === 'done';
  const visibleCount =
    statusFilter === 'open'
      ? counts.open
      : statusFilter === 'done'
        ? counts.done
        : counts.total;

  return (
    <Card className={`overflow-hidden ${theme.card} ${theme.accent}`}>
      <div
        className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ${theme.header}`}
      >
        <div>
          <h3 className={`text-sm font-extrabold ${theme.title}`}>{board.label}</h3>
          <p className={`text-xs ${theme.subtitle}`}>
            {board.board} · {board.group} · {counts.open} {t('issues.monday.openItems')} ·{' '}
            {counts.done} Done
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={refreshing}
          onClick={() => onRefresh(board.board_key)}
        >
          <RefreshCw style={{ width: 14, height: 14 }} />
          {t('issues.monday.refreshBoard')}
        </Button>
      </div>

      {visibleCount === 0 ? (
        <p className="p-6 text-sm text-ink-500">
          {statusFilter === 'open'
            ? t('issues.monday.noOpenItems')
            : statusFilter === 'done'
              ? t('issues.monday.noDoneItems')
              : t('issues.monday.emptyBoard')}
        </p>
      ) : (
        <>
          {showOpen &&
            (openItems.length === 0 ? (
              <p className="border-b border-ink-100 px-6 py-4 text-sm text-ink-500">
                {t('issues.monday.noOpenItems')}
              </p>
            ) : (
              openItems.map((item, index) => (
                <MondayItemRow
                  key={item.monday_item_id}
                  item={item}
                  boardKey={board.board_key}
                  index={index}
                  localIssueId={board.local_issue_by_monday_id[item.monday_item_id]}
                  onImport={onImport}
                  importing={importing}
                />
              ))
            ))}

          {showDone && doneItems.length > 0 && (
            <>
              {statusFilter === 'all' && (
                <div className="border-y border-ink-100 bg-ink-50/80 px-6 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    {t('issues.monday.doneSection')} ({doneItems.length})
                  </p>
                </div>
              )}
              {doneItems.map((item, index) => (
                <MondayItemRow
                  key={`done-${item.monday_item_id}`}
                  item={item}
                  boardKey={board.board_key}
                  index={index}
                  isDone
                  localIssueId={board.local_issue_by_monday_id[item.monday_item_id]}
                  onImport={onImport}
                  importing={importing}
                />
              ))}
            </>
          )}
        </>
      )}
    </Card>
  );
}

function JiraItemRow({
  item,
  projectKey,
  localIssueId,
  index,
  isDone = false,
  onImport,
  importing,
}: {
  item: JiraItem;
  projectKey: string;
  localIssueId?: number;
  index: number;
  isDone?: boolean;
  onImport: (item: JiraItem, projectKey: string) => void;
  importing: boolean;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      className={`flex flex-col gap-3 border-b border-ink-100 px-6 py-4 last:border-0 sm:flex-row sm:items-center ${
        isDone ? 'bg-ink-50/40 opacity-80' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">
            {item.jira_issue_key}
          </span>
          <p className={`truncate font-semibold ${isDone ? 'text-ink-600' : 'text-ink-900'}`}>
            {item.name}
          </p>
          {!isDone && <LimboBadge updatedAt={item.updated_at} />}
          {isDone && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              Done
            </span>
          )}
        </div>
        <p className="truncate text-sm text-ink-500">
          {item.status ?? '—'}
          {item.assignee ? ` · ${item.assignee}` : ''}
          {item.updated_at ? ` · ${new Date(item.updated_at).toLocaleDateString()}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.jira_url && (
          <a
            href={item.jira_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <ExternalLink style={{ width: 14, height: 14 }} />
            Jira
          </a>
        )}
        {localIssueId ? (
          <Link to={`/issues/${localIssueId}`}>
            <Button variant="secondary" size="sm">
              {t('issues.jira.openExisting')}
            </Button>
          </Link>
        ) : (
          !isDone && (
            <PermissionGate permission="issues.create">
              <Button size="sm" loading={importing} onClick={() => onImport(item, projectKey)}>
                {t('issues.jira.startResolution')}
              </Button>
            </PermissionGate>
          )
        )}
      </div>
    </motion.div>
  );
}

function matchesJiraItemQuery(query: string, item: JiraItem): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.jira_issue_key.toLowerCase().includes(q) ||
    item.name.toLowerCase().includes(q) ||
    (item.status ?? '').toLowerCase().includes(q) ||
    (item.assignee ?? '').toLowerCase().includes(q)
  );
}

function JiraProjectSection({
  project,
  statusFilter,
  issueQuery,
  onImport,
  onRefresh,
  refreshing,
  importing,
}: {
  project: JiraProjectItemsResult;
  statusFilter: ExternalStatusFilter;
  issueQuery: string;
  onImport: (item: JiraItem, projectKey: string) => void;
  onRefresh: (projectKey: string) => void;
  refreshing: boolean;
  importing: boolean;
}) {
  const { t } = useTranslation();
  const theme = mondayBoardTheme(project.project_key);
  const openItems = (project.open_items ?? project.items).filter((item) =>
    matchesJiraItemQuery(issueQuery, item),
  );
  const doneItems = (project.done_items ?? []).filter((item) =>
    matchesJiraItemQuery(issueQuery, item),
  );
  const counts = {
    open: openItems.length,
    done: doneItems.length,
    total: openItems.length + doneItems.length,
  };
  const showOpen = statusFilter === 'all' || statusFilter === 'open';
  const showDone = statusFilter === 'all' || statusFilter === 'done';
  const visibleCount =
    statusFilter === 'open'
      ? counts.open
      : statusFilter === 'done'
        ? counts.done
        : counts.total;

  return (
    <Card className={`overflow-hidden ${theme.card} ${theme.accent}`}>
      <div
        className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ${theme.header}`}
      >
        <div>
          <h3 className={`text-sm font-extrabold ${theme.title}`}>{project.label}</h3>
          <p className={`text-xs ${theme.subtitle}`}>
            {project.jira_project_key} · {counts.open} {t('issues.jira.openItems')} · {counts.done}{' '}
            Done
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={refreshing}
          onClick={() => onRefresh(project.project_key)}
        >
          <RefreshCw style={{ width: 14, height: 14 }} />
          {t('issues.jira.refreshProject')}
        </Button>
      </div>

      {visibleCount === 0 ? (
        <p className="p-6 text-sm text-ink-500">
          {issueQuery.trim()
            ? t('issues.jira.filterEmpty')
            : statusFilter === 'open'
              ? t('issues.jira.noOpenItems')
              : statusFilter === 'done'
                ? t('issues.jira.noDoneItems')
                : t('issues.jira.emptyProject')}
        </p>
      ) : (
        <>
          {showOpen &&
            (openItems.length === 0 ? (
              <p className="border-b border-ink-100 px-6 py-4 text-sm text-ink-500">
                {issueQuery.trim() ? t('issues.jira.filterEmpty') : t('issues.jira.noOpenItems')}
              </p>
            ) : (
              openItems.map((item, index) => (
                <JiraItemRow
                  key={item.jira_issue_key}
                  item={item}
                  projectKey={project.project_key}
                  index={index}
                  localIssueId={project.local_issue_by_jira_key[item.jira_issue_key]}
                  onImport={onImport}
                  importing={importing}
                />
              ))
            ))}

          {showDone && doneItems.length > 0 && (
            <>
              {statusFilter === 'all' && (
                <div className="border-y border-ink-100 bg-ink-50/80 px-6 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    {t('issues.jira.doneSection')} ({doneItems.length})
                  </p>
                </div>
              )}
              {doneItems.map((item, index) => (
                <JiraItemRow
                  key={`done-${item.jira_issue_key}`}
                  item={item}
                  projectKey={project.project_key}
                  index={index}
                  isDone
                  localIssueId={project.local_issue_by_jira_key[item.jira_issue_key]}
                  onImport={onImport}
                  importing={importing}
                />
              ))}
            </>
          )}
        </>
      )}
    </Card>
  );
}

export function IssuesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab =
    searchParams.get('tab') === 'monday'
      ? 'monday'
      : searchParams.get('tab') === 'jira'
        ? 'jira'
        : 'local';
  const [tab, setTab] = useState<IssuesTab>(initialTab);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [systemId, setSystemId] = useState('');
  const [refreshingBoardKey, setRefreshingBoardKey] = useState<string | null>(null);
  const [refreshingProjectKey, setRefreshingProjectKey] = useState<string | null>(null);
  const [externalStatusFilter, setExternalStatusFilter] = useState<ExternalStatusFilter>('all');
  const [jiraProjectFilter, setJiraProjectFilter] = useState(
    () => searchParams.get('project') ?? '',
  );
  const [jiraIssueQuery, setJiraIssueQuery] = useState(() => searchParams.get('q') ?? '');
  const { data: systemsData } = useSystems();

  function syncJiraUrl(nextTab: IssuesTab, project: string, query: string) {
    const params = new URLSearchParams();
    if (nextTab !== 'local') params.set('tab', nextTab);
    if (nextTab === 'jira') {
      if (project) params.set('project', project);
      if (query.trim()) params.set('q', query.trim());
    }
    setSearchParams(params, { replace: true });
  }

  function switchTab(next: IssuesTab) {
    setTab(next);
    syncJiraUrl(next, jiraProjectFilter, jiraIssueQuery);
  }

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status ? (status as IssueStatus) : undefined,
      priority: priority ? (priority as IssuePriority) : undefined,
      system_id: systemId ? Number(systemId) : undefined,
    }),
    [search, status, priority, systemId],
  );

  const { data, isLoading, isError } = useIssues(params);
  const mondayInbox = useMondayInbox(tab === 'monday');
  const jiraInbox = useJiraInbox(tab === 'jira');
  const importMondayMutation = useImportMondayItem();
  const importJiraMutation = useImportJiraItem();
  const issues = data?.issues ?? [];

  const filteredJiraProjects = useMemo(() => {
    const projects = jiraInbox.data?.projects ?? [];
    return projects.filter((project) => {
      if (jiraProjectFilter && project.project_key !== jiraProjectFilter) return false;
      if (!jiraIssueQuery.trim()) return true;
      const q = jiraIssueQuery.trim().toLowerCase();
      const prefix = q.includes('-') ? q.split('-')[0] : q;
      const projectMatches =
        project.project_key.toLowerCase() === prefix ||
        project.jira_project_key.toLowerCase() === prefix ||
        project.label.toLowerCase().includes(q);
      const hasMatchingItem =
        (project.open_items ?? project.items).some((item) => matchesJiraItemQuery(q, item)) ||
        (project.done_items ?? []).some((item) => matchesJiraItemQuery(q, item));
      return projectMatches || hasMatchingItem;
    });
  }, [jiraInbox.data?.projects, jiraProjectFilter, jiraIssueQuery]);

  async function handleImportMonday(item: MondayItem, boardKey: string) {
    const result = await importMondayMutation.mutateAsync({
      mondayItemId: item.monday_item_id,
      boardKey,
    });
    navigate(`/issues/${result.issue_id}`);
  }

  async function handleImportJira(item: JiraItem, projectKey: string) {
    const result = await importJiraMutation.mutateAsync({
      jiraIssueKey: item.jira_issue_key,
      projectKey,
    });
    navigate(`/issues/${result.issue_id}`);
  }

  async function handleRefreshBoard(boardKey: string) {
    setRefreshingBoardKey(boardKey);
    try {
      await mondayInbox.refreshBoard(boardKey);
    } finally {
      setRefreshingBoardKey(null);
    }
  }

  async function handleRefreshProject(projectKey: string) {
    setRefreshingProjectKey(projectKey);
    try {
      await jiraInbox.refreshProject(projectKey);
    } finally {
      setRefreshingProjectKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchTab('local')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            tab === 'local' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
          }`}
        >
          {t('issues.monday.tabLocal')}
        </button>
        <button
          type="button"
          onClick={() => switchTab('monday')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            tab === 'monday' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
          }`}
        >
          {t('issues.monday.tabMonday')}
        </button>
        <button
          type="button"
          onClick={() => switchTab('jira')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            tab === 'jira' ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
          }`}
        >
          {t('issues.jira.tabJira')}
        </button>
      </div>

      {tab === 'local' && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <div className="lg:max-w-xs lg:flex-1">
              <Input
                placeholder={t('issues.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search style={{ width: 18, height: 18 }} />}
              />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-44">
              <option value="">{t('issues.allStatuses')}</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`issues.statuses.${value}`)}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="lg:w-44">
              <option value="">{t('issues.allPriorities')}</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`issues.priorities.${value}`)}
                </option>
              ))}
            </Select>
            <Select value={systemId} onChange={(e) => setSystemId(e.target.value)} className="lg:w-48">
              <option value="">{t('issues.allSystems')}</option>
              {(systemsData ?? []).map((system) => (
                <option key={system.system_id} value={system.system_id}>
                  {system.name}
                </option>
              ))}
            </Select>
          </div>
          <PermissionGate permission="issues.create">
            <Link to="/issues/new">
              <Button>
                <Plus style={{ width: 18, height: 18 }} />
                {t('issues.newIssue')}
              </Button>
            </Link>
          </PermissionGate>
        </div>
      )}

      {tab === 'local' && (
        <Card>
          {isError && <p className="p-6 text-sm text-red-600">{t('issues.loadError')}</p>}
          {isLoading && <p className="p-6 text-sm text-ink-500">{t('common.loading')}</p>}
          {!isLoading && !isError && issues.length === 0 && (
            <p className="p-6 text-sm text-ink-500">{t('issues.empty')}</p>
          )}
          {issues.map((issue, index) => (
            <IssueRow key={issue.issue_id} issue={issue} index={index} />
          ))}
        </Card>
      )}

      {tab === 'monday' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('issues.monday.inboxTitle')}</p>
              <p className="text-sm text-ink-500">{t('issues.monday.inboxHint')}</p>
              {mondayInbox.data && (
                <p className="mt-1 text-xs text-ink-400">
                  {mondayInbox.data.workspace} · {mondayInbox.data.boards.length}{' '}
                  {t('issues.monday.boards')}
                  {mondayInbox.data.synced_at && (
                    <>
                      {' '}
                      · {t('issues.monday.lastSynced')}{' '}
                      {new Date(mondayInbox.data.synced_at).toLocaleString()}
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Select
                value={externalStatusFilter}
                onChange={(e) => setExternalStatusFilter(e.target.value as ExternalStatusFilter)}
                className="w-40"
              >
                <option value="all">{t('issues.monday.filterAll')}</option>
                <option value="open">{t('issues.monday.filterOpen')}</option>
                <option value="done">{t('issues.monday.filterDone')}</option>
              </Select>
              <Button
                variant="secondary"
                loading={mondayInbox.isFetching && !refreshingBoardKey}
                onClick={() => mondayInbox.refreshAll()}
              >
                <RefreshCw style={{ width: 16, height: 16 }} />
                {t('issues.monday.refreshAll')}
              </Button>
            </div>
          </div>

          {mondayInbox.isError && (
            <Card className="p-6 text-sm text-red-600">
              {extractErrorMessage(mondayInbox.error)}
            </Card>
          )}

          {mondayInbox.isLoading && (
            <Card className="p-6 text-sm text-ink-500">{t('common.loading')}</Card>
          )}

          {!mondayInbox.isLoading &&
            !mondayInbox.isError &&
            (mondayInbox.data?.boards.length ?? 0) === 0 && (
              <Card className="p-6 text-sm text-ink-500">{t('issues.monday.empty')}</Card>
            )}

          {(mondayInbox.data?.boards ?? []).map((board) => (
            <MondayBoardSection
              key={board.board_key}
              board={board}
              statusFilter={externalStatusFilter}
              onImport={handleImportMonday}
              onRefresh={handleRefreshBoard}
              refreshing={refreshingBoardKey === board.board_key}
              importing={importMondayMutation.isPending}
            />
          ))}
        </div>
      )}

      {tab === 'jira' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('issues.jira.inboxTitle')}</p>
              <p className="text-sm text-ink-500">{t('issues.jira.inboxHint')}</p>
              {jiraInbox.data && (
                <p className="mt-1 text-xs text-ink-400">
                  {jiraInbox.data.site} · {jiraInbox.data.projects.length}{' '}
                  {t('issues.jira.projects')}
                  {jiraInbox.data.synced_at && (
                    <>
                      {' '}
                      · {t('issues.jira.lastSynced')}{' '}
                      {new Date(jiraInbox.data.synced_at).toLocaleString()}
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Select
                value={jiraProjectFilter}
                onChange={(e) => {
                  const value = e.target.value;
                  setJiraProjectFilter(value);
                  syncJiraUrl('jira', value, jiraIssueQuery);
                }}
                className="w-48"
              >
                <option value="">{t('issues.jira.filterAllProjects')}</option>
                {(jiraInbox.data?.projects ?? []).map((project) => (
                  <option key={project.project_key} value={project.project_key}>
                    {project.label} ({project.jira_project_key})
                  </option>
                ))}
              </Select>
              <div className="w-48">
                <Input
                  value={jiraIssueQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setJiraIssueQuery(value);
                    syncJiraUrl('jira', jiraProjectFilter, value);
                  }}
                  placeholder={t('issues.jira.filterIssuePlaceholder')}
                  icon={<Search style={{ width: 16, height: 16 }} />}
                />
              </div>
              <Select
                value={externalStatusFilter}
                onChange={(e) => setExternalStatusFilter(e.target.value as ExternalStatusFilter)}
                className="w-40"
              >
                <option value="all">{t('issues.jira.filterAll')}</option>
                <option value="open">{t('issues.jira.filterOpen')}</option>
                <option value="done">{t('issues.jira.filterDone')}</option>
              </Select>
              <Button
                variant="secondary"
                loading={jiraInbox.isFetching && !refreshingProjectKey}
                onClick={() => jiraInbox.refreshAll()}
              >
                <RefreshCw style={{ width: 16, height: 16 }} />
                {t('issues.jira.refreshAll')}
              </Button>
            </div>
          </div>

          {jiraInbox.isError && (
            <Card className="p-6 text-sm text-red-600">
              {extractErrorMessage(jiraInbox.error)}
            </Card>
          )}

          {jiraInbox.isLoading && (
            <Card className="p-6 text-sm text-ink-500">{t('common.loading')}</Card>
          )}

          {!jiraInbox.isLoading &&
            !jiraInbox.isError &&
            (jiraInbox.data?.projects.length ?? 0) === 0 && (
              <Card className="p-6 text-sm text-ink-500">{t('issues.jira.empty')}</Card>
            )}

          {!jiraInbox.isLoading &&
            !jiraInbox.isError &&
            (jiraInbox.data?.projects.length ?? 0) > 0 &&
            filteredJiraProjects.length === 0 && (
              <Card className="p-6 text-sm text-ink-500">{t('issues.jira.filterEmpty')}</Card>
            )}

          {filteredJiraProjects.map((project) => (
            <JiraProjectSection
              key={project.project_key}
              project={project}
              statusFilter={externalStatusFilter}
              issueQuery={jiraIssueQuery}
              onImport={handleImportJira}
              onRefresh={handleRefreshProject}
              refreshing={refreshingProjectKey === project.project_key}
              importing={importJiraMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
