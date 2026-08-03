import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useReopenBestelling } from '@/hooks/useSupport';
import type { ReopenBestellingResult } from '@/types';

type ReopenBestellingToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  orderId: number;
};

function formatStatus(
  id: number | null,
  name: string | null,
): string {
  if (id == null && !name) return '—';
  if (id != null && name) return `${id} · ${name}`;
  if (id != null) return String(id);
  return name ?? '—';
}

export function ReopenBestellingTool({
  systemKey,
  isProduction,
  systemName,
  orderId,
}: ReopenBestellingToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const reopenMutation = useReopenBestelling();

  const [preview, setPreview] = useState<ReopenBestellingResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setPreview(null);
    setConfirmOpen(false);
  }, [orderId, systemKey]);

  async function runPreview() {
    if (!canEdit || orderId <= 0) return;
    try {
      const result = await reopenMutation.mutateAsync({
        orderId,
        systemKey,
        previewOnly: true,
      });
      setPreview(result);
      if (result.change_count === 0) {
        toast(t('support.tools.reopenBestelling.noChanges'));
      }
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!canEdit || orderId <= 0) return;
    try {
      const result = await reopenMutation.mutateAsync({
        orderId,
        systemKey,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.tools.reopenBestelling.success', {
          count: result.change_count,
          order: result.order_id,
        }),
      );
      setConfirmOpen(false);
      setPreview(result);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  if (!orderId || orderId <= 0) {
    return null;
  }

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <RotateCcw style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.reopenBestelling.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.reopenBestelling.description')}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-700">
                {t('support.tools.reopenBestelling.order')}
              </p>
              <div className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-900">
                #{orderId}
              </div>
            </div>
            <Button
              type="button"
              disabled={!canEdit || reopenMutation.isPending}
              loading={reopenMutation.isPending && !confirmOpen}
              onClick={() => void runPreview()}
            >
              {t('support.tools.reopenBestelling.preview')}
            </Button>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.reopenBestelling.viewOnly')}</p>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {preview.preview_only
                    ? t('support.tools.reopenBestelling.previewResult', {
                        count: preview.change_count,
                      })
                    : t('support.tools.reopenBestelling.appliedResult', {
                        count: preview.change_count,
                      })}
                </p>
                {preview.preview_only && preview.change_count > 0 && (
                  <Button
                    type="button"
                    disabled={!canEdit || reopenMutation.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t('support.tools.reopenBestelling.apply')}
                  </Button>
                )}
              </div>

              {preview.change_count === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('support.tools.reopenBestelling.noChanges')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                      <tr>
                        <th className="px-3 py-2">{t('support.tools.reopenBestelling.action')}</th>
                        <th className="px-3 py-2">{t('support.tools.reopenBestelling.product')}</th>
                        <th className="px-3 py-2">{t('support.tools.reopenBestelling.fromStatus')}</th>
                        <th className="px-3 py-2">{t('support.tools.reopenBestelling.toStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {preview.changes.map((change, index) => (
                        <tr key={`${change.action_type ?? 'row'}-${change.order_product_id ?? index}`}>
                          <td className="px-3 py-2 text-ink-700">
                            {(change.action_type ?? '—').replace(/^PREVIEW\s*-\s*/i, '')}
                            {change.detail ? (
                              <span className="mt-0.5 block text-xs text-ink-500">{change.detail}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-ink-800">
                            {change.order_product_id != null
                              ? `#${change.order_product_id}`
                              : change.order_id != null
                                ? `${t('support.tools.reopenBestelling.order')} #${change.order_id}`
                                : '—'}
                            {change.product_number != null ? ` · #${change.product_number}` : ''}
                            {change.product_code ? ` · ${change.product_code}` : ''}
                            {change.product_name ? ` · ${change.product_name}` : ''}
                          </td>
                          <td className="px-3 py-2 text-ink-700">
                            {formatStatus(change.from_status_id, change.from_status)}
                          </td>
                          <td className="px-3 py-2 font-semibold text-ink-900">
                            {formatStatus(change.to_status_id, change.to_status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.reopenBestelling.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.reopenBestelling.order')}:</span>{' '}
                #{orderId}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.reopenBestelling.changes')}:</span>{' '}
                {preview.change_count}
              </p>
              <p>{t('support.tools.reopenBestelling.confirmHint')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={reopenMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={reopenMutation.isPending}
                onClick={() => void applyChange()}
              >
                {t('support.tools.reopenBestelling.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
