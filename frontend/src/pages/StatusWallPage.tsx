import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Maximize2,
  Minimize2,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import { useSystemsHealth, useMondayWall } from '@/hooks/useStatusWall';
import { REFRESH_INTERVAL_OPTIONS, useStatusWallStore } from '@/store/statusWallStore';
import type { MondayItem, SystemHealth } from '@/types';

const BOARD_HEX: Record<string, string> = {
  statia: '#22c55e',
  saba: '#a24853',
  bonaire: '#f97316',
  dlv: '#3b82f6',
};

function boardHex(boardKey: string): string {
  return BOARD_HEX[boardKey] ?? '#6366f1';
}

const URGENT_PRIORITIES = new Set([
  'urgent',
  'urgente',
  'high',
  'alta',
  'critical',
  'crítica',
  'critica',
]);

function isUrgent(item: MondayItem): boolean {
  const priority = (item.priority ?? '').toLowerCase();
  const status = (item.status ?? '').toLowerCase();
  return (
    URGENT_PRIORITIES.has(priority) ||
    status.includes('urgent') ||
    status.includes('blocked') ||
    status.includes('bloque')
  );
}

function statusColor(system: SystemHealth): 'online' | 'offline' | 'unknown' {
  if (system.last_status === 'online') return 'online';
  if (system.last_status === 'offline') return 'offline';
  return 'unknown';
}

function formatInterval(ms: number): string {
  return ms >= 60000 ? `${ms / 60000} min` : `${ms / 1000} s`;
}

