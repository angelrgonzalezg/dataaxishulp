import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChangeTypeAkteTool } from '@/components/support/ChangeTypeAkteTool';
import { ReopenBestellingTool } from '@/components/support/ReopenBestellingTool';
import { RetireSubjectFromDeedTool } from '@/components/support/RetireSubjectFromDeedTool';
import { VoidOrderTool } from '@/components/support/VoidOrderTool';
import { ChangeDeedOnOrderTool } from '@/components/support/ChangeDeedOnOrderTool';
import { ChangeParcelOnOrderTool } from '@/components/support/ChangeParcelOnOrderTool';
import type { DeedTypeAkteOption } from '@/types';

type ResolutionToolId =
  | 'change_type_akte'
  | 'reopen_bestelling'
  | 'retire_subject'
  | 'void_order'
  | 'change_parcel'
  | 'change_deed';

type ResolutionToolsMenuProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  dialect?: string | null;
  deeds: DeedTypeAkteOption[];
  orderId?: number | null;
  initialRegisterTitle?: string | null;
  initialParcelEsri?: string | null;
  registerTitleOptions?: string[];
  parcelEsriOptions?: string[];
  showChangeTypeAkte?: boolean;
  showReopenBestelling?: boolean;
  showRetireSubject?: boolean;
  showVoidOrder?: boolean;
  showChangeParcel?: boolean;
  showChangeDeed?: boolean;
};

