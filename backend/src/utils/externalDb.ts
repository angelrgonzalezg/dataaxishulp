import type { ConnectionPool } from 'mssql';
import { prisma } from '../config/db';
import { AppError, NotFoundError, ValidationError } from './AppError';
import {
  activateMssqlDriver,
  buildMssqlConfig,
  resolveSystemConnectionUrl,
  type MssqlDriverKind,
} from './systemConnection';
import {
  closeTediousIsolated,
  executeTediousProcedureIsolated,
  queryTediousIsolated,
} from './tediousIsolate';

type PooledSystem = {
  pool: ConnectionPool;
  driverKind: 'native';
  url: string;
};

type IsolatedTediousSystem = {
  driverKind: 'tedious';
  url: string;
};

type SystemEntry = PooledSystem | IsolatedTediousSystem;

const pools = new Map<string, SystemEntry>();

export function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code ?? '';
  return (
    code === 'ELOGIN' ||
    code === 'ETIMEOUT' ||
    code === 'ESOCKET' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    /login failed|timeout|timed out|connect|network|socket|ELOGIN|ENOTFOUND|ECONNREFUSED/i.test(
      message,
    )
  );
}

function connectionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message && error.message !== '[object Object]') {
    return error.message;
  }
  const original = (error as { originalError?: unknown })?.originalError;
  if (original && typeof original === 'object') {
    return JSON.stringify(original);
  }
  return String(error);
}

async function resolveSystemUrl(systemKey: string): Promise<{
  name: string;
  envVarName: string;
  url: string;
  driverKind: MssqlDriverKind;
  summary: string;
}> {
  const system = await prisma.systemConnection.findUnique({
    where: { systemKey },
  });
  if (!system || !system.isActive) {
    throw new NotFoundError(`System connection "${systemKey}" not found or inactive`);
  }

  const url = resolveSystemConnectionUrl(system.envVarName);
  if (!url) {
    throw new ValidationError(
      `Connection URL not configured. Set environment variable ${system.envVarName}`,
    );
  }

  const { driverKind, summary } = buildMssqlConfig(url);
  return { name: system.name, envVarName: system.envVarName, url, driverKind, summary };
}

