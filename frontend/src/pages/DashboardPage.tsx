import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  Hourglass,
  LayoutList,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardOverview } from '@/hooks/useDashboard';
import { formatMondaySourceLabel, mondayBoardBarColor } from '@/lib/mondayBoardThemes';
import { STALE_ISSUE_DAYS } from '@/lib/staleIssue';
import type { JiraDashboardSummary, MondayDashboardSummary } from '@/types';

const DASHBOARD_SOURCE_KEY = 'dataaxis-hulp-dashboard-issue-source';
type IssueSource = 'monday' | 'jira';

function matchesIssueQuery(
  query: string,
  item: { key?: string; label?: string; jira_project_key?: string },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const projectPrefix = q.includes('-') ? q.split('-')[0] : q;
  return (
    (item.key ?? '').toLowerCase().includes(q) ||
    (item.label ?? '').toLowerCase().includes(q) ||
    (item.jira_project_key ?? '').toLowerCase() === projectPrefix ||
    (item.jira_project_key ?? '').toLowerCase().includes(q) ||
    (item.key ?? '').toLowerCase() === projectPrefix
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="h-full p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>{icon}</div>
        <p className="mt-4 text-2xl font-extrabold text-ink-900">{value}</p>
        <p className="text-sm font-medium text-ink-700">{label}</p>
      </Card>
    </motion.div>
  );
}

