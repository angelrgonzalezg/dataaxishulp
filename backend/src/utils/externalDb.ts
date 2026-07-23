import type { ConnectionPool } from 'mssql';
import { prisma } from '../config/db';
import { AppError, NotFoundError, ValidationError } from './AppError';
import { buildMssqlConfig, resolveSystemConnectionUrl } from './systemConnection';

const pools = new Map<string, ConnectionPool>();

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

export async function getSystemPool(systemKey: string): Promise<ConnectionPool> {
  const existing = pools.get(systemKey);
  if (existing?.connected) {
    return existing;
  }

  // Drop stale/disconnected pools so we always retry cleanly.
  if (existing) {
    pools.delete(systemKey);
    await existing.close().catch(() => undefined);
  }

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

  const { driver, config, summary } = buildMssqlConfig(url);
  try {
    const connectPromise = new driver.ConnectionPool(config).connect();
    const pool = await Promise.race([
      connectPromise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Connect ${summary} timed out. Check VPN/firewall and SQL host reachability.`,
            ),
          );
        }, (config.connectionTimeout ?? 8000) + 1000);
      }),
    ]);
    pools.set(systemKey, pool);
    return pool;
  } catch (error) {
    pools.delete(systemKey);
    throw new AppError(
      503,
      `Cannot connect to ${system.name} (${systemKey}) via ${system.envVarName} [${summary}]: ${connectionErrorMessage(error)}`,
      'CONNECTION_ERROR',
    );
  }
}

async function runSystemQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  systemKey: string,
  queryText: string,
  params: Record<string, unknown> = {},
): Promise<{ rows: T[]; rowsAffected: number }> {
  try {
    const pool = await getSystemPool(systemKey);
    const request = pool.request();

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
      // Force reconnect on next attempt.
      const stale = pools.get(systemKey);
      if (stale) {
        pools.delete(systemKey);
        await stale.close().catch(() => undefined);
      }
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