function SystemTile({ system }: { system: SystemHealth }) {
  const state = statusColor(system);
  const styles = {
    online: 'border-emerald-500/40 bg-emerald-500/10',
    offline: 'border-red-500/60 bg-red-500/15 animate-pulse',
    unknown: 'border-slate-600/50 bg-slate-700/20',
  }[state];

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{system.name}</p>
          <p className="truncate text-xs text-slate-400">
            {system.database_name ?? system.host ?? system.system_key}
          </p>
        </div>
        {state === 'online' ? (
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
        ) : state === 'offline' ? (
          <XCircle className="h-6 w-6 shrink-0 text-red-400" />
        ) : (
          <AlertTriangle className="h-6 w-6 shrink-0 text-slate-400" />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
            state === 'online'
              ? 'bg-emerald-500/20 text-emerald-300'
              : state === 'offline'
                ? 'bg-red-500/25 text-red-200'
                : 'bg-slate-600/30 text-slate-300'
          }`}
        >
          {state}
        </span>
        {system.is_production && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
            PROD
          </span>
        )}
      </div>

      <div className="mt-2 text-xs text-slate-400">
        {state === 'online' && system.response_ms != null ? (
          <span>{system.response_ms} ms</span>
        ) : system.last_error ? (
          <span className="line-clamp-2 text-red-300" title={system.last_error}>
            {system.last_error}
          </span>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  );
}

export function StatusWallPage() {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const refreshIntervalMs = useStatusWallStore((state) => state.refreshIntervalMs);
  const setRefreshIntervalMs = useStatusWallStore((state) => state.setRefreshIntervalMs);

  const systemsQuery = useSystemsHealth(refreshIntervalMs);
  const mondayQuery = useMondayWall(refreshIntervalMs);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen();
    }
  }

  const systems = systemsQuery.data ?? [];
  const offlineSystems = systems.filter((system) => statusColor(system) === 'offline');

  const boards = mondayQuery.data?.boards ?? [];
  const pendingItems = useMemo(
    () =>
      boards.flatMap((board) =>
        board.open_items.map((item) => ({ ...item, board_key: board.board_key, board_label: board.label })),
      ),
    [boards],
  );
  const urgentItems = useMemo(() => pendingItems.filter(isUrgent), [pendingItems]);
  const sortedPending = useMemo(
    () => [...pendingItems].sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a))),
    [pendingItems],
  );
  const totalPending = pendingItems.length;
  const totalDone = boards.reduce((sum, board) => sum + board.counts.done, 0);

  const hasAlert = offlineSystems.length > 0 || urgentItems.length > 0;
  const lastUpdated = systemsQuery.dataUpdatedAt
    ? new Date(systemsQuery.dataUpdatedAt)
    : null;

  function refreshAll() {
    void systemsQuery.refetch();
    void mondayQuery.refetch();
  }

  return (
    <div
      ref={rootRef}
      className="-mx-8 -my-8 min-h-screen bg-slate-950 px-6 py-5 text-slate-100"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600/20 text-brand-300">
            <Activity className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('statusWall.title')}</h1>
            <p className="text-sm text-slate-400">
              {now.toLocaleDateString()} · {now.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide ${
              hasAlert ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {hasAlert ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {hasAlert ? t('statusWall.alert') : t('statusWall.allOk')}
          </div>

          <select
            value={refreshIntervalMs}
            onChange={(event) => setRefreshIntervalMs(Number(event.target.value))}
            className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 focus:outline-none"
            title={t('statusWall.refreshEvery')}
          >
            {REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t('statusWall.refreshEvery')}: {formatInterval(option)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={refreshAll}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${systemsQuery.isFetching || mondayQuery.isFetching ? 'animate-spin' : ''}`}
            />
            {t('statusWall.refresh')}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {t('statusWall.fullscreen')}
          </button>
        </div>
      </header>

      {/* Alert banner */}
      {hasAlert && (
        <div className="mt-4 rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-3 text-red-200">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-semibold">
            {offlineSystems.length > 0 && (
              <span className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                {t('statusWall.systemsDown', { count: offlineSystems.length })}:{' '}
                {offlineSystems.map((system) => system.name).join(', ')}
              </span>
            )}
            {urgentItems.length > 0 && (
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t('statusWall.urgentIssues', { count: urgentItems.length })}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* Systems */}
        <section className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Database className="h-5 w-5 text-brand-300" />
              {t('statusWall.systems')}
            </h2>
            <span className="text-sm text-slate-400">
              {systems.length - offlineSystems.length}/{systems.length} {t('statusWall.online')}
            </span>
          </div>

          {systemsQuery.isError ? (
            <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
              {t('statusWall.systemsError')}
            </p>
          ) : systems.length === 0 ? (
            <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
              {systemsQuery.isLoading ? t('common.loading') : t('statusWall.noSystems')}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {systems.map((system) => (
                <SystemTile key={system.system_id} system={system} />
              ))}
            </div>
          )}
        </section>

        {/* Monday */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              {t('statusWall.monday')}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-xs font-semibold uppercase text-amber-300">
                {t('statusWall.pending')}
              </p>
              <p className="mt-1 text-4xl font-extrabold text-white">{totalPending}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-xs font-semibold uppercase text-emerald-300">
                {t('statusWall.done')}
              </p>
              <p className="mt-1 text-4xl font-extrabold text-white">{totalDone}</p>
            </div>
          </div>

          {boards.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {boards.map((board) => (
                <span
                  key={board.board_key}
                  className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: boardHex(board.board_key) }}
                  />
                  {board.label}: {board.counts.open}
                </span>
              ))}
            </div>
          )}

          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {mondayQuery.isError ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                {t('statusWall.mondayUnavailable')}
              </p>
            ) : sortedPending.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
                {mondayQuery.isLoading ? t('common.loading') : t('statusWall.noPending')}
              </p>
            ) : (
              sortedPending.map((item) => {
                const urgent = isUrgent(item);
                return (
                  <div
                    key={`${item.board}-${item.monday_item_id}`}
                    className={`rounded-xl border p-3 ${
                      urgent
                        ? 'border-red-500/60 bg-red-500/10'
                        : 'border-slate-800 bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      {urgent && (
                        <span className="shrink-0 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                          {t('statusWall.urgent')}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span
                        className="flex items-center gap-1.5"
                        style={{ color: boardHex(item.board_key) }}
                      >
                        ● {item.board_label}
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
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Placeholder: who is attending cases (next step) */}
      <section className="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
          <Users className="h-4 w-4" />
          {t('statusWall.attendingTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t('statusWall.attendingSoon')}</p>
      </section>

      <footer className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <Clock className="h-3.5 w-3.5" />
        {t('statusWall.lastUpdated')}: {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
      </footer>
    </div>
  );
}
