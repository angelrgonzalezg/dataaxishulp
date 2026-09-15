import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DAX_OPS_CONTRACT,
  DAX_OPS_MODULE,
  type DaxOpsDependency,
  type DaxOpsHealthReport,
  type DaxOpsResource,
  type DaxOpsSessions,
  type DaxOpsStatus,
} from './contract';

export interface CollectDaxOpsOptions {
  ownerApp: string;
  appName: string;
  appVersion: string;
  pingDependencies?: () => Promise<DaxOpsDependency[]>;
  listSessions?: () => Promise<DaxOpsSessions>;
}

function isVercel(): boolean {
  return process.env.VERCEL === '1';
}

function resource(total: number, free: number): DaxOpsResource {
  const safeTotal = Math.max(0, total);
  const safeFree = Math.max(0, Math.min(free, safeTotal));
  const used = safeTotal - safeFree;
  return {
    total_bytes: safeTotal,
    used_bytes: used,
    free_bytes: safeFree,
    used_percent: safeTotal > 0 ? Number(((used / safeTotal) * 100).toFixed(1)) : 0,
  };
}

async function readDisk(): Promise<DaxOpsHealthReport['resources']['disk']> {
  if (isVercel()) return null;
  const diskPath =
    process.platform === 'win32'
      ? `${process.env.SystemDrive ?? path.parse(process.cwd()).root.replace(/\\$/, '')}\\`
      : '/';
  try {
    const stats = await fs.statfs(diskPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return { path: diskPath, ...resource(total, free) };
  } catch {
    return null;
  }
}

function deriveStatus(dependencies: DaxOpsDependency[]): DaxOpsStatus {
  if (dependencies.some((item) => !item.online && item.kind === 'database')) {
    return 'degraded';
  }
  if (dependencies.some((item) => !item.online)) {
    return 'degraded';
  }
  return 'online';
}

export async function collectDaxOpsHealth(
  options: CollectDaxOpsOptions,
): Promise<DaxOpsHealthReport> {
  const memoryUsage = process.memoryUsage();
  const hostMemory = resource(os.totalmem(), os.freemem());
  const [disk, dependencies, sessions] = await Promise.all([
    readDisk(),
    options.pingDependencies ? options.pingDependencies() : Promise.resolve([]),
    options.listSessions ? options.listSessions() : Promise.resolve(undefined),
  ]);

  return {
    contract: DAX_OPS_CONTRACT,
    module: DAX_OPS_MODULE,
    owner_app: options.ownerApp,
    checked_at: new Date().toISOString(),
    status: deriveStatus(dependencies),
    app: {
      name: options.appName,
      version: options.appVersion,
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
      git_ref: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GIT_COMMIT_REF ?? null,
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
    },
    runtime: {
      platform: isVercel() ? 'vercel' : 'node',
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      region: process.env.VERCEL_REGION ?? process.env.DAX_OPS_REGION ?? null,
      vercel: isVercel()
        ? {
            env: process.env.VERCEL_ENV ?? null,
            url: process.env.VERCEL_URL ?? null,
            region: process.env.VERCEL_REGION ?? null,
            deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
            git_repo: process.env.VERCEL_GIT_REPO_SLUG ?? null,
          }
        : null,
    },
    resources: {
      memory: {
        ...hostMemory,
        rss_bytes: memoryUsage.rss,
        heap_used_bytes: memoryUsage.heapUsed,
        heap_total_bytes: memoryUsage.heapTotal,
      },
      cpu_usage_percent: null,
      disk,
    },
    dependencies,
    ...(sessions ? { sessions } : {}),
  };
}
