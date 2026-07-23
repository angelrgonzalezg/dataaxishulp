import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useDeedLegalFact,
  useLegalFacts,
  useUpdateDeedLegalFact,
} from '@/hooks/useSupport';
import type { DeedTypeAkteOption } from '@/types';

type ChangeTypeAkteToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  deeds: DeedTypeAkteOption[];
};

function formatLegalFactLabel(option: {
  id: number;
  code: string | null;
  name_nl?: string | null;
  name_en?: string | null;
  legalFactCode?: string | null;
  legalFactNameNl?: string | null;
}): string {
  const code = option.code ?? option.legalFactCode ?? '—';
  const name = option.name_nl ?? option.legalFactNameNl ?? option.name_en ?? '—';
  return `${option.id} · ${code} · ${name}`;
}

export function ChangeTypeAkteTool({
  systemKey,
  isProduction,
  systemName,
  deeds,
}: ChangeTypeAkteToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');

  const [deedId, setDeedId] = useState<number | null>(deeds[0]?.deedId ?? null);
  const [newLegalFactId, setNewLegalFactId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (deeds.length === 0) {
      setDeedId(null);
      return;
    }
    if (deedId == null || !deeds.some((deed) => deed.deedId === deedId)) {
      setDeedId(deeds[0].deedId);
    }
  }, [deeds, deedId]);

  const legalFactsQuery = useLegalFacts(systemKey, deeds.length > 0);
  const deedStateQuery = useDeedLegalFact(deedId, systemKey, deedId != null);
  const updateMutation = useUpdateDeedLegalFact();

  const filteredFacts = useMemo(() => {
    const list = legalFactsQuery.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((fact) => {
      const haystack = `${fact.id} ${fact.code ?? ''} ${fact.name_nl ?? ''} ${fact.name_en ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [legalFactsQuery.data, filter]);

  const selectedFact = useMemo(
    () => (legalFactsQuery.data ?? []).find((fact) => fact.id === newLegalFactId) ?? null,
    [legalFactsQuery.data, newLegalFactId],
  );

  const current = deedStateQuery.data;
  const currentLabel = current
    ? formatLegalFactLabel({
        id: current.legal_fact_id ?? 0,
        code: current.legal_fact_code,
        name_nl: current.legal_fact_name_nl,
        name_en: current.legal_fact_name_en,
      })
    : '—';

  const sameAsCurrent =
    current?.legal_fact_id != null && newLegalFactId != null && current.legal_fact_id === newLegalFactId;

  function openConfirm() {
    if (!deedId || !newLegalFactId || !canEdit || sameAsCurrent) return;
    setConfirmOpen(true);
  }

  async function applyChange() {
    if (!deedId || !newLegalFactId) return;
    try {
      const result = await updateMutation.mutateAsync({
        deedId,
        systemKey,
        legalFactId: newLegalFactId,
      });
      const previousText = result.previous
        ? formatLegalFactLabel(result.previous)
        : '—';
      const nextText = formatLegalFactLabel(result.next);
      toast.success(
        t('support.tools.changeTypeAkte.success', {
          previous: previousText,
          next: nextText,
        }),
      );
      setConfirmOpen(false);
      setNewLegalFactId(null);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  if (deeds.length === 0) {
    return null;
  }

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Wrench style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {t('support.tools.title')}
            </p>
            <h3 className="mt-1 text-lg font-extrabold text-ink-900">
              1. {t('support.tools.changeTypeAkte.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.changeTypeAkte.description')}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeTypeAkte.selectDeed')}
              </label>
              <Select
                value={deedId ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setDeedId(Number.isFinite(value) ? value : null);
                  setNewLegalFactId(null);
                }}
              >
                {deeds.map((deed) => (
                  <option key={deed.deedId} value={deed.deedId}>
                    #{deed.deedId}
                    {deed.title ? ` · ${deed.title}` : ''}
                    {deed.legalFactNameNl ? ` · ${deed.legalFactNameNl}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeTypeAkte.current')}
              </label>
              <div className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800">
                {deedStateQuery.isFetching ? t('common.loading') : currentLabel}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr_auto]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeTypeAkte.filter')}
              </label>
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('support.tools.changeTypeAkte.filterPlaceholder')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeTypeAkte.newValue')}
              </label>
              <Select
                value={newLegalFactId ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setNewLegalFactId(Number.isFinite(value) && value > 0 ? value : null);
                }}
                disabled={!canEdit || legalFactsQuery.isLoading}
              >
                <option value="">{t('support.tools.changeTypeAkte.pickPlaceholder')}</option>
                {filteredFacts.map((fact) => (
                  <option key={fact.id} value={fact.id}>
                    {formatLegalFactLabel(fact)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={
                  !canEdit ||
                  !deedId ||
                  !newLegalFactId ||
                  sameAsCurrent ||
                  updateMutation.isPending ||
                  deedStateQuery.isFetching
                }
                onClick={openConfirm}
              >
                {t('support.tools.changeTypeAkte.apply')}
              </Button>
            </div>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.changeTypeAkte.viewOnly')}</p>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.changeTypeAkte.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.changeTypeAkte.deed')}:</span>{' '}
                #{deedId}
                {current?.register
                  ? ` · ${current.register} ${current.segment}-${current.number}`
                  : ''}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.changeTypeAkte.from')}:</span>{' '}
                {currentLabel}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.changeTypeAkte.to')}:</span>{' '}
                {selectedFact ? formatLegalFactLabel(selectedFact) : '—'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={updateMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={updateMutation.isPending}
                onClick={() => void applyChange()}
              >
                {t('support.tools.changeTypeAkte.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
