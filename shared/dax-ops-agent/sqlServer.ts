import type { DaxOpsDependency } from './contract';

export interface SqlLikeClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function firstRow<T extends Record<string, unknown>>(rows: unknown): T | null {
  if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object') {
    return rows[0] as T;
  }
  return null;
}

export async function probeSqlServer(db: SqlLikeClient, key = 'sqlserver'): Promise<DaxOpsDependency> {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1 AS ok`;
    const latencyMs = Date.now() - startedAt;

    const meta = firstRow<{
      database_name?: string;
      product_version?: string;
      edition?: string;
    }>(
      await db.$queryRaw`
        SELECT
          DB_NAME() AS database_name,
          CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) AS product_version,
          CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition
      `,
    );

    const size = firstRow<{ total_bytes?: unknown; used_bytes?: unknown }>(
      await db.$queryRaw`
        SELECT
          SUM(CAST(size AS bigint) * 8 * 1024) AS total_bytes,
          SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS bigint) * 8 * 1024) AS used_bytes
        FROM sys.database_files
      `,
    );

    const totalBytes = asNumber(size?.total_bytes);
    const usedBytes = asNumber(size?.used_bytes);

    return {
      key,
      kind: 'database',
      online: true,
      latency_ms: latencyMs,
      error: null,
      detail: {
        database_name: meta?.database_name ?? null,
        product_version: meta?.product_version ?? null,
        edition: meta?.edition ?? null,
        total_bytes: totalBytes,
        used_bytes: usedBytes,
        used_percent:
          totalBytes && usedBytes != null
            ? Number(((usedBytes / totalBytes) * 100).toFixed(1))
            : null,
      },
    };
  } catch (error) {
    return {
      key,
      kind: 'database',
      online: false,
      latency_ms: null,
      error: error instanceof Error ? error.message.slice(0, 200) : 'Database unreachable',
    };
  }
}
