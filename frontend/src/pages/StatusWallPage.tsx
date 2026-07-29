import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Maximize2,
  MemoryStick,
  Minimize2,
  RefreshCw,
  Server,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { extractErrorMessage } from '@/api/client';
import { useLocalHostHealth, useSystemsHealth, useMondayWall } from '@/hooks/useStatusWall';
import { REFRESH_INTERVAL_OPTIONS, useStatusWallStore } from '@/store/statusWallStore';
import type { LocalHostHealth, MondayItem, SystemHealth } from '@/types';

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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function usageColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 75) return 'bg-amber-400';
  return 'bg-emerald-400';
}

function ResourceMetric({
  icon,
  label,
  percent,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  percent: number | null;
  detail?: string;
}) {
  const safePercent = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
          {icon}
          {label}
        </span>
        <span className="font-mono text-sm font-bold text-white">
          {percent == null ? '—' : `${percent.toFixed(1)}%`}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${usageColor(safePercent)}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function LocalMachineCard({
  host,
  isError,
}: {
  host: LocalHostHealth | undefined;
  isError: boolean;
}) {
  const { t } = useTranslation();
  const hostOnline = Boolean(host) && !isError;
  const internetOnline = host?.internet.online ?? false;

  return (
    <div
      className={`mb-4 rounded-2xl border p-4 ${
        hostOnline ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-red-500/60 bg-red-500/10'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
            <Server className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-white">
              {host?.hostname ?? t('statusWall.localMachine')}
            </p>
            <p className="truncate text-xs text-slate-400">
              {host ? `${host.os} · ${host.arch}` : t('statusWall.hostUnavailable')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
              hostOnline
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-red-500/25 text-red-200'
            }`}
          >
            {hostOnline ? t('statusWall.online') : t('statusWall.offline')}
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              internetOnline
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-red-500/20 text-red-200'
            }`}
            title={host?.internet.error ?? undefined}
          >
            {internetOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {t('statusWall.internet')}: {internetOnline ? t('statusWall.online') : t('statusWall.offline')}
            {host?.internet.latency_ms != null ? ` · ${host.internet.latency_ms} ms` : ''}
          </span>
        </div>
      </div>

      {host && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ResourceMetric
              icon={<Cpu className="h-4 w-4" />}
              label={t('statusWall.cpu')}
              percent={host.cpu_usage_percent}
            />
            <ResourceMetric
              icon={<MemoryStick className="h-4 w-4" />}
              label={t('statusWall.memory')}
              percent={host.memory.used_percent}
              detail={`${formatBytes(host.memory.used_bytes)} / ${formatBytes(host.memory.total_bytes)}`}
            />
            <ResourceMetric
              icon={<HardDrive className="h-4 w-4" />}
              label={t('statusWall.disk')}
              percent={host.disk?.used_percent ?? null}
              detail={
                host.disk
                  ? `${formatBytes(host.disk.used_bytes)} / ${formatBytes(host.disk.total_bytes)} · ${host.disk.path}`
                  : undefined
              }
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {t('statusWall.uptime')}: {formatUptime(host.uptime_seconds)}
          </p>
        </>
      )}
    </div>
  );
}

function SystemTile({ system }: { system: SystemHealth }) {
  const { t } = useTranslation();
  const state = statusColor(system);
  const isLocal = system.host === 'localhost' || system.host === '127.0.0.1';
  const styles = {
    online: 'border-emerald-400/60 bg-gradient-to-br from-emerald-500/20 to-emerald-950/30 shadow-emerald-950/30',
    offline: 'border-red-500/70 bg-gradient-to-br from-red-500/20 to-red-950/30 shadow-red-950/30',
    unknown: 'border-slate-600/60 bg-gradient-to-br from-slate-700/30 to-slate-950/30',
  }[state];
  const indicator = {
    online: 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]',
    offline: 'bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.9)] animate-pulse',
    unknown: 'bg-slate-500',
  }[state];
  const stateLabel =
    state === 'online'
      ? t('statusWall.online')
      : state === 'offline'
        ? t('statusWall.offline')
        : t('statusWall.unknown');

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-lg ${styles}`}>
      <div
        className={`absolute inset-x-0 bottom-0 h-1 ${
          state === 'online'
            ? 'bg-emerald-400'
            : state === 'offline'
              ? 'bg-red-500'
              : 'bg-slate-600'
        }`}
      />

      <div className="flex items-start gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950/50">
          <Database
            className={`h-6 w-6 ${
              state === 'online'
                ? 'text-emerald-300'
                : state === 'offline'
                  ? 'text-red-300'
                  : 'text-slate-400'
            }`}
          />
          <span className={`absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-slate-950 ${indicator}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-white">{system.name}</p>
          <p className="truncate text-xs text-slate-400">{system.database_name ?? system.system_key}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
            {system.host ?? '—'}{system.port ? `:${system.port}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide ${
              state === 'online'
                ? 'bg-emerald-400/20 text-emerald-200'
                : state === 'offline'
                  ? 'bg-red-500/25 text-red-100'
                  : 'bg-slate-600/30 text-slate-300'
            }`}
          >
            {stateLabel}
          </span>
          <span className="rounded-full bg-slate-800/80 px-2 py-1 text-[10px] font-bold uppercase text-slate-300">
            {isLocal ? t('statusWall.local') : t('statusWall.remote')}
          </span>
          {system.is_production && (
            <span className="rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-bold uppercase text-amber-300">
              PROD
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-sm font-bold text-white">
          {state === 'online' && system.response_ms != null ? `${system.response_ms} ms` : '—'}
        </span>
      </div>

      {state !== 'online' && system.last_error && (
        <p className="mt-3 line-clamp-2 text-xs text-red-200" title={system.last_error}>
          {system.last_error}
        </p>
      )}
      <div className="mt-3 text-[10px] text-slate-500">
        {t('statusWall.checked')}:{' '}
        {system.last_checked_at ? new Date(system.last_checked_at).toLocaleTimeString() : '—'}
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

  const hostQuery = useLocalHostHealth(refreshIntervalMs);
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
  const onlineSystems = systems.filter((system) => statusColor(system) === 'online');
  const offlineSystems = systems.filter((system) => statusColor(system) === 'offline');
  const host = hostQuery.data;
  const hostResourceAlert = Boolean(
    host &&
      ((host.cpu_usage_percent ?? 0) >= 90 ||
        host.memory.used_percent >= 90 ||
        (host.disk?.used_percent ?? 0) >= 90),
  );
  const hostAlert = hostQuery.isError || Boolean(host && !host.internet.online) || hostResourceAlert;

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

  const hasAlert = hostAlert || offlineSystems.length > 0 || urgentItems.length > 0;
  const lastUpdatedAt = Math.max(hostQuery.dataUpdatedAt, systemsQuery.dataUpdatedAt);
  const lastUpdated = lastUpdatedAt
    ? new Date(lastUpdatedAt)
    : null;

  function refreshAll() {
    void hostQuery.refetch();
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
              className={`h-4 w-4 ${
                hostQuery.isFetching || systemsQuery.isFetching || mondayQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
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
            {hostAlert && (
              <span className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                {hostQuery.isError
                  ? t('statusWall.hostUnavailable')
                  : !host?.internet.online
                    ? t('statusWall.internetDown')
                    : t('statusWall.hostResourcesHigh')}
              </span>
            )}
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
              {onlineSystems.length}/{systems.length} {t('statusWall.online')}
            </span>
          </div>

          <LocalMachineCard host={host} isError={hostQuery.isError} />

          {systemsQuery.isError ? (
            <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
              {t('statusWall.systemsError')}: {extractErrorMessage(systemsQuery.error)}
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
