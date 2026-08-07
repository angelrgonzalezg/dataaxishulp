import { prisma } from '../../config/db';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import {
  parseSqlServerUrl,
  resolveSystemConnectionUrl,
  testSqlServerConnection,
} from '../../utils/systemConnection';
import { isProductionSystem } from '../support/support.frames';
import { normalizeDialect, type SystemDialect } from '../support/systemDialect';

export interface SystemResponse {
  system_id: number;
  system_key: string;
  name: string;
  description: string | null;
  dialect: SystemDialect;
  env_var_name: string;
  host: string | null;
  port: number | null;
  database_name: string | null;
  is_active: boolean;
  is_production: boolean;
  has_connection_url: boolean;
  last_checked_at: Date | null;
  last_status: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SystemHealth extends SystemResponse {
  /** Round-trip time of the connectivity probe in ms (null when it failed or was skipped). */
  response_ms: number | null;
}

function mapSystem(row: {
  systemId: number;
  systemKey: string;
  name: string;
  description: string | null;
  dialect: string;
  envVarName: string;
  host: string | null;
  port: number | null;
  databaseName: string | null;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SystemResponse {
  const url = resolveSystemConnectionUrl(row.envVarName);
  // Prefer live values from the env connection URL so UI matches .env after renames.
  let host = row.host;
  let port = row.port;
  let databaseName = row.databaseName;
  if (url) {
    try {
      const parsed = parseSqlServerUrl(url);
      host = parsed.server || host;
      port = parsed.port || port;
      databaseName = parsed.database ?? databaseName;
    } catch {
      // keep stored metadata if URL is malformed
    }
  }

  return {
    system_id: row.systemId,
    system_key: row.systemKey,
    name: row.name,
    description: row.description,
    dialect: normalizeDialect(row.dialect, row.systemKey),
    env_var_name: row.envVarName,
    host,
    port,
    database_name: databaseName,
    is_active: row.isActive,
    is_production: isProductionSystem(row.systemKey, row.envVarName),
    has_connection_url: Boolean(url),
    last_checked_at: row.lastCheckedAt,
    last_status: row.lastStatus,
    last_error: row.lastError,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function listSystems(): Promise<SystemResponse[]> {
  const rows = await prisma.systemConnection.findMany({
    orderBy: { name: 'asc' },
  });
  return rows.map(mapSystem);
}

export async function getSystemById(systemId: number): Promise<SystemResponse> {
  const row = await prisma.systemConnection.findUnique({ where: { systemId } });
  if (!row) throw new NotFoundError('System not found');
  return mapSystem(row);
}

export async function testSystemConnection(systemId: number): Promise<SystemResponse> {
  const row = await prisma.systemConnection.findUnique({ where: { systemId } });
  if (!row) throw new NotFoundError('System not found');

  const url = resolveSystemConnectionUrl(row.envVarName);
  if (!url) {
    throw new ValidationError(
      `Connection URL not configured. Set environment variable ${row.envVarName}`,
    );
  }

  const result = await testSqlServerConnection(url);
  const updated = await prisma.systemConnection.update({
    where: { systemId },
    data: {
      lastCheckedAt: new Date(),
      lastStatus: result.ok ? 'online' : 'offline',
      lastError: result.ok ? null : (result.error ?? 'Connection failed').slice(0, 500),
    },
  });

  return mapSystem(updated);
}

const HEALTH_PROBE_CONCURRENCY = 3;

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

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Live connectivity probe for every active system connection.
 * Uses limited concurrency so ODBC/VPN probes don't stall the Status Wall.
 * Persists last-known status and returns each system with a response time.
 */
export async function checkAllSystemsHealth(): Promise<SystemHealth[]> {
  const rows = await prisma.systemConnection.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  return mapWithConcurrency(rows, HEALTH_PROBE_CONCURRENCY, async (row): Promise<SystemHealth> => {
    try {
      const url = resolveSystemConnectionUrl(row.envVarName);
      if (!url) {
        const updated = await prisma.systemConnection.update({
          where: { systemId: row.systemId },
          data: {
            lastCheckedAt: new Date(),
            lastStatus: 'unknown',
            lastError: `Connection URL not configured (${row.envVarName})`.slice(0, 500),
          },
        });
        return { ...mapSystem(updated), response_ms: null };
      }

      const startedAt = Date.now();
      const result = await testSqlServerConnection(url);
      const elapsed = Date.now() - startedAt;
      const updated = await prisma.systemConnection.update({
        where: { systemId: row.systemId },
        data: {
          lastCheckedAt: new Date(),
          lastStatus: result.ok ? 'online' : 'offline',
          lastError: result.ok ? null : (result.error ?? 'Connection failed').slice(0, 500),
        },
      });
      return { ...mapSystem(updated), response_ms: result.ok ? elapsed : null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected health-check failure';
      try {
        const updated = await prisma.systemConnection.update({
          where: { systemId: row.systemId },
          data: {
            lastCheckedAt: new Date(),
            lastStatus: 'offline',
            lastError: message.slice(0, 500),
          },
        });
        return { ...mapSystem(updated), response_ms: null };
      } catch {
        return {
          ...mapSystem(row),
          response_ms: null,
          last_status: 'offline',
          last_error: message.slice(0, 500),
          last_checked_at: new Date(),
        };
      }
    }
  });
}
