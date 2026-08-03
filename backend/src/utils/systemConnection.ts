import sql from 'mssql';
import { testTediousConnectionIsolated } from './tediousIsolate';

const DEFAULT_CONNECTION_TIMEOUT_MS = 8000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
/** Hard ceiling so UI/API never hang when the driver ignores its own timeout. */
const HARD_CONNECT_TIMEOUT_MS = 12000;

export interface ParsedSqlServerUrl {
  server: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  integrated: boolean;
}

type MssqlDriver = typeof sql;
export type MssqlDriverKind = 'tedious' | 'native';

/**
 * Parses Prisma/SQL Server URL style:
 * sqlserver://host:port;database=X;user=Y;password=Z;encrypt=false;trustServerCertificate=true
 * or integratedSecurity=true
 */
export function parseSqlServerUrl(url: string): ParsedSqlServerUrl {
  // Strip accidental wrapping quotes and trailing comments after an unquoted #
  const cleaned = url.trim().replace(/^['"]|['"]$/g, '');
  const withoutProtocol = cleaned.replace(/^sqlserver:\/\//i, '');
  const [hostPort, ...rest] = withoutProtocol.split(';');
  const [server, portRaw] = hostPort.split(':');
  const params = Object.fromEntries(
    rest
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part.toLowerCase(), 'true'];
        return [part.slice(0, idx).toLowerCase(), part.slice(idx + 1)];
      }),
  );

  const integrated =
    params.integratedsecurity === 'true' || params.trusted_connection === 'true';

  return {
    server: server || 'localhost',
    port: portRaw ? Number(portRaw) : 1433,
    database: params.database,
    user: params.user,
    // Passwords may contain #, =, etc. Keep full value after first '='.
    password: params.password,
    encrypt: params.encrypt === 'true',
    trustServerCertificate: params.trustservercertificate !== 'false',
    integrated,
  };
}

/**
 * msnodesqlv8 and Tedious share mssql's `base.driver`. Loading Tedious in the same
 * process as Windows-auth (native) causes "connection.queryRaw is not a function".
 * Only activate the native driver in-process; Tedious runs in a worker isolate.
 */
export function activateMssqlDriver(kind: MssqlDriverKind): MssqlDriver {
  if (kind !== 'native') {
    throw new Error(
      'Tedious must not be activated in the main process; use tediousIsolate worker instead',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('mssql/msnodesqlv8') as MssqlDriver;
}

export function connectionNeedsTediousIsolate(url: string): boolean {
  const parsed = parseSqlServerUrl(url);
  return !(parsed.integrated && process.platform === 'win32');
}

export function buildMssqlConfig(url: string): {
  driver: MssqlDriver | null;
  driverKind: MssqlDriverKind;
  config: sql.config | null;
  summary: string;
} {
  const parsed = parseSqlServerUrl(url);
  const summary = `${parsed.server}:${parsed.port}/${parsed.database ?? '?'}${parsed.integrated ? ' (Windows auth)' : ` (user=${parsed.user ?? '?'})`}`;
  const server = parsed.port ? `${parsed.server},${parsed.port}` : parsed.server;
  const trust = parsed.trustServerCertificate ? 'yes' : 'no';
  const encrypt = parsed.encrypt ? 'yes' : 'no';

  // msnodesqlv8 only for Windows integrated auth. SQL auth (local + Azure) uses Tedious isolate.
  const useNative = parsed.integrated && process.platform === 'win32';

  if (useNative) {
    const sqlNative = activateMssqlDriver('native');
    const connectionString = [
      'Driver={ODBC Driver 18 for SQL Server}',
      `Server=${server}`,
      `Database=${parsed.database ?? ''}`,
      'Trusted_Connection=yes',
      `TrustServerCertificate=${trust}`,
      `Encrypt=${encrypt}`,
      `Connection Timeout=${Math.ceil(DEFAULT_CONNECTION_TIMEOUT_MS / 1000)}`,
    ].join(';');

    return {
      driver: sqlNative,
      driverKind: 'native',
      summary,
      config: {
        server: parsed.server,
        connectionString,
        connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
        requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
      } as unknown as sql.config,
    };
  }

  return {
    driver: null,
    driverKind: 'tedious',
    summary,
    config: null,
  };
}

function formatConnectionError(error: unknown): string {
  if (error instanceof Error) {
    const original = (error as Error & { originalError?: unknown }).originalError;
    if (original instanceof Error && original.message && original.message !== '[object Object]') {
      return original.message;
    }
    if (original && typeof original === 'object') {
      const nested = original as {
        message?: unknown;
        code?: unknown;
        info?: { message?: unknown };
      };
      const fromInfo = nested.info?.message != null ? String(nested.info.message) : '';
      if (fromInfo && fromInfo !== '[object Object]') return fromInfo;
      const nestedMsg = nested.message != null ? String(nested.message) : '';
      if (nestedMsg && nestedMsg !== '[object Object]') return nestedMsg;
      if (nested.code != null) return `ConnectionError code=${String(nested.code)}`;
    }
    if (error.message && error.message !== '[object Object]') return error.message;
  }
  if (typeof error === 'string') return error;
  try {
    const text = JSON.stringify(error);
    if (text && text !== '{}' && text !== '{"name":"ConnectionError"}') return text;
  } catch {
    // ignore
  }
  return 'Connection failed (no details from driver). Check user/password, VPN, and Azure firewall.';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `${label} timed out after ${ms}ms. Check VPN/firewall and that the SQL host is reachable.`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function closePoolQuietly(pool: sql.ConnectionPool | null): Promise<void> {
  if (!pool) return;
  try {
    await withTimeout(pool.close(), 2000, 'Close pool');
  } catch {
    // Ignore close failures / hangs after a timed-out connect.
  }
}

export async function testSqlServerConnection(url: string): Promise<{ ok: boolean; error?: string }> {
  const { driver, config, summary, driverKind } = buildMssqlConfig(url);

  // SQL auth / Azure: Tedious in a worker so it never corrupts msnodesqlv8 in this process.
  if (driverKind === 'tedious') {
    const isolated = await withTimeout(
      testTediousConnectionIsolated(url),
      HARD_CONNECT_TIMEOUT_MS + DEFAULT_REQUEST_TIMEOUT_MS,
      `Connect ${summary}`,
    ).catch((error: unknown) => ({
      ok: false as const,
      error: formatConnectionError(error),
    }));
    if (isolated.ok) return { ok: true };
    return { ok: false, error: `${summary}: ${isolated.error ?? 'Connection failed'}` };
  }

  let pool: sql.ConnectionPool | null = null;
  try {
    if (!driver || !config) {
      return { ok: false, error: `${summary}: Native driver config missing` };
    }
    pool = new driver.ConnectionPool(config);
    await withTimeout(pool.connect(), HARD_CONNECT_TIMEOUT_MS, `Connect ${summary}`);
    await withTimeout(
      pool.request().query('SELECT 1 AS ok'),
      DEFAULT_REQUEST_TIMEOUT_MS,
      `Query ${summary}`,
    );
    return { ok: true };
  } catch (error) {
    const message = formatConnectionError(error);
    return { ok: false, error: `${summary}: ${message}` };
  } finally {
    await closePoolQuietly(pool);
  }
}

export function resolveSystemConnectionUrl(envVarName: string): string | null {
  const value = process.env[envVarName];
  return value && value.trim() ? value.trim() : null;
}
