import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Hash } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useCorrectRegisterTitle } from '@/hooks/useSupport';
import type { CorrectRegisterTitleResult, DeedTitleOccupancy } from '@/types';

type CorrectRegisterTitleToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  initialFromTitle?: string | null;
  registerTitleOptions?: string[];
};

function islandFromSystemKey(systemKey: string): string {
  const key = systemKey.toLowerCase();
  if (key.includes('statia')) return 'statia';
  if (key.includes('saba')) return 'saba';
  if (key.includes('bonaire')) return 'bonaire';
  if (key.includes('aruba') || key.includes('dlv') || key.includes('tereno')) return 'aruba';
  if (key.includes('atl')) return 'atl';
  return 'unknown';
}

function occupancySummary(deed: DeedTitleOccupancy): string {
  return [
    `DeedDetail ${deed.deed_detail_count}`,
    `ARegister ${deed.a_register_count}`,
    `orders ${deed.order_link_count}`,
    `Register ${deed.register_row_count}`,
    `docs ${deed.deed_document_count}`,
  ].join(' · ');
}

function DeedCard({
  title,
  deed,
  emptyLabel,
}: {
  title: string;
  deed: DeedTitleOccupancy | null;
  emptyLabel?: string;
}) {
  if (!deed) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <p className="font-semibold">{title}</p>
        <p className="mt-1">{emptyLabel}</p>
      </div>
    );
  }

  const tone = deed.is_orphan
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-ink-200 bg-white text-ink-800';

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${tone}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1">
        #{deed.deed_id} · {deed.register_title}
        {deed.legal_fact_code ? ` · ${deed.legal_fact_code}` : ''}
        {deed.legal_fact_name ? ` · ${deed.legal_fact_name}` : ''}
      </p>
      <p className="mt-1 text-xs opacity-90">{occupancySummary(deed)}</p>
    </div>
  );
}

export function CorrectRegisterTitleTool({
  systemKey,
  isProduction,
  systemName,
  initialFromTitle = null,
  registerTitleOptions = [],
}: CorrectRegisterTitleToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const mutation = useCorrectRegisterTitle();

  const [fromTitle, setFromTitle] = useState(initialFromTitle?.trim() ?? '');
  const [toTitle, setToTitle] = useState('');
  const [preview, setPreview] = useState<CorrectRegisterTitleResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const next = initialFromTitle?.trim() ?? '';
    setFromTitle(next);
    setToTitle('');
    setPreview(null);
    setConfirmOpen(false);
  }, [systemKey, initialFromTitle]);

  async function runPreview() {
    const from = fromTitle.trim();
    const to = toTitle.trim();
    if (!from || !to) {
      toast.error(t('support.tools.correctRegisterTitle.missingTitle'));
      return;
    }
    try {
      const result = await mutation.mutateAsync({
        systemKey,
        fromTitle: from,
        toTitle: to,
        previewOnly: true,
      });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!preview?.can_apply) return;
    try {
      const result = await mutation.mutateAsync({
        systemKey,
        fromTitle: preview.from_title,
        toTitle: preview.to_title,
        fromDeedId: preview.source.deed_id,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.tools.correctRegisterTitle.success', {
          deed: result.source.deed_id,
          from: result.from_title,
          to: result.to_title,
        }),
      );
      setConfirmOpen(false);
      setPreview(result);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  const uniqueOptions = Array.from(
    new Set(registerTitleOptions.map((item) => item.trim()).filter(Boolean)),
  );

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Hash style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.correctRegisterTitle.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.correctRegisterTitle.description')}
            </p>
            <p className="mt-2 text-xs font-medium text-ink-500">
              {t('support.tools.correctRegisterTitle.island')}:{' '}
              {preview?.island ?? islandFromSystemKey(systemKey)}
              {preview?.dialect ? ` · ${t('support.tools.correctRegisterTitle.dialect')}: ${preview.dialect}` : ''}
            </p>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">
              {t('support.tools.correctRegisterTitle.viewOnly')}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.correctRegisterTitle.fromTitle')}
              </label>
              <Input
                value={fromTitle}
                onChange={(event) => {
                  setFromTitle(event.target.value);
                  setPreview(null);
                }}
                placeholder="C 35-84"
                disabled={!canEdit}
                list="correct-register-from-options"
              />
              {initialFromTitle ? (
                <p className="mt-1 text-xs text-ink-500">
                  {t('support.tools.correctRegisterTitle.fromCurrentLookup')}
                </p>
              ) : null}
              {uniqueOptions.length > 0 && (
                <datalist id="correct-register-from-options">
                  {uniqueOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.correctRegisterTitle.toTitle')}
              </label>
              <Input
                value={toTitle}
                onChange={(event) => {
                  setToTitle(event.target.value);
                  setPreview(null);
                }}
                placeholder="C 35-83"
                disabled={!canEdit}
              />
            </div>
          </div>

          <Button
            type="button"
            disabled={!canEdit || mutation.isPending || !fromTitle.trim() || !toTitle.trim()}
            loading={mutation.isPending && !confirmOpen}
            onClick={() => void runPreview()}
          >
            {t('support.tools.correctRegisterTitle.preview')}
          </Button>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {preview.preview_only
                    ? preview.can_apply
                      ? t('support.tools.correctRegisterTitle.previewResult')
                      : t('support.tools.correctRegisterTitle.blocked')
                    : t('support.tools.correctRegisterTitle.appliedResult')}
                </p>
                {preview.preview_only && preview.can_apply && (
                  <Button
                    type="button"
                    disabled={!canEdit || mutation.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t('support.tools.correctRegisterTitle.apply')}
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DeedCard
                  title={`${t('support.tools.correctRegisterTitle.from')}: ${preview.from_title}`}
                  deed={preview.source}
                />
                <DeedCard
                  title={`${t('support.tools.correctRegisterTitle.to')}: ${preview.to_title}`}
                  deed={preview.occupying}
                  emptyLabel={t('support.tools.correctRegisterTitle.free')}
                />
              </div>

              {preview.will_release_orphan && preview.occupying && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {t('support.tools.correctRegisterTitle.releaseOrphan', {
                    deed: preview.occupying.deed_id,
                    title: preview.occupying.register_title,
                  })}
                </p>
              )}

              {preview.island_notes.length > 0 && (
                <div className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-ink-700">
                  <p className="font-semibold">
                    {t('support.tools.correctRegisterTitle.islandNotes')}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {preview.island_notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.actions.length > 0 && (
                <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700">
                  <p className="font-semibold">
                    {t('support.tools.correctRegisterTitle.actions')}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {preview.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.blockers.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <p className="font-semibold">
                    {t('support.tools.correctRegisterTitle.blockers')}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {preview.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmOpen && preview?.can_apply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.correctRegisterTitle.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                #{preview.source.deed_id} · {preview.from_title} →{' '}
                <span className="font-semibold">{preview.to_title}</span>
              </p>
              <p>{t('support.tools.correctRegisterTitle.confirmHint')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={mutation.isPending}
                onClick={() => void applyChange()}
              >
                {t('support.tools.correctRegisterTitle.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
