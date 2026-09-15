import { Cloud, Database, Globe, Shield, Smartphone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DaxOpsDependency, OpsStatus, OpsTarget } from '@/types';

const FAMILY_ACCENT: Record<string, string> = {
  thuiszorgtv: '#22d3ee',
  kadaster: '#22c55e',
  'kadaster-statia-saba': '#84cc16',
  tereno: '#3b82f6',
  dataaxishulp: '#a78bfa',
};

function accent(family: string): string {
  return FAMILY_ACCENT[family] ?? '#6366f1';
}

function formatBytes(bytes: unknown): string {
  const value = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function statusTone(status: OpsStatus | null): 'online' | 'degraded' | 'offline' | 'pending' {
  if (status === 'online') return 'online';
  if (status === 'degraded') return 'degraded';
  if (status === 'offline') return 'offline';
  return 'pending';
}

function databaseOf(target: OpsTarget): DaxOpsDependency | null {
  return target.last_report?.dependencies.find((item) => item.kind === 'database') ?? null;
}

function AppTile({ target }: { target: OpsTarget }) {
  const { t } = useTranslation();
  const tone = statusTone(target.last_status);
  const styles = {
    online: 'border-emerald-400/60 bg-gradient-to-br from-emerald-500/15 to-slate-950/40',
    degraded: 'border-amber-400/70 bg-gradient-to-br from-amber-500/15 to-slate-950/40',
    offline: 'border-red-500/70 bg-gradient-to-br from-red-500/20 to-slate-950/40',
    pending: 'border-slate-600/70 bg-gradient-to-br from-slate-800/40 to-slate-950/40',
  }[tone];
  const indicator = {
    online: 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]',
    degraded: 'bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.8)]',
    offline: 'bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.9)] animate-pulse',
    pending: 'bg-slate-500',
  }[tone];
  const report = target.last_report;
  const database = databaseOf(target);
  const vercel = report?.runtime.vercel;
  const color = accent(target.product_family);

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-lg ${styles}`}>
      <div className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950/50">
          {target.component_kind === 'vercel' ? (
            <Cloud className="h-6 w-6 text-cyan-300" />
          ) : (
            <Smartphone className="h-6 w-6 text-slate-200" />
          )}
          <span className={`absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-slate-950 ${indicator}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold text-white">{target.display_name}</p>
          <p className="truncate text-xs text-slate-400">
            {target.product_family} · {target.environment}
            {target.last_app_version ? ` · v${target.last_app_version}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-extrabold uppercase ${
            tone === 'online'
              ? 'bg-emerald-400/20 text-emerald-200'
              : tone === 'degraded'
                ? 'bg-amber-400/20 text-amber-100'
                : tone === 'offline'
                  ? 'bg-red-500/25 text-red-100'
                  : 'bg-slate-600/40 text-slate-300'
          }`}
        >
          {t(`statusWall.${tone === 'pending' ? 'pendingAgent' : tone}`)}
        </span>
        <span className="rounded-full bg-violet-500/20 px-2 py-1 text-[10px] font-bold uppercase text-violet-200">
          {target.agent_installed ? 'DAX-OPS' : 'DAX-HULP'}
        </span>
        {target.requires_vpn && (
          <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase text-slate-300">
            <Shield className="h-3 w-3" />
            VPN
          </span>
        )}
        {(vercel || target.component_kind === 'vercel') && (
          <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[10px] font-bold uppercase text-cyan-200">
            Vercel{vercel?.env ? ` · ${vercel.env}` : ''}
          </span>
        )}
      </div>

      {target.probe_mode === 'pending_agent' ? (
        <div className="mt-4 space-y-2 text-sm text-slate-400">
          <p>{t('statusWall.agentPendingHint')}</p>
          <p className="flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5" />
            {t('statusWall.usersUnknown')}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
          <p>
            <span className="text-slate-500">{t('statusWall.region')}: </span>
            {target.last_region ?? vercel?.region ?? target.region ?? '—'}
          </p>
          <p>
            <span className="text-slate-500">{t('statusWall.latency')}: </span>
            {target.last_latency_ms != null ? `${target.last_latency_ms} ms` : '—'}
          </p>
          <p>
            <span className="text-slate-500">{t('statusWall.memory')}: </span>
            {target.last_mem_used_pct != null ? `${target.last_mem_used_pct.toFixed(1)}%` : '—'}
          </p>
          <p>
            <span className="text-slate-500">{t('statusWall.node')}: </span>
            {target.last_node_version ?? '—'}
          </p>
          <p className="sm:col-span-2 flex items-start gap-2">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {target.connected_users
              ? `${t('statusWall.connectedUsers')}: ${target.connected_users.count}${
                  target.connected_users.names.length
                    ? ` · ${target.connected_users.names.slice(0, 6).join(', ')}`
                    : ''
                }`
              : t('statusWall.usersUnknown')}
          </p>
          {database && (
            <p className="sm:col-span-2 flex items-center gap-2">
              <Database className="h-3.5 w-3.5" />
              {database.online ? t('statusWall.dbOnline') : t('statusWall.dbOffline')}
              {database.latency_ms != null ? ` · ${database.latency_ms} ms` : ''}
              {typeof database.detail?.database_name === 'string'
                ? ` · ${database.detail.database_name}`
                : ''}
              {typeof database.detail?.used_percent === 'number'
                ? ` · ${t('statusWall.disk')} ${database.detail.used_percent}%`
                : ''}
              {typeof database.detail?.total_bytes === 'number'
                ? ` (${formatBytes(database.detail.used_bytes)} / ${formatBytes(database.detail.total_bytes)})`
                : ''}
            </p>
          )}
          {target.last_git_sha && (
            <p className="sm:col-span-2 font-mono text-[11px] text-slate-500">
              {target.last_git_sha.slice(0, 8)}
              {report?.app.git_ref ? ` · ${report.app.git_ref}` : ''}
            </p>
          )}
        </div>
      )}

      {tone === 'offline' && target.last_error && (
        <p className="mt-3 line-clamp-2 text-xs text-red-200" title={target.last_error}>
          {target.last_error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
        <Globe className="h-3 w-3" />
        {t('statusWall.checked')}:{' '}
        {target.last_checked_at ? new Date(target.last_checked_at).toLocaleTimeString() : '—'}
      </div>
    </div>
  );
}

export function AppFleetSection({
  targets,
  isError,
  errorMessage,
}: {
  targets: OpsTarget[];
  isError: boolean;
  errorMessage?: string;
}) {
  const { t } = useTranslation();
  const online = targets.filter((target) => target.last_status === 'online').length;

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Cloud className="h-5 w-5 text-cyan-300" />
          {t('statusWall.applications')}
        </h2>
        <span className="text-sm text-slate-400">
          {online}/{targets.length} {t('statusWall.online')}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">{t('statusWall.applicationsHint')}</p>
      {isError ? (
        <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
          {t('statusWall.appsError')}: {errorMessage}
        </p>
      ) : targets.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
          {t('statusWall.noApps')}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {targets.map((target) => (
            <AppTile key={target.target_id} target={target} />
          ))}
        </div>
      )}
    </section>
  );
}
