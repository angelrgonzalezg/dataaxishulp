import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface HostResourceHealth {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

export interface LocalHostHealth {
  online: true;
  hostname: string;
  os: string;
  arch: string;
  uptime_seconds: number;
  cpu_usage_percent: number | null;
  memory: HostResourceHealth;
  disk: (HostResourceHealth & { path: string }) | null;
  internet: {
    online: boolean;
    latency_ms: number | null;
    error: string | null;
  };
  checked_at: string;
}

type CpuSnapshot = { idle: number; total: number };

function snapshotCpu(): CpuSnapshot {
  return os.cpus().reduce(
    (snapshot, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return {
        idle: snapshot.idle + cpu.times.idle,
        total: snapshot.total + total,
      };
    },
    { idle: 0, total: 0 },
  );
}

async function readCpuUsage(sampleMs = 250): Promise<number | null> {
  const start = snapshotCpu();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = snapshotCpu();
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return null;

  const idleDelta = end.idle - start.idle;
  return Number(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)).toFixed(1));
}

function resourceHealth(total: number, free: number): HostResourceHealth {
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

async function readDiskHealth(): Promise<LocalHostHealth['disk']> {
  const diskPath =
    process.platform === 'win32'
      ? `${process.env.SystemDrive ?? path.parse(process.cwd()).root.replace(/\\$/, '')}\\`
      : '/';

  try {
    const stats = await fs.statfs(diskPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return { path: diskPath, ...resourceHealth(total, free) };
  } catch {
    return null;
  }
}

async function checkInternet(): Promise<LocalHostHealth['internet']> {
  const startedAt = Date.now();
  try {
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { online: true, latency_ms: Date.now() - startedAt, error: null };
  } catch (error) {
    return {
      online: false,
      latency_ms: null,
      error: error instanceof Error ? error.message.slice(0, 200) : 'Internet check failed',
    };
  }
}

export async function getLocalHostHealth(): Promise<LocalHostHealth> {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const [cpuUsage, disk, internet] = await Promise.all([
    readCpuUsage(),
    readDiskHealth(),
    checkInternet(),
  ]);

  return {
    online: true,
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    uptime_seconds: Math.floor(os.uptime()),
    cpu_usage_percent: cpuUsage,
    memory: resourceHealth(totalMemory, freeMemory),
    disk,
    internet,
    checked_at: new Date().toISOString(),
  };
}
