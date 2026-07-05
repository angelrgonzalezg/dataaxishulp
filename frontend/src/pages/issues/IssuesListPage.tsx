import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { PermissionGate } from '@/components/PermissionGate';
import { useIssues } from '@/hooks/useIssues';
import { useSystems } from '@/hooks/useSystems';
import type { Issue, IssuePriority, IssueStatus } from '@/types';

const STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES: IssuePriority[] = ['low', 'medium', 'high', 'critical'];

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

function IssueRow({ issue, index }: { issue: Issue; index: number }) {
  const { t } = useTranslation();

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
          <p className="truncate font-semibold text-ink-900">{issue.title}</p>
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

export function IssuesListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [systemId, setSystemId] = useState('');
  const { data: systemsData } = useSystems();

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
  const issues = data?.issues ?? [];

  return (
    <div className="mx-auto max-w-5xl">
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
    </div>
  );
}
