import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { extractErrorMessage } from '@/api/client';
import { useVerifyOrder } from '@/hooks/useSupport';
import type { VerifyOrderPriceCheck, VerifyOrderResult } from '@/types';

type VerifyOrderToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  orderId: number;
  onOpenDeedTitle?: (title: string) => void;
};

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatProduct(code: string | null, name: string | null): string {
  if (code && name) return `${code} · ${name}`;
  return code ?? name ?? '—';
}

export function VerifyOrderTool({
  systemKey,
  isProduction,
  systemName,
  orderId,
  onOpenDeedTitle,
}: VerifyOrderToolProps) {
  const { t } = useTranslation();
  const verifyMutation = useVerifyOrder();
  const [result, setResult] = useState<VerifyOrderResult | null>(null);

  useEffect(() => {
    setResult(null);
  }, [orderId, systemKey]);

  async function runVerify() {
    if (orderId <= 0) return;
    try {
      const data = await verifyMutation.mutateAsync({ orderId, systemKey });
      setResult(data);
      if (data.all_ok) {
        toast.success(t('support.tools.verifyOrder.allOk'));
      } else {
        toast(t('support.tools.verifyOrder.hasIssues'));
      }
    } catch (error) {
      setResult(null);
      toast.error(extractErrorMessage(error));
    }
  }

  const priceCheck: VerifyOrderPriceCheck | undefined = result?.checks.find(
    (check) => check.check_key === 'order_deed_price_vs_order_total',
  );

  return (
    <Card className="border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 pr-16">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <ClipboardCheck style={{ width: 20, height: 20 }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink-900">{t('support.tools.verifyOrder.title')}</h2>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.verifyOrder.description')}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-700">
          <span className="font-semibold">{t('support.tools.verifyOrder.order')}:</span> #{orderId}
          <span className="mx-2 text-ink-300">·</span>
          {systemName}
          {isProduction ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
              PROD
            </span>
          ) : null}
          <p className="mt-1 text-xs text-ink-500">
            {t('support.tools.verifyOrder.fromCurrentLookup')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void runVerify()}
            disabled={verifyMutation.isPending || orderId <= 0}
          >
            {verifyMutation.isPending
              ? t('support.tools.verifyOrder.running')
              : t('support.tools.verifyOrder.run')}
          </Button>
        </div>

        {result && priceCheck ? (
          <div className="space-y-4">
            <div
              className={
                priceCheck.ok
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
                  : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'
              }
            >
              <p className="font-semibold">
                {priceCheck.ok
                  ? t('support.tools.verifyOrder.priceCheckOk')
                  : t('support.tools.verifyOrder.priceCheckFail')}
              </p>
              <p className="mt-1 text-xs opacity-90">{priceCheck.message}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-ink-100 bg-white px-3 py-2">
                <p className="text-xs font-medium text-ink-500">
                  {t('support.tools.verifyOrder.orderTotal')}
                </p>
                <p className="mt-0.5 text-base font-bold text-ink-900">
                  {formatMoney(priceCheck.order_total_price)}
                </p>
              </div>
              <div className="rounded-lg border border-ink-100 bg-white px-3 py-2">
                <p className="text-xs font-medium text-ink-500">
                  {t('support.tools.verifyOrder.deedSum')}
                </p>
                <p className="mt-0.5 text-base font-bold text-ink-900">
                  {formatMoney(priceCheck.order_deed_price_sum)}
                </p>
              </div>
              <div className="rounded-lg border border-ink-100 bg-white px-3 py-2">
                <p className="text-xs font-medium text-ink-500">
                  {t('support.tools.verifyOrder.difference')}
                </p>
                <p className="mt-0.5 text-base font-bold text-ink-900">
                  {formatMoney(priceCheck.difference)}
                </p>
              </div>
            </div>

            {priceCheck.lines.length === 0 ? (
              <p className="text-sm text-ink-500">{t('support.tools.verifyOrder.noLines')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-100">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-3 py-2">{t('support.tools.verifyOrder.product')}</th>
                      <th className="px-3 py-2">{t('support.tools.verifyOrder.deed')}</th>
                      <th className="px-3 py-2">{t('support.tools.verifyOrder.registerTitle')}</th>
                      <th className="px-3 py-2">{t('support.tools.verifyOrder.amount')}</th>
                      <th className="px-3 py-2">{t('support.tools.verifyOrder.price')}</th>
                      <th className="px-3 py-2">{t('support.tools.verifyOrder.unitPrice')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceCheck.lines.map((line, index) => (
                      <tr
                        key={line.order_deed_id ?? `${line.order_product_id}-${index}`}
                        className="border-t border-ink-100"
                      >
                        <td className="px-3 py-2">
                          {formatProduct(line.product_code, line.product_name)}
                        </td>
                        <td className="px-3 py-2">
                          {line.deed_id != null && line.title && onOpenDeedTitle ? (
                            <button
                              type="button"
                              className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900"
                              onClick={() => onOpenDeedTitle(line.title!)}
                            >
                              #{line.deed_id}
                            </button>
                          ) : line.deed_id != null ? (
                            `#${line.deed_id}`
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {line.title && onOpenDeedTitle ? (
                            <button
                              type="button"
                              className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900"
                              onClick={() => onOpenDeedTitle(line.title!)}
                            >
                              {line.title}
                            </button>
                          ) : (
                            line.title ?? '—'
                          )}
                        </td>
                        <td className="px-3 py-2">{formatMoney(line.amount)}</td>
                        <td className="px-3 py-2">{formatMoney(line.price)}</td>
                        <td className="px-3 py-2 font-medium">
                          {formatMoney(line.unit_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-ink-500">{t('support.tools.verifyOrder.moreChecksHint')}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
