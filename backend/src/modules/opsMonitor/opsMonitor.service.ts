import { prisma } from '../../config/db';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { callDaxOpsAgent } from './daxOpsClient';
import type { DaxOpsHealthReport } from './daxOpsContract';
import { classifyTransition, getNotifierStatus, recordStatusTransition } from './opsNotifier';
import { listActivePresences } from './opsPresence.service';
import type {
  OpsAlertView,
  OpsHealthLogView,
  OpsOverview,
  OpsProbeMode,
  OpsStatus,
  OpsTargetView,
} from './opsMonitor.types';

const LOG_RETENTION_PER_TARGET = 200;
const PROBE_CONCURRENCY = 3;

function resolveEnv(name: string | null | undefined): string | null {
  if (!name) return null;
  const value = process.env[name]?.trim();
  return value || null;
}

function parseReport(json: string | null): DaxOpsHealthReport | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DaxOpsHealthReport;
  } catch {
    return null;
  }
}

function firstDatabase(report: DaxOpsHealthReport | null) {
  return report?.dependencies.find((item) => item.kind === 'database') ?? null;
}

function mapTarget(row: {
  targetId: number;
  targetKey: string;
  displayName: string;
  productFamily: string;
  componentKind: string;
  environment: string;
  ownerApp: string;
  origin: string;
  probeMode: string;
  baseUrlEnvVar: string | null;
  healthPath: string;
  authEnvVar: string | null;
  vercelProjectId: string | null;
  region: string | null;
  requiresVpn: boolean;
  checkIntervalSec: number;
  timeoutMs: number;
  isActive: boolean;
  agentInstalled: boolean;
  alertOnOffline: boolean;
  alertOnDegraded: boolean;
  notes: string | null;
  lastStatus: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  lastAppVersion: string | null;
  lastGitSha: string | null;
  lastNodeVersion: string | null;
  lastHostname: string | null;
  lastRegion: string | null;
  lastCpuPercent: number | null;
  lastMemUsedPct: number | null;
  lastDiskUsedPct: number | null;
  lastPayloadJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OpsTargetView {
  return {
    target_id: row.targetId,
    target_key: row.targetKey,
    display_name: row.displayName,
    product_family: row.productFamily,
    component_kind: row.componentKind,
    environment: row.environment,
    owner_app: row.ownerApp,
    origin: row.origin,
    probe_mode: row.probeMode as OpsProbeMode,
    health_path: row.healthPath,
    resolved_base_url: resolveEnv(row.baseUrlEnvVar),
    has_auth_token: Boolean(resolveEnv(row.authEnvVar)),
    vercel_project_id: row.vercelProjectId,
    region: row.region,
    requires_vpn: row.requiresVpn,
    check_interval_sec: row.checkIntervalSec,
    timeout_ms: row.timeoutMs,
    is_active: row.isActive,
    agent_installed: row.agentInstalled,
    alert_on_offline: row.alertOnOffline,
    alert_on_degraded: row.alertOnDegraded,
    notes: row.notes,
    last_status: (row.lastStatus as OpsStatus | null) ?? null,
    last_checked_at: row.lastCheckedAt,
    last_error: row.lastError,
    last_latency_ms: row.lastLatencyMs,
    last_app_version: row.lastAppVersion,
    last_git_sha: row.lastGitSha,
    last_node_version: row.lastNodeVersion,
    last_hostname: row.lastHostname,
    last_region: row.lastRegion,
    last_cpu_percent: row.lastCpuPercent,
    last_mem_used_pct: row.lastMemUsedPct,
    last_disk_used_pct: row.lastDiskUsedPct,
    last_report: parseReport(row.lastPayloadJson),
    connected_users: sessionsFromReport(parseReport(row.lastPayloadJson)),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function sessionsFromReport(report: DaxOpsHealthReport | null): OpsTargetView['connected_users'] {
  if (!report?.sessions) return null;
  return {
    count: report.sessions.active_count,
    names: report.sessions.users.map((user) => user.name),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => runWorker()),
  );
  return results;
}

async function pruneLogs(targetId: number): Promise<void> {
  const extras = await prisma.opsHealthLog.findMany({
    where: { targetId },
    orderBy: { checkedAt: 'desc' },
    skip: LOG_RETENTION_PER_TARGET,
    select: { logId: true },
  });
  if (extras.length === 0) return;
  await prisma.opsHealthLog.deleteMany({
    where: { logId: { in: extras.map((row) => row.logId) } },
  });
}

export async function listTargets(): Promise<OpsTargetView[]> {
  const rows = await prisma.opsTarget.findMany({
    orderBy: [{ productFamily: 'asc' }, { displayName: 'asc' }],
  });
  return rows.map(mapTarget);
}

export async function getOverview(): Promise<OpsOverview> {
  const targets = await listTargets();
  const active = targets.filter((target) => target.is_active);
  const controlPlaneUsers = await listActivePresences('dataaxishulp');
  const alerts = await prisma.opsAlertEvent.findMany({
    orderBy: { triggeredAt: 'desc' },
    take: 12,
    include: { target: { select: { displayName: true } } },
  });

  const intervals = active
    .filter((target) => target.agent_installed)
    .map((target) => target.check_interval_sec);

  return {
    generated_at: new Date().toISOString(),
    control_plane: 'daxhulp',
    agent_module: 'dax-ops-agent',
    probe_interval_sec: intervals.length ? Math.min(...intervals) : 60,
    targets: active,
    control_plane_users: controlPlaneUsers,
    whatsapp: getNotifierStatus(),
    recent_alerts: alerts.map(
      (event): OpsAlertView => ({
        event_id: event.eventId,
        target_id: event.targetId,
        target_name: event.target.displayName,
        triggered_at: event.triggeredAt,
        severity: event.severity,
        kind: event.kind,
        message: event.message,
        from_status: event.fromStatus,
        to_status: event.toStatus,
        notification_status: event.notificationStatus,
        channel: event.channel,
      }),
    ),
    counts: {
      total: active.length,
      online: active.filter((target) => target.last_status === 'online').length,
      degraded: active.filter((target) => target.last_status === 'degraded').length,
      offline: active.filter((target) => target.last_status === 'offline').length,
      pending: active.filter(
        (target) => target.last_status === 'pending' || target.probe_mode === 'pending_agent',
      ).length,
    },
  };
}

export async function listTargetLogs(targetId: number, limit = 40): Promise<OpsHealthLogView[]> {
  const target = await prisma.opsTarget.findUnique({ where: { targetId } });
  if (!target) throw new NotFoundError('Ops target not found');

  const rows = await prisma.opsHealthLog.findMany({
    where: { targetId },
    orderBy: { checkedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });

  return rows.map((row) => ({
    log_id: row.logId,
    target_id: row.targetId,
    checked_at: row.checkedAt,
    status: row.status as OpsStatus,
    latency_ms: row.latencyMs,
    http_status: row.httpStatus,
    error: row.error,
    app_version: row.appVersion,
    git_sha: row.gitSha,
    region: row.region,
    mem_used_percent: row.memUsedPercent,
    disk_used_percent: row.diskUsedPercent,
    db_online: row.dbOnline,
    db_latency_ms: row.dbLatencyMs,
    vercel_env: row.vercelEnv,
    source_module: row.sourceModule,
    alert_triggered: row.alertTriggered,
  }));
}

export async function updateCheckInterval(checkIntervalSec: number): Promise<OpsOverview> {
  if (!Number.isFinite(checkIntervalSec) || checkIntervalSec < 15 || checkIntervalSec > 3600) {
    throw new ValidationError('Check interval must be between 15 and 3600 seconds');
  }

  await prisma.opsTarget.updateMany({
    where: { agentInstalled: true, probeMode: 'dax_ops_agent' },
    data: { checkIntervalSec },
  });

  return getOverview();
}

function dueForProbe(
  lastCheckedAt: Date | null,
  intervalSec: number,
  force: boolean,
): boolean {
  if (force || !lastCheckedAt) return true;
  return Date.now() - lastCheckedAt.getTime() >= intervalSec * 1000;
}

async function persistProbe(row: {
  targetId: number;
  lastStatus: string | null;
  alertOnOffline: boolean;
  alertOnDegraded: boolean;
  displayName: string;
}, result: {
  status: OpsStatus;
  latencyMs: number | null;
  httpStatus: number | null;
  error: string | null;
  report: DaxOpsHealthReport | null;
}): Promise<OpsTargetView> {
  const report = result.report;
  const database = firstDatabase(report);
  const nextStatus = result.status;
  const transition = classifyTransition(row.lastStatus, nextStatus);
  const shouldAlert =
    Boolean(transition) &&
    ((transition?.kind === 'offline' && row.alertOnOffline) ||
      (transition?.kind === 'degraded' && row.alertOnDegraded) ||
      transition?.kind === 'recovered');

  let alertTriggered = false;
  if (shouldAlert && transition) {
    await recordStatusTransition({
      targetId: row.targetId,
      fromStatus: row.lastStatus,
      toStatus: nextStatus,
      kind: transition.kind,
      severity: transition.severity,
      message: `${row.displayName}: ${row.lastStatus ?? 'unknown'} → ${nextStatus}${
        result.error ? ` (${result.error})` : ''
      }`,
    });
    alertTriggered = true;
  }

  const payloadJson = report ? JSON.stringify(report) : null;

  const [updated] = await prisma.$transaction([
    prisma.opsTarget.update({
      where: { targetId: row.targetId },
      data: {
        lastStatus: nextStatus,
        lastCheckedAt: new Date(),
        lastError: result.error,
        lastLatencyMs: result.latencyMs,
        lastAppVersion: report?.app.version ?? null,
        lastGitSha: report?.app.git_sha?.slice(0, 40) ?? null,
        lastNodeVersion: report?.app.node_version ?? null,
        lastHostname: report?.runtime.hostname ?? null,
        lastRegion: report?.runtime.region ?? report?.runtime.vercel?.region ?? null,
        lastCpuPercent: report?.resources.cpu_usage_percent ?? null,
        lastMemUsedPct: report?.resources.memory.used_percent ?? null,
        lastDiskUsedPct: report?.resources.disk?.used_percent ?? null,
        lastPayloadJson: payloadJson,
      },
    }),
    prisma.opsHealthLog.create({
      data: {
        targetId: row.targetId,
        status: nextStatus,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        error: result.error,
        appVersion: report?.app.version ?? null,
        gitSha: report?.app.git_sha?.slice(0, 40) ?? null,
        nodeVersion: report?.app.node_version ?? null,
        hostname: report?.runtime.hostname ?? null,
        region: report?.runtime.region ?? report?.runtime.vercel?.region ?? null,
        cpuPercent: report?.resources.cpu_usage_percent ?? null,
        memUsedPercent: report?.resources.memory.used_percent ?? null,
        diskUsedPercent: report?.resources.disk?.used_percent ?? null,
        dbOnline: database ? database.online : null,
        dbLatencyMs: database?.latency_ms ?? null,
        vercelEnv: report?.runtime.vercel?.env ?? null,
        sourceModule: 'daxhulp-poller',
        payloadJson,
        alertTriggered,
      },
    }),
  ]);

  void pruneLogs(row.targetId).catch((error) => {
    console.warn('[daxhulp-poller] log prune failed', error);
  });

  return mapTarget(updated);
}

async function probeOne(
  row: Awaited<ReturnType<typeof prisma.opsTarget.findMany>>[number],
  force: boolean,
): Promise<OpsTargetView> {
  if (!dueForProbe(row.lastCheckedAt, row.checkIntervalSec, force) && row.probeMode !== 'pending_agent') {
    return mapTarget(row);
  }

  if (row.probeMode === 'pending_agent') {
    if (!force && row.lastStatus === 'pending') {
      return mapTarget(row);
    }
    const updated = await prisma.opsTarget.update({
      where: { targetId: row.targetId },
      data: {
        lastStatus: 'pending',
        lastCheckedAt: new Date(),
        lastError: 'dax-ops-agent not installed on this application yet',
      },
    });
    return mapTarget(updated);
  }

  if (row.probeMode !== 'dax_ops_agent') {
    return mapTarget(row);
  }

  if (!dueForProbe(row.lastCheckedAt, row.checkIntervalSec, force)) {
    return mapTarget(row);
  }

  const baseUrl = resolveEnv(row.baseUrlEnvVar);
  if (!baseUrl) {
    return persistProbe(row, {
      status: 'unknown',
      latencyMs: null,
      httpStatus: null,
      error: `Base URL not configured (${row.baseUrlEnvVar ?? 'missing env'})`,
      report: null,
    });
  }

  const token = resolveEnv(row.authEnvVar);
  if (!token) {
    return persistProbe(row, {
      status: 'unknown',
      latencyMs: null,
      httpStatus: null,
      error: `Agent token not configured (${row.authEnvVar ?? 'missing env'})`,
      report: null,
    });
  }

  const result = await callDaxOpsAgent({
    baseUrl,
    healthPath: row.healthPath,
    token,
    timeoutMs: row.timeoutMs,
  });

  return persistProbe(row, {
    status: result.status,
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
    error: result.error,
    report: result.report,
  });
}

export async function probeTargets(options?: {
  force?: boolean;
  targetId?: number;
}): Promise<OpsTargetView[]> {
  const rows = await prisma.opsTarget.findMany({
    where: {
      isActive: true,
      ...(options?.targetId ? { targetId: options.targetId } : {}),
    },
    orderBy: { displayName: 'asc' },
  });

  return mapWithConcurrency(rows, PROBE_CONCURRENCY, (row) =>
    probeOne(row, Boolean(options?.force)),
  );
}