async function getSystemEntry(systemKey: string): Promise<SystemEntry> {
  const existing = pools.get(systemKey);
  if (existing?.driverKind === 'tedious') {
    return existing;
  }
  if (existing?.driverKind === 'native' && existing.pool.connected) {
    activateMssqlDriver('native');
    return existing;
  }

  if (existing?.driverKind === 'native') {
    pools.delete(systemKey);
    await existing.pool.close().catch(() => undefined);
  }

  const resolved = await resolveSystemUrl(systemKey);

  // Tedious must never load in the main process alongside msnodesqlv8.
  if (resolved.driverKind === 'tedious') {
    const entry: IsolatedTediousSystem = { driverKind: 'tedious', url: resolved.url };
    pools.set(systemKey, entry);
    return entry;
  }

  try {
    const built = buildMssqlConfig(resolved.url);
    if (!built.driver || !built.config) {
      throw new Error('Native driver config missing');
    }
    const nativeDriver = built.driver;
    const nativeConfig = built.config;
    activateMssqlDriver('native');
    const connectPromise = new nativeDriver.ConnectionPool(nativeConfig).connect();
    const pool = await Promise.race([
      connectPromise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Connect ${built.summary} timed out. Check VPN/firewall and SQL host reachability.`,
            ),
          );
        }, (nativeConfig.connectionTimeout ?? 8000) + 1000);
      }),
    ]);
    const entry: PooledSystem = { pool, driverKind: 'native', url: resolved.url };
    pools.set(systemKey, entry);
    return entry;
  } catch (error) {
    pools.delete(systemKey);
    throw new AppError(
      503,
      `Cannot connect to ${resolved.name} (${systemKey}) via ${resolved.envVarName} [${resolved.summary}]: ${connectionErrorMessage(error)}`,
      'CONNECTION_ERROR',
    );
  }
}

/** @deprecated Prefer querySystem / executeSystem — kept for callers that need a native pool. */
export async function getSystemPool(systemKey: string): Promise<ConnectionPool> {
  const entry = await getSystemEntry(systemKey);
  if (entry.driverKind !== 'native') {
    throw new AppError(
      500,
      `System ${systemKey} uses isolated Tedious driver; use querySystem/executeSystem instead of getSystemPool`,
      'DRIVER_ISOLATION',
    );
  }
  return entry.pool;
}

async function dropSystemEntry(systemKey: string): Promise<void> {
  const stale = pools.get(systemKey);
  if (!stale) return;
  pools.delete(systemKey);
  if (stale.driverKind === 'native') {
    await stale.pool.close().catch(() => undefined);
  } else {
    await closeTediousIsolated(systemKey);
  }
}

async function runSystemQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  systemKey: string,
  queryText: string,
  params: Record<string, unknown> = {},
): Promise<{ rows: T[]; rowsAffected: number }> {
  try {
    const entry = await getSystemEntry(systemKey);

    if (entry.driverKind === 'tedious') {
      return queryTediousIsolated<T>(systemKey, entry.url, queryText, params);
    }

    activateMssqlDriver('native');
    const request = entry.pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value as string | number | boolean | Date | null | Buffer);
    }

    const result = await request.query<T>(queryText);
    const affected = Array.isArray(result.rowsAffected)
      ? result.rowsAffected.reduce((sum, n) => sum + (Number(n) || 0), 0)
      : Number(result.rowsAffected ?? 0);
    return { rows: result.recordset ?? [], rowsAffected: affected };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isConnectionError(error)) {
      await dropSystemEntry(systemKey);
      throw new AppError(
        503,
        `Database connection failed for ${systemKey}: ${connectionErrorMessage(error)}`,
        'CONNECTION_ERROR',
      );
    }
    throw error;
  }
}

export async function querySystem<T extends Record<string, unknown> = Record<string, unknown>>(
  systemKey: string,
  queryText: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const { rows } = await runSystemQuery<T>(systemKey, queryText, params);
  return rows;
}

/** Execute a write statement (UPDATE/INSERT/DELETE) against a connected system DB. */
export async function executeSystem(
  systemKey: string,
  queryText: string,
  params: Record<string, unknown> = {},
): Promise<{ rowsAffected: number }> {
  const { rowsAffected } = await runSystemQuery(systemKey, queryText, params);
  return { rowsAffected };
}

/**
 * Execute a stored procedure and return its first result set + integer return value.
 * Prefer this over ad-hoc EXEC + SELECT @rv (ODBC often only exposes one recordset).
 */
export async function executeSystemProcedure<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  systemKey: string,
  procedureName: string,
  params: Record<string, unknown> = {},
): Promise<{
  rows: T[];
  recordsets: T[][];
  returnValue: number | null;
  rowsAffected: number;
}> {
  try {
    const entry = await getSystemEntry(systemKey);

    if (entry.driverKind === 'tedious') {
      return executeTediousProcedureIsolated<T>(systemKey, entry.url, procedureName, params);
    }

    activateMssqlDriver('native');
    const request = entry.pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value as string | number | boolean | Date | null | Buffer);
    }

    const result = await request.execute(procedureName);
    const affected = Array.isArray(result.rowsAffected)
      ? result.rowsAffected.reduce((sum, n) => sum + (Number(n) || 0), 0)
      : Number(result.rowsAffected ?? 0);
    const returnRaw = result.returnValue;
    const returnValue =
      typeof returnRaw === 'number' && Number.isFinite(returnRaw) ? returnRaw : null;
    const recordsets = ((result.recordsets as T[][] | undefined) ?? []).map(
      (set) => set ?? [],
    );

    return {
      rows: (result.recordset ?? recordsets[0] ?? []) as T[],
      recordsets,
      returnValue,
      rowsAffected: affected,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isConnectionError(error)) {
      await dropSystemEntry(systemKey);
      throw new AppError(
        503,
        `Database connection failed for ${systemKey}: ${connectionErrorMessage(error)}`,
        'CONNECTION_ERROR',
      );
    }
    throw error;
  }
}

export function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === 'bigint') {
      out[key] = value.toString();
    } else if (value !== null && typeof value === 'object' && 'toFixed' in (value as object)) {
      out[key] = String(value);
    } else if (Buffer.isBuffer(value)) {
      out[key] = value.toString('hex');
    } else {
      out[key] = value;
    }
  }
  return out;
}
