import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { ChangeTypeAkteTool } from '@/components/support/ChangeTypeAkteTool';
import type { DeedTypeAkteOption } from '@/types';

type ResolutionToolId = 'change_type_akte';

type ResolutionToolsMenuProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  deeds: DeedTypeAkteOption[];
};

export function ResolutionToolsMenu({
  systemKey,
  isProduction,
  systemName,
  deeds,
}: ResolutionToolsMenuProps) {
  const { t } = useTranslation();
  const [selectedTool, setSelectedTool] = useState<ResolutionToolId | ''>('');
  const [openTool, setOpenTool] = useState<ResolutionToolId | null>(null);

  const tools = useMemo(
    () =>
      [
        {
          id: 'change_type_akte' as const,
          label: t('support.tools.changeTypeAkte.title'),
          available: deeds.length > 0,
        },
      ].filter((tool) => tool.available),
    [deeds.length, t],
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
      <Card className="border-brand-200 bg-brand-50/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Wrench style={{ width: 20, height: 20 }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                {t('support.tools.title')}
              </p>
              <label className="mt-2 mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.selectTool')}
              </label>
              <Select
                value={selectedTool}
                onChange={(event) =>
                  setSelectedTool((event.target.value || '') as ResolutionToolId | '')
                }
              >
                <option value="">{t('support.tools.selectPlaceholder')}</option>
                {tools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button type="button" disabled={!selectedTool} onClick={openSelected}>
            {t('support.tools.open')}
          </Button>
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
    </>
  );
}
