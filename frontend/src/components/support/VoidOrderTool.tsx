import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useVoidOrder } from '@/hooks/useSupport';
import type { VoidOrderResult } from '@/types';

type VoidOrderToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  orderId: number;
};

function formatStatus(id: number | null, name: string | null): string {
  if (id == null && !name) return '—';
  if (id != null && name) return `${id} · ${name}`;
  if (id != null) return String(id);
  return name ?? '—';
}

export function VoidOrderTool({
  systemKey,
  isProduction,
  systemName,
  orderId,
}: VoidOrderToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const voidMutation = useVoidOrder();

  const [preview, setPreview] = useState<VoidOrderResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledgeRisk, setAcknowledgeRisk] = useState(false);

  useEffect(() => {
    setPreview(null);
    setConfirmOpen(false);
    setAcknowledgeRisk(false);
  }, [orderId, systemKey]);

  async function runPreview() {
    if (!canEdit || orderId <= 0) return;
    try {
      const result = await voidMutation.mutateAsync({
        orderId,
        systemKey,
        previewOnly: true,
      });
      setPreview(result);
      setAcknowledgeRisk(false);
      if (result.already_voided) {
        toast(t('support.tools.voidOrder.alreadyVoided'));
      } else if (!result.is_safe) {
        toast(t('support.tools.voidOrder.riskToast'));
      }
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!canEdit || orderId <= 0 || !preview) return;
    if (!preview.is_safe && !acknowledgeRisk) {
      toast.error(t('support.tools.voidOrder.mustAcknowledge'));
      return;
    }
    try {
      const result = await voidMutation.mutateAsync({
        orderId,
        systemKey,
        previewOnly: false,
        confirm: true,
        acknowledgeRisk: !preview.is_safe ? true : undefined,
      });
      toast.success(
        t('support.tools.voidOrder.success', {
          order: result.order_id,
          count: result.product_change_count,
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
          <Ban style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.voidOrder.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.voidOrder.description')}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-700">
                {t('support.tools.voidOrder.order')}
              </p>
              <div className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-900">
                #{orderId}
                <span className="mt-0.5 block text-xs font-normal text-ink-500">
                  {t('support.tools.voidOrder.fromCurrentLookup')}
                </span>
              </div>
            </div>
            <Button
              type="button"
              disabled={!canEdit || voidMutation.isPending}
              loading={voidMutation.isPending && !confirmOpen}
              onClick={() => void runPreview()}
            >
              {t('support.tools.voidOrder.preview')}
            </Button>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.voidOrder.viewOnly')}</p>
          )}

          {preview && (
            <div className="space-y-3">
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  preview.is_safe
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <p className="font-semibold">
                  {preview.is_safe
                    ? t('support.tools.voidOrder.safeTitle')
                    : t('support.tools.voidOrder.riskTitle')}
                </p>
                {preview.warnings.map((warning) => (
                  <p key={warning} className="mt-1">
                    {warning}
                  </p>
                ))}
                {preview.risks.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {preview.risks.map((risk) => (
                      <li key={`${risk.table}-${risk.count}`}>
                        <span className="font-semibold">{risk.table}</span>: {risk.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {preview.preview_only
                    ? t('support.tools.voidOrder.previewResult', {
                        count: preview.product_change_count,
                      })
                    : t('support.tools.voidOrder.appliedResult', {
                        count: preview.product_change_count,
                      })}
                </p>
                {preview.preview_only && !preview.already_voided && (
                  <Button
                    type="button"
                    disabled={!canEdit || voidMutation.isPending}
                    onClick={() => {
                      setAcknowledgeRisk(false);
                      setConfirmOpen(true);
                    }}
                  >
                    {t('support.tools.voidOrder.apply')}
                  </Button>
                )}
              </div>

              <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700">
                <p>
                  <span className="font-semibold">{t('support.tools.voidOrder.orderStatus')}:</span>{' '}
                  {formatStatus(preview.order_from_status_id, preview.order_from_status)} →{' '}
                  <span className="font-semibold">
                    {formatStatus(preview.order_to_status_id, preview.order_to_status)}
                  </span>
                </p>
              </div>

              {preview.product_change_count === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('support.tools.voidOrder.noProducts')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                      <tr>
                        <th className="px-3 py-2">{t('support.tools.voidOrder.product')}</th>
                        <th className="px-3 py-2">{t('support.tools.voidOrder.fromStatus')}</th>
                        <th className="px-3 py-2">{t('support.tools.voidOrder.toStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {preview.product_changes.map((change) => (
                        <tr key={change.order_product_id}>
                          <td className="px-3 py-2 text-ink-800">
                            #{change.order_product_id}
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
              {t('support.tools.voidOrder.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.voidOrder.order')}:</span> #
                {orderId}
              </p>
              <p>
                <span className="font-semibold">{t('support.tools.voidOrder.products')}:</span>{' '}
                {preview.product_change_count}
              </p>
              <p>{t('support.tools.voidOrder.confirmHint')}</p>
              {!preview.is_safe && (
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={acknowledgeRisk}
                    onChange={(event) => setAcknowledgeRisk(event.target.checked)}
                  />
                  <span>{t('support.tools.voidOrder.acknowledgeRisk')}</span>
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={voidMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={voidMutation.isPending}
                disabled={!preview.is_safe && !acknowledgeRisk}
                onClick={() => void applyChange()}
              >
                {t('support.tools.voidOrder.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
