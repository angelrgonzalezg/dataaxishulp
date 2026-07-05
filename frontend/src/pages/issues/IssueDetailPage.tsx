import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { PermissionGate } from '@/components/PermissionGate';
import { extractErrorMessage } from '@/api/client';
import { useIssue, useIssueMutations } from '@/hooks/useIssues';
import type { IssueStatus } from '@/types';

export function IssueDetailPage() {
  const { id } = useParams();
  const issueId = Number(id);
  const { t } = useTranslation();
  const { data: issue, isLoading, isError } = useIssue(issueId);
  const { update, resolve } = useIssueMutations();
  const [status, setStatus] = useState<IssueStatus | ''>('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  if (isLoading) {
    return <Card className="p-8 text-sm text-ink-500">{t('common.loading')}</Card>;
  }

  if (isError || !issue) {
    return <Card className="p-8 text-sm text-red-600">{t('issues.loadError')}</Card>;
  }

  async function onStatusChange() {
    if (!status) return;
    try {
      await update.mutateAsync({
        id: issueId,
        payload: { status, comment: `Status → ${status}` },
      });
      toast.success(t('issues.updateSuccess'));
      setStatus('');
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  async function onResolve() {
    if (!resolutionNotes.trim()) return;
    try {
      await resolve.mutateAsync({
        id: issueId,
        payload: { resolution_notes: resolutionNotes, status: 'resolved' },
      });
      toast.success(t('issues.resolveSuccess'));
      setResolutionNotes('');
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">#{issue.issue_id} · {issue.system.name}</p>
            <h2 className="mt-1 text-2xl font-extrabold text-ink-900">{issue.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{issue.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {t(`issues.statuses.${issue.status}`)}
            </span>
            <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
              {t(`issues.priorities.${issue.priority}`)}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 text-sm text-ink-600 sm:grid-cols-2">
          <p>
            <span className="font-semibold text-ink-800">{t('issues.createdBy')}: </span>
            {issue.created_by.full_name ?? issue.created_by.username}
          </p>
          <p>
            <span className="font-semibold text-ink-800">{t('issues.updatedAt')}: </span>
            {new Date(issue.updated_at).toLocaleString()}
          </p>
          {issue.category && (
            <p>
              <span className="font-semibold text-ink-800">{t('issues.categoryLabel')}: </span>
              {issue.category}
            </p>
          )}
          {issue.external_ref && (
            <p>
              <span className="font-semibold text-ink-800">{t('issues.externalRefLabel')}: </span>
              {issue.external_ref}
            </p>
          )}
          {issue.resolution_notes && (
            <p className="sm:col-span-2">
              <span className="font-semibold text-ink-800">{t('issues.resolutionLabel')}: </span>
              {issue.resolution_notes}
            </p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PermissionGate permission="issues.edit">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-ink-900">{t('issues.statusLabel')}</h3>
            <div className="flex gap-3">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus | '')}
                className="flex-1"
              >
                <option value="">{t('issues.allStatuses')}</option>
                {(['open', 'in_progress', 'resolved', 'closed'] as IssueStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {t(`issues.statuses.${value}`)}
                  </option>
                ))}
              </Select>
              <Button onClick={() => void onStatusChange()} loading={update.isPending} disabled={!status}>
                {t('common.save')}
              </Button>
            </div>
          </Card>
        </PermissionGate>

        <PermissionGate permission="issues.resolve">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-ink-900">{t('issues.resolveTitle')}</h3>
            <Field label={t('issues.resolutionLabel')} required>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={4}
              />
            </Field>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => void onResolve()}
                loading={resolve.isPending}
                disabled={!resolutionNotes.trim()}
              >
                {t('issues.resolve')}
              </Button>
            </div>
          </Card>
        </PermissionGate>
      </div>

      <Card>
        <CardHeader title={t('issues.history')} />
        <div className="divide-y divide-ink-100">
          {issue.history.length === 0 ? (
            <p className="p-6 text-sm text-ink-500">{t('common.noData')}</p>
          ) : (
            issue.history.map((entry) => (
              <div key={entry.history_id} className="px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink-900">
                    {entry.actor.full_name ?? entry.actor.username}
                    <span className="ml-2 font-normal text-ink-500">· {entry.action}</span>
                  </p>
                  <p className="text-xs text-ink-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
                {(entry.from_status || entry.to_status) && (
                  <p className="mt-1 text-xs text-ink-500">
                    {entry.from_status ?? '—'} → {entry.to_status ?? '—'}
                  </p>
                )}
                {entry.comment && <p className="mt-2 text-sm text-ink-700">{entry.comment}</p>}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