export function ResolutionToolsMenu({
  systemKey,
  isProduction,
  systemName,
  dialect = null,
  deeds,
  orderId = null,
  initialRegisterTitle = null,
  initialParcelEsri = null,
  registerTitleOptions = [],
  parcelEsriOptions = [],
  showChangeTypeAkte = true,
  showReopenBestelling = true,
  showRetireSubject = true,
  showVoidOrder = true,
  showChangeParcel = true,
  showChangeDeed = true,
}: ResolutionToolsMenuProps) {
  const { t } = useTranslation();
  const [selectedTool, setSelectedTool] = useState<ResolutionToolId | ''>('');
  const [openTool, setOpenTool] = useState<ResolutionToolId | null>(null);
  const isTereno = (dialect ?? '').toLowerCase() === 'tereno';

  const tools = useMemo(
    () =>
      [
        {
          id: 'change_type_akte' as const,
          label: t('support.tools.changeTypeAkte.title'),
          available: showChangeTypeAkte && isTereno && deeds.length > 0,
        },
        {
          id: 'reopen_bestelling' as const,
          label: t('support.tools.reopenBestelling.title'),
          available: showReopenBestelling && isTereno && orderId != null && orderId > 0,
        },
        {
          id: 'void_order' as const,
          label: t('support.tools.voidOrder.title'),
          available: showVoidOrder && orderId != null && orderId > 0,
        },
        {
          id: 'change_parcel' as const,
          label: t('support.tools.changeParcel.title'),
          available: showChangeParcel && orderId != null && orderId > 0,
        },
        {
          id: 'change_deed' as const,
          label: t('support.tools.changeDeed.title'),
          available: showChangeDeed && orderId != null && orderId > 0,
        },
        {
          id: 'retire_subject' as const,
          label: t('support.tools.retireSubject.title'),
          available: showRetireSubject,
        },
      ].filter((tool) => tool.available),
    [
      deeds.length,
      isTereno,
      orderId,
      showChangeTypeAkte,
      showReopenBestelling,
      showRetireSubject,
      showVoidOrder,
      showChangeParcel,
      showChangeDeed,
      t,
    ],
  );

  if (tools.length === 0) {
    return null;
  }

  function openSelected() {
    if (!selectedTool) return;
    setOpenTool(selectedTool);
  }

  function closeTool() {
    setOpenTool(null);
  }

  return (
    <>
      <Card className="border-2 border-brand-300 bg-gradient-to-br from-brand-50 to-white p-5 shadow-md ring-1 ring-brand-100">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
              <Wrench style={{ width: 24, height: 24 }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold tracking-tight text-brand-800 sm:text-2xl">
                {t('support.tools.title')}
              </p>
              <p className="mt-1 text-sm font-medium text-ink-600">
                {t('support.tools.selectTool')}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            {tools.map((tool) => {
              const selected = selectedTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setSelectedTool(tool.id)}
                  className={
                    selected
                      ? 'flex w-full items-center justify-between rounded-xl border-2 border-brand-600 bg-brand-600 px-4 py-3 text-left text-base font-bold text-white shadow-sm transition'
                      : 'flex w-full items-center justify-between rounded-xl border-2 border-brand-200 bg-white px-4 py-3 text-left text-base font-bold text-ink-900 shadow-sm transition hover:border-brand-400 hover:bg-brand-50'
                  }
                >
                  <span>{tool.label}</span>
                  {selected ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand-100">
                      {t('support.tools.selected')}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="lg"
              className="min-w-[10rem] text-base font-bold"
              disabled={!selectedTool}
              onClick={openSelected}
            >
              {t('support.tools.open')}
            </Button>
          </div>
        </div>
      </Card>

      {openTool === 'change_type_akte' && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8"
          onClick={closeTool}
          role="presentation"
        >
          <div
            className="relative my-4 w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-10"
              onClick={closeTool}
            >
              <X style={{ width: 14, height: 14 }} />
              {t('support.tools.close')}
            </Button>
            <ChangeTypeAkteTool
              systemKey={systemKey}
              isProduction={isProduction}
              systemName={systemName}
              deeds={deeds}
            />
          </div>
        </div>
      )}

      {openTool === 'reopen_bestelling' && orderId != null && orderId > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8"
          onClick={closeTool}
          role="presentation"
        >
          <div
            className="relative my-4 w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-10"
              onClick={closeTool}
            >
              <X style={{ width: 14, height: 14 }} />
              {t('support.tools.close')}
            </Button>
            <ReopenBestellingTool
              systemKey={systemKey}
              isProduction={isProduction}
              systemName={systemName}
              orderId={orderId}
            />
          </div>
        </div>
      )}

      {openTool === 'void_order' && orderId != null && orderId > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8"
          onClick={closeTool}
          role="presentation"
        >
          <div
            className="relative my-4 w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-10"
              onClick={closeTool}
            >
              <X style={{ width: 14, height: 14 }} />
              {t('support.tools.close')}
            </Button>
            <VoidOrderTool
              systemKey={systemKey}
              isProduction={isProduction}
              systemName={systemName}
              orderId={orderId}
            />
          </div>
        </div>
      )}

      {openTool === 'change_parcel' && orderId != null && orderId > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8"
          onClick={closeTool}
          role="presentation"
        >
          <div
            className="relative my-4 w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-10"
              onClick={closeTool}
            >
              <X style={{ width: 14, height: 14 }} />
              {t('support.tools.close')}
            </Button>
            <ChangeParcelOnOrderTool
              systemKey={systemKey}
              isProduction={isProduction}
              systemName={systemName}
              orderId={orderId}
            />
          </div>
        </div>
      )}

      {openTool === 'change_deed' && orderId != null && orderId > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8"
          onClick={closeTool}
          role="presentation"
        >
          <div
            className="relative my-4 w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-10"
              onClick={closeTool}
            >
              <X style={{ width: 14, height: 14 }} />
              {t('support.tools.close')}
            </Button>
            <ChangeDeedOnOrderTool
              systemKey={systemKey}
              isProduction={isProduction}
              systemName={systemName}
              orderId={orderId}
            />
          </div>
        </div>
      )}

      {openTool === 'retire_subject' && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 sm:p-8"
          onClick={closeTool}
          role="presentation"
        >
          <div
            className="relative my-4 w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-3 top-3 z-10"
              onClick={closeTool}
            >
              <X style={{ width: 14, height: 14 }} />
              {t('support.tools.close')}
            </Button>
            <RetireSubjectFromDeedTool
              systemKey={systemKey}
              isProduction={isProduction}
              systemName={systemName}
              initialRegisterTitle={initialRegisterTitle}
              initialParcelEsri={initialParcelEsri}
              registerTitleOptions={registerTitleOptions}
              parcelEsriOptions={parcelEsriOptions}
            />
          </div>
        </div>
      )}
    </>
  );
}
