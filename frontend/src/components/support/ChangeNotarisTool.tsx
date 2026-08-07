import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Stamp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useChangeDeedNotary,
  useDeedNotary,
  useSearchNotaries,
} from '@/hooks/useSupport';
import type { ChangeDeedNotaryResult, DeedTypeAkteOption, NotaryOption } from '@/types';

type ChangeNotarisToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  deeds: DeedTypeAkteOption[];
};

function formatNotary(option: NotaryOption | null | undefined): string {
  if (!option) return '—';
  const code = option.code?.trim() || String(option.id);
  const name = option.name?.trim() || '—';
  const active =
    option.active === false ? ' · inactive' : option.active === true ? '' : '';
  return `#${option.id} · ${code} · ${name}${active}`;
}

function formatNotaryFromState(state: {
  notary_id: number | null;
  notary_code: string | null;
  notary_name: string | null;
} | null): string {
  if (!state || state.notary_id == null) return '—';
  return formatNotary({
    id: state.notary_id,
    code: state.notary_code,
    name: state.notary_name,
    active: null,
  });
}

export function ChangeNotarisTool({
  systemKey,
  isProduction,
  systemName,
  deeds,
}: ChangeNotarisToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');

  const [deedId, setDeedId] = useState<number | null>(deeds[0]?.deedId ?? null);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<NotaryOption[]>([]);
  const [selectedNotaryId, setSelectedNotaryId] = useState<number | ''>('');
  const [preview, setPreview] = useState<ChangeDeedNotaryResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deedStateQuery = useDeedNotary(deedId, systemKey, deedId != null);
  const searchMutation = useSearchNotaries();
  const changeMutation = useChangeDeedNotary();

  useEffect(() => {
    if (deeds.length === 0) {
      setDeedId(null);
      return;
    }
    if (deedId == null || !deeds.some((deed) => deed.deedId === deedId)) {
      setDeedId(deeds[0].deedId);
    }
  }, [deeds, deedId]);

  useEffect(() => {
    setSearch('');
    setCandidates([]);
    setSelectedNotaryId('');
    setPreview(null);
    setConfirmOpen(false);
  }, [deedId, systemKey]);

  async function runSearch() {
    const q = search.trim();
    if (!q) {
      toast.error(t('support.tools.changeNotaris.missingQuery'));
      return;
    }
    try {
      const result = await searchMutation.mutateAsync({ systemKey, q });
      setCandidates(result.candidates);
      setSelectedNotaryId(
        result.candidates.length === 1 ? result.candidates[0].id : '',
      );
      setPreview(null);
      if (result.candidates.length === 0) {
        toast(t('support.tools.changeNotaris.noNotaryFound'));
      }
    } catch (error) {
      setCandidates([]);
      setSelectedNotaryId('');
      toast.error(extractErrorMessage(error));
    }
  }

  async function runPreview() {
    if (!canEdit || !deedId || selectedNotaryId === '') return;
    try {
      const result = await changeMutation.mutateAsync({
        deedId,
        systemKey,
        notaryId: selectedNotaryId,
        previewOnly: true,
      });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!canEdit || !deedId || selectedNotaryId === '') return;
    try {
      const result = await changeMutation.mutateAsync({
        deedId,
        systemKey,
        notaryId: selectedNotaryId,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.tools.changeNotaris.success', {
          deed: result.deed_id,
          from: formatNotary(result.from_notary),
          to: formatNotary(result.to_notary),
        }),
      );
      setConfirmOpen(false);
      setPreview(result);
      void deedStateQuery.refetch();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  const busy =
    deedStateQuery.isFetching || searchMutation.isPending || changeMutation.isPending;
  const current = deedStateQuery.data;
  const sameAsCurrent =
    current?.notary_id != null &&
    selectedNotaryId !== '' &&
    current.notary_id === selectedNotaryId;

  if (deeds.length === 0) {
    return null;
  }

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Stamp style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.changeNotaris.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.changeNotaris.description')}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeNotaris.selectDeed')}
              </label>
              <Select
                value={deedId ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setDeedId(Number.isFinite(value) ? value : null);
                }}
              >
                {deeds.map((deed) => (
                  <option key={deed.deedId} value={deed.deedId}>
                    #{deed.deedId}
                    {deed.title ? ` · ${deed.title}` : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeNotaris.current')}
              </label>
              <div className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800">
                {deedStateQuery.isFetching
                  ? t('common.loading')
                  : formatNotaryFromState(current ?? null)}
              </div>
            </div>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.changeNotaris.viewOnly')}</p>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeNotaris.search')}
              </label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('support.tools.changeNotaris.searchPlaceholder')}
                disabled={!canEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                disabled={!canEdit || busy || !search.trim()}
                onClick={() => void runSearch()}
              >
                {t('support.tools.changeNotaris.findNotary')}
              </Button>
            </div>
          </div>

          {candidates.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeNotaris.replacement')}
              </label>
              <Select
                value={selectedNotaryId}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSelectedNotaryId(Number.isFinite(value) && value > 0 ? value : '');
                  setPreview(null);
                }}
                disabled={!canEdit}
              >
                <option value="">{t('support.tools.changeNotaris.pickNotary')}</option>
                {candidates.map((notary) => (
                  <option key={notary.id} value={notary.id}>
                    {formatNotary(notary)}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={
                !canEdit || busy || !deedId || selectedNotaryId === '' || sameAsCurrent
              }
              onClick={() => void runPreview()}
            >
              {t('support.tools.changeNotaris.preview')}
            </Button>
            <Button
              type="button"
              disabled={!canEdit || busy || !preview || preview.preview_only === false}
              onClick={() => setConfirmOpen(true)}
            >
              {t('support.tools.changeNotaris.apply')}
            </Button>
          </div>

          {preview && (
            <div className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-700">
              <p className="font-semibold text-ink-900">
                {preview.preview_only
                  ? t('support.tools.changeNotaris.previewResult')
                  : t('support.tools.changeNotaris.appliedResult')}
              </p>
              <p className="mt-2">
                <span className="font-semibold">{t('support.tools.changeNotaris.deed')}:</span>{' '}
                #{preview.deed_id}
                {preview.register
                  ? ` · ${preview.register} ${preview.segment}-${preview.number}`
                  : ''}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.changeNotaris.from')}:</span>{' '}
                {formatNotary(preview.from_notary)}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.changeNotaris.to')}:</span>{' '}
                {formatNotary(preview.to_notary)}
              </p>
            </div>
          )}
        </div>
      </div>

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.changeNotaris.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <p className="text-sm text-ink-600">{t('support.tools.changeNotaris.confirmHint')}</p>
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.changeNotaris.deed')}:</span>{' '}
                #{preview.deed_id}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.changeNotaris.from')}:</span>{' '}
                {formatNotary(preview.from_notary)}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.changeNotaris.to')}:</span>{' '}
                {formatNotary(preview.to_notary)}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={changeMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={changeMutation.isPending}
                onClick={() => void applyChange()}
              >
                {t('support.tools.changeNotaris.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