function ExternalSourcePanel({
  source,
  monday,
  jira,
  isFetching,
  onRefresh,
  projectFilter,
  issueQuery,
  assigneeFilter,
  onProjectFilterChange,
  onIssueQueryChange,
  onAssigneeFilterChange,
}: {
  source: IssueSource;
  monday: MondayDashboardSummary | null | undefined;
  jira: JiraDashboardSummary | null | undefined;
  isFetching: boolean;
  onRefresh: () => void;
  projectFilter: string;
  issueQuery: string;
  assigneeFilter: string;
  onProjectFilterChange: (value: string) => void;
  onIssueQueryChange: (value: string) => void;
  onAssigneeFilterChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const isMonday = source === 'monday';
  const summary = isMonday ? monday : jira;

  if (!summary?.configured) {
    return (
      <Card className="p-6 text-sm text-ink-500">
        {isMonday ? t('dashboard.monday.notConfigured') : t('dashboard.jira.notConfigured')}
      </Card>
    );
  }

  if (!isMonday && jira?.error) {
    return (
      <Card className="space-y-2 border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-semibold">{t('dashboard.jira.syncError')}</p>
        <p>{jira.error}</p>
      </Card>
    );
  }

  const assignees = isMonday ? (monday?.assignees ?? []) : (jira?.assignees ?? []);
  const staleItems = (isMonday ? monday?.stale_items : jira?.stale_items) ?? [];

  const allRows = isMonday
    ? (monday?.by_board ?? []).map((board) => ({
        key: board.board_key,
        label: formatMondaySourceLabel(board.label, board.group),
        open: board.open,
        done: board.done,
        total: board.total,
        stale_open: board.stale_open ?? 0,
        jira_project_key: undefined as string | undefined,
      }))
    : (jira?.by_project ?? []).map((project) => ({
        key: project.project_key,
        label: project.label,
        open: project.open,
        done: project.done,
        total: project.total,
        stale_open: project.stale_open ?? 0,
        jira_project_key: project.jira_project_key ?? project.project_key,
      }));

  const rows = allRows.filter((row) => {
    if (projectFilter && row.key !== projectFilter) return false;
    if (!isMonday && issueQuery.trim()) {
      return matchesIssueQuery(issueQuery, {
        key: row.key,
        label: row.label,
        jira_project_key: row.jira_project_key,
      });
    }
    if (isMonday && issueQuery.trim()) {
      const q = issueQuery.trim().toLowerCase();
      return row.label.toLowerCase().includes(q) || row.key.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredStaleForAssignee = staleItems.filter((item) => {
    if (projectFilter) {
      const groupKey =
        'board_key' in item && typeof item.board_key === 'string'
          ? item.board_key
          : 'project_key' in item
            ? item.project_key
            : '';
      if (groupKey !== projectFilter) return false;
    }
    if (!assigneeFilter) return true;
    if (assigneeFilter === '__unassigned__') return !item.assignee?.trim();
    const people = (item.assignee ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return people.includes(assigneeFilter);
  });

  const filteredTotals = rows.reduce(
    (acc, row) => ({
      open: acc.open + row.open,
      done: acc.done + row.done,
      total: acc.total + row.total,
      stale_open: acc.stale_open + row.stale_open,
    }),
    { open: 0, done: 0, total: 0, stale_open: 0 },
  );
  if (assigneeFilter) {
    filteredTotals.stale_open = filteredStaleForAssignee.length;
  }

  const subtitleBits = [
    isMonday ? t('dashboard.monday.subtitle') : t('dashboard.jira.subtitle'),
    isMonday ? monday?.workspace : jira?.site,
  ].filter(Boolean);

  const issueKeyLookup = issueQuery.trim().toUpperCase();
  const looksLikeIssueKey = /^[A-Z][A-Z0-9]+-\d+$/i.test(issueKeyLookup);
  const inboxLink = isMonday
    ? `/issues?tab=monday${assigneeFilter ? `&assignee=${encodeURIComponent(assigneeFilter)}` : ''}`
    : `/issues?tab=jira${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ''}${
        issueQuery.trim() ? `&q=${encodeURIComponent(issueQuery.trim())}` : ''
      }${assigneeFilter ? `&assignee=${encodeURIComponent(assigneeFilter)}` : ''}`;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-ink-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold text-ink-900">
            <ExternalLink style={{ width: 20, height: 20 }} className="text-brand-600" />
            {isMonday ? t('dashboard.monday.title') : t('dashboard.jira.title')}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            {subtitleBits.join(' · ')}
            {summary.last_synced_at && (
              <>
                {' '}
                · {isMonday ? t('dashboard.monday.lastSynced') : t('dashboard.jira.lastSynced')}{' '}
                {new Date(summary.last_synced_at).toLocaleString()}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to={inboxLink}>
            <Button variant="secondary" size="sm">
              {isMonday ? t('dashboard.monday.viewInbox') : t('dashboard.jira.viewInbox')}
            </Button>
          </Link>
          <Button variant="secondary" size="sm" loading={isFetching} onClick={onRefresh}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            {isMonday ? t('dashboard.monday.refresh') : t('dashboard.jira.refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-ink-100 px-6 py-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            {isMonday ? t('dashboard.filterBoard') : t('dashboard.filterProject')}
          </label>
          <Select
            value={projectFilter}
            onChange={(event) => onProjectFilterChange(event.target.value)}
          >
            <option value="">{t('dashboard.filterAllGroups')}</option>
            {allRows.map((row) => (
              <option key={row.key} value={row.key}>
                {row.label}
                {row.jira_project_key ? ` (${row.jira_project_key.toUpperCase()})` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t('dashboard.filterPerson')}
          </label>
          <Select
            value={assigneeFilter}
            onChange={(event) => onAssigneeFilterChange(event.target.value)}
          >
            <option value="">{t('dashboard.filterAllPeople')}</option>
            <option value="__unassigned__">{t('dashboard.filterUnassigned')}</option>
            {assignees.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t('dashboard.filterIssue')}
          </label>
          <Input
            value={issueQuery}
            onChange={(event) => onIssueQueryChange(event.target.value)}
            placeholder={t('dashboard.filterIssuePlaceholder')}
          />
          {looksLikeIssueKey && (
            <p className="mt-1.5 text-xs text-ink-500">
              <Link className="font-semibold text-brand-700 hover:underline" to={inboxLink}>
                {t('dashboard.openIssueInInbox', { key: issueKeyLookup })}
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-6 lg:grid-cols-5">
        <div>
          <p className="text-2xl font-extrabold text-amber-600">{filteredTotals.open}</p>
          <p className="text-sm text-ink-600">
            {isMonday ? t('dashboard.monday.open') : t('dashboard.jira.open')}
          </p>
        </div>
        <div>
          <p
            className={`text-2xl font-extrabold ${
              filteredTotals.stale_open > 0 ? 'text-orange-600' : 'text-ink-400'
            }`}
          >
            {filteredTotals.stale_open}
          </p>
          <p className="text-sm text-ink-600">{t('dashboard.limbo')}</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-emerald-600">{filteredTotals.done}</p>
          <p className="text-sm text-ink-600">
            {isMonday ? t('dashboard.monday.done') : t('dashboard.jira.done')}
          </p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-ink-900">{filteredTotals.total}</p>
          <p className="text-sm text-ink-600">
            {isMonday ? t('dashboard.monday.total') : t('dashboard.jira.total')}
          </p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-brand-600">{summary.totals.imported_local}</p>
          <p className="text-sm text-ink-600">
            {isMonday ? t('dashboard.monday.imported') : t('dashboard.jira.imported')}
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-3 border-t border-ink-100 px-6 pb-6 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
            {isMonday ? t('dashboard.monday.byBoard') : t('dashboard.jira.byProject')}
          </p>
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-ink-700">{row.label}</span>
                <span className="shrink-0 text-ink-500">
                  {row.open} {t('issues.monday.openItems')}
                  {row.stale_open > 0 ? ` · ${row.stale_open} limbo` : ''} · {row.done} Done ·{' '}
                  {row.total} total
                </span>
              </div>
              <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full ${mondayBoardBarColor(row.key)}`}
                  style={{
                    width: `${Math.min(100, (row.open / Math.max(row.total, 1)) * 100)}%`,
                  }}
                />
                <div
                  className="h-full bg-emerald-300"
                  style={{
                    width: `${Math.min(100, (row.done / Math.max(row.total, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-t border-ink-100 px-6 py-4 text-sm text-ink-500">
          {t('dashboard.filterEmpty')}
        </p>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useDashboardOverview();
  const [source, setSource] = useState<IssueSource>(() => {
    const stored = localStorage.getItem(DASHBOARD_SOURCE_KEY);
    return stored === 'jira' ? 'jira' : 'monday';
  });
  const [projectFilter, setProjectFilter] = useState('');
  const [issueQuery, setIssueQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

  useEffect(() => {
    localStorage.setItem(DASHBOARD_SOURCE_KEY, source);
  }, [source]);

  useEffect(() => {
    setProjectFilter('');
    setIssueQuery('');
    setAssigneeFilter('');
  }, [source]);

  const availableSources = useMemo(() => {
    const list: IssueSource[] = [];
    if (data?.monday?.configured) list.push('monday');
    if (data?.jira?.configured) list.push('jira');
    return list;
  }, [data?.monday?.configured, data?.jira?.configured]);

  useEffect(() => {
    if (availableSources.length === 0) return;
    if (!availableSources.includes(source)) {
      setSource(availableSources[0]);
    }
  }, [availableSources, source]);

  const externalStats = useMemo(() => {
    if (!data) return null;

    if (source === 'jira' && data.jira?.configured && !data.jira.error) {
      const rows = data.jira.by_project.filter((project) => {
        if (projectFilter && project.project_key !== projectFilter) return false;
        if (issueQuery.trim()) {
          return matchesIssueQuery(issueQuery, {
            key: project.project_key,
            label: project.label,
            jira_project_key: project.jira_project_key ?? project.project_key,
          });
        }
        return true;
      });
      const totals = rows.reduce(
        (acc, row) => ({
          total: acc.total + row.total,
          open: acc.open + row.open,
          done: acc.done + row.done,
        }),
        { total: 0, open: 0, done: 0 },
      );
      return {
        total: totals.total,
        open: totals.open,
        done: totals.done,
        stale: rows.reduce((acc, row) => acc + (row.stale_open ?? 0), 0),
        imported: data.jira.totals.imported_local,
        groups: rows.length,
        groupLabel: t('dashboard.jiraProjects'),
      };
    }

    if (source === 'monday' && data.monday?.configured) {
      const rows = data.monday.by_board.filter((board) => {
        if (projectFilter && board.board_key !== projectFilter) return false;
        if (issueQuery.trim()) {
          const q = issueQuery.trim().toLowerCase();
          return (
            board.label.toLowerCase().includes(q) ||
            (board.group ?? '').toLowerCase().includes(q) ||
            board.board_key.toLowerCase().includes(q)
          );
        }
        return true;
      });
      const totals = rows.reduce(
        (acc, row) => ({
          total: acc.total + row.total,
          open: acc.open + row.open,
          done: acc.done + row.done,
        }),
        { total: 0, open: 0, done: 0 },
      );
      return {
        total: totals.total,
        open: totals.open,
        done: totals.done,
        stale: rows.reduce((acc, row) => acc + (row.stale_open ?? 0), 0),
        imported: data.monday.totals.imported_local,
        groups: rows.length,
        groupLabel: t('dashboard.mondayBoards'),
      };
    }

    return null;
  }, [data, source, projectFilter, issueQuery, t]);

  const staleThreshold = data?.stale_threshold_days ?? STALE_ISSUE_DAYS;

  function matchesPerson(assignee: string | null | undefined, filter: string): boolean {
    if (!filter) return true;
    if (filter === '__unassigned__') return !assignee?.trim();
    const people = (assignee ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return people.includes(filter);
  }

  const limboPreview = useMemo(() => {
    if (!data) return [];
    if (source === 'jira') {
      return (data.jira?.stale_items ?? [])
        .filter((item) => !projectFilter || item.project_key === projectFilter)
        .filter((item) => matchesPerson(item.assignee, assigneeFilter))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          title: item.key ? `${item.key} · ${item.title}` : item.title,
          meta: [item.project_label, item.assignee].filter(Boolean).join(' · '),
          days: item.days_stale,
          href: item.url,
          localHref: `/issues?tab=jira&project=${encodeURIComponent(item.project_key)}&q=${encodeURIComponent(item.key)}${
            item.assignee ? `&assignee=${encodeURIComponent(item.assignee)}` : ''
          }`,
        }));
    }
    if (source === 'monday') {
      return (data.monday?.stale_items ?? [])
        .filter((item) => !projectFilter || item.board_key === projectFilter)
        .filter((item) => matchesPerson(item.assignee, assigneeFilter))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          title: item.title,
          meta: [formatMondaySourceLabel(item.board_label, item.group), item.assignee]
            .filter(Boolean)
            .join(' · '),
          days: item.days_stale,
          href: item.url,
          localHref: `/issues?tab=monday&q=${encodeURIComponent(item.title)}${
            item.assignee ? `&assignee=${encodeURIComponent(item.assignee.split(',')[0].trim())}` : ''
          }`,
        }));
    }
    return (data.stale_issues ?? []).map((item) => ({
      id: String(item.issue_id),
      title: item.title,
      meta: item.system_name,
      days: item.days_stale,
      href: null as string | null,
      localHref: `/issues/${item.issue_id}`,
    }));
  }, [data, source, projectFilter, assigneeFilter]);

  const limboCount = useMemo(() => {
    if (source === 'jira') {
      return (data?.jira?.stale_items ?? []).filter(
        (item) =>
          (!projectFilter || item.project_key === projectFilter) &&
          matchesPerson(item.assignee, assigneeFilter),
      ).length;
    }
    if (source === 'monday') {
      return (data?.monday?.stale_items ?? []).filter(
        (item) =>
          (!projectFilter || item.board_key === projectFilter) &&
          matchesPerson(item.assignee, assigneeFilter),
      ).length;
    }
    return data?.totals.stale_open ?? 0;
  }, [data, source, projectFilter, assigneeFilter]);

  const limboInboxLink =
    source === 'jira'
      ? `/issues?tab=jira${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ''}${
          assigneeFilter ? `&assignee=${encodeURIComponent(assigneeFilter)}` : ''
        }`
      : source === 'monday'
        ? `/issues?tab=monday${assigneeFilter ? `&assignee=${encodeURIComponent(assigneeFilter)}` : ''}`
        : '/issues';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white shadow-glow"
      >
        <p className="text-sm text-white/70">
          {t('dashboard.subtitle', { name: user?.full_name ?? user?.username ?? '' })}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold">{t('dashboard.title')}</h2>
        <p className="mt-2 max-w-xl text-white/80">{t('dashboard.description')}</p>
      </motion.div>

      {isError && <Card className="p-6 text-sm text-red-600">{t('dashboard.loadError')}</Card>}

      {isLoading || !data ? (
        <Card className="p-10 text-center text-sm text-ink-500">{t('common.loading')}</Card>
      ) : (
        <>
          {availableSources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-sm font-semibold text-ink-700">{t('dashboard.sourceLabel')}</p>
              <button
                type="button"
                disabled={!data.monday?.configured}
                onClick={() => setSource('monday')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  source === 'monday'
                    ? 'bg-brand-600 text-white'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40'
                }`}
              >
                {t('dashboard.sourceMonday')}
              </button>
              <button
                type="button"
                disabled={!data.jira?.configured}
                onClick={() => setSource('jira')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  source === 'jira'
                    ? 'bg-brand-600 text-white'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40'
                }`}
              >
                {t('dashboard.sourceJira')}
              </button>
              <p className="text-xs text-ink-500">
                {source === 'jira'
                  ? t('dashboard.statsFromJira')
                  : t('dashboard.statsFromMonday')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {externalStats ? (
              <>
                <StatCard
                  icon={<LayoutList style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.totalIssues')}
                  value={String(externalStats.total)}
                  accent="bg-brand-50 text-brand-600"
                  delay={0.05}
                />
                <StatCard
                  icon={<AlertTriangle style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.open')}
                  value={String(externalStats.open)}
                  accent="bg-amber-50 text-amber-600"
                  delay={0.1}
                />
                <StatCard
                  icon={<Hourglass style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.limbo')}
                  value={String(limboCount)}
                  accent={
                    limboCount > 0
                      ? 'bg-orange-50 text-orange-600'
                      : 'bg-ink-50 text-ink-500'
                  }
                  delay={0.15}
                />
                <StatCard
                  icon={<CheckCircle2 style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.done')}
                  value={String(externalStats.done)}
                  accent="bg-emerald-50 text-emerald-600"
                  delay={0.2}
                />
                <StatCard
                  icon={<ExternalLink style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.imported')}
                  value={String(externalStats.imported)}
                  accent="bg-sky-50 text-sky-600"
                  delay={0.25}
                />
                <StatCard
                  icon={<ShieldAlert style={{ width: 22, height: 22 }} />}
                  label={externalStats.groupLabel}
                  value={String(externalStats.groups)}
                  accent="bg-red-50 text-red-600"
                  delay={0.3}
                />
              </>
            ) : (
              <>
                <StatCard
                  icon={<LayoutList style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.totalIssues')}
                  value={String(data.totals.issues)}
                  accent="bg-brand-50 text-brand-600"
                  delay={0.05}
                />
                <StatCard
                  icon={<AlertTriangle style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.open')}
                  value={String(data.totals.open)}
                  accent="bg-amber-50 text-amber-600"
                  delay={0.1}
                />
                <StatCard
                  icon={<Hourglass style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.limbo')}
                  value={String(data.totals.stale_open ?? 0)}
                  accent={
                    (data.totals.stale_open ?? 0) > 0
                      ? 'bg-orange-50 text-orange-600'
                      : 'bg-ink-50 text-ink-500'
                  }
                  delay={0.15}
                />
                <StatCard
                  icon={<Loader2 style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.inProgress')}
                  value={String(data.totals.in_progress)}
                  accent="bg-sky-50 text-sky-600"
                  delay={0.2}
                />
                <StatCard
                  icon={<CheckCircle2 style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.resolved')}
                  value={String(data.totals.resolved)}
                  accent="bg-emerald-50 text-emerald-600"
                  delay={0.25}
                />
                <StatCard
                  icon={<Database style={{ width: 22, height: 22 }} />}
                  label={t('dashboard.systems')}
                  value={String(data.totals.systems)}
                  accent="bg-violet-50 text-violet-600"
                  delay={0.3}
                />
              </>
            )}
          </div>

          {limboCount > 0 && (
            <Card className="border-orange-200 bg-orange-50/60">
              <div className="flex flex-col gap-3 border-b border-orange-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-extrabold text-orange-900">
                    <Hourglass style={{ width: 20, height: 20 }} />
                    {t('dashboard.limboTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-orange-800/80">
                    {t('dashboard.limboHint', { days: staleThreshold })} · {limboCount}
                  </p>
                </div>
                <Link to={limboInboxLink}>
                  <Button variant="secondary" size="sm">
                    {t('dashboard.limboViewInbox')}
                  </Button>
                </Link>
              </div>
              {limboPreview.length === 0 ? (
                <p className="p-6 text-sm text-orange-800/70">{t('dashboard.limboEmpty')}</p>
              ) : (
                <div className="divide-y divide-orange-100">
                  {limboPreview.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-6 py-3"
                    >
                      <div className="min-w-0">
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <Link
                            to={item.localHref}
                            className="block truncate font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {item.title}
                          </Link>
                        )}
                        <p className="truncate text-xs text-ink-500">{item.meta}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                          {t('dashboard.limboDays', { count: item.days })}
                        </span>
                        {item.href && (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            title={t('dashboard.openExternalDetail')}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                          >
                            <ExternalLink style={{ width: 14, height: 14 }} />
                            {source === 'jira' ? 'Jira' : source === 'monday' ? 'Monday' : ''}
                          </a>
                        )}
                        <Link
                          to={item.localHref}
                          className="text-xs font-semibold text-ink-600 hover:text-brand-700 hover:underline"
                        >
                          {t('dashboard.limboViewInbox')}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {availableSources.length > 0 && (
            <ExternalSourcePanel
              source={source}
              monday={data.monday}
              jira={data.jira}
              isFetching={isFetching}
              onRefresh={() => void refetch()}
              projectFilter={projectFilter}
              issueQuery={issueQuery}
              assigneeFilter={assigneeFilter}
              onProjectFilterChange={setProjectFilter}
              onIssueQueryChange={setIssueQuery}
              onAssigneeFilterChange={setAssigneeFilter}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('dashboard.recent')} icon={<AlertTriangle style={{ width: 20, height: 20 }} />} />
              <div className="divide-y divide-ink-100">
                {data.recent_issues.length === 0 ? (
                  <p className="p-6 text-sm text-ink-500">{t('dashboard.noRecent')}</p>
                ) : (
                  data.recent_issues.map((issue) => (
                    <Link
                      key={issue.issue_id}
                      to={`/issues/${issue.issue_id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-ink-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-ink-900">{issue.title}</p>
                          {issue.source === 'monday' && (
                            <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">
                              Monday
                            </span>
                          )}
                          {issue.source === 'jira' && (
                            <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">
                              Jira
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-500">
                          {issue.system_name} · {t(`issues.statuses.${issue.status}`, { defaultValue: issue.status })}
                        </p>
                      </div>
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                        {t(`issues.priorities.${issue.priority}`, { defaultValue: issue.priority })}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title={t('dashboard.bySystem')} icon={<Database style={{ width: 20, height: 20 }} />} />
              <div className="space-y-3 p-6">
                {data.by_system.length === 0 ? (
                  <p className="text-sm text-ink-500">{t('common.noData')}</p>
                ) : (
                  data.by_system.map((item) => (
                    <div key={item.system_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-ink-700">{item.name}</span>
                        <span className="text-ink-500">{item.count}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full bg-brand-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (item.count / Math.max(data.totals.issues, 1)) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
