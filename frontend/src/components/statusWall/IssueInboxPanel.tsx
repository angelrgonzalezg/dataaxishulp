import { AlertTriangle, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface WallIssue {
  id: string;
  name: string;
  sourceLabel: string;
  sourceColor: string;
  extra?: string;
  status?: string | null;
  assignee?: string | null;
  urgent: boolean;
}

export function IssueInboxPanel({
  title,
  accentClass,
  pending,
  done,
  chips,
  items,
  isError,
  isLoading,
  errorLabel,
}: {
  title: string;
  accentClass: string;
  pending: number;
  done: number;
  chips: Array<{ key: string; label: string; color: string; open: number }>;
  items: WallIssue[];
  isError: boolean;
  isLoading: boolean;
  errorLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3">
      <h2 className={`flex items-center gap-2 text-lg font-bold ${accentClass}`}>
        <AlertTriangle className="h-5 w-5" />
        {title}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-xs font-semibold uppercase text-amber-300">{t('statusWall.pending')}</p>
          <p className="mt-1 text-4xl font-extrabold text-white">{pending}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs font-semibold uppercase text-emerald-300">{t('statusWall.done')}</p>
          <p className="mt-1 text-4xl font-extrabold text-white">{done}</p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chip.color }} />
              {chip.label}: {chip.open}
            </span>
          ))}
        </div>
      )}

      <div className="max-h-[28vh] space-y-2 overflow-y-auto pr-1">
        {isError ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            {errorLabel}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            {isLoading ? t('common.loading') : t('statusWall.noPending')}
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 ${
                item.urgent ? 'border-red-500/60 bg-red-500/10' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                {item.urgent && (
                  <span className="shrink-0 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                    {t('statusWall.urgent')}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1.5" style={{ color: item.sourceColor }}>
                  ● {item.sourceLabel}
                  {item.extra ? ` · ${item.extra}` : ''}
                </span>
                {item.status && <span>{item.status}</span>}
                {item.assignee && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {item.assignee}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
