import sql from 'mssql';

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
 * Lazily load msnodesqlv8 only for Windows/local auth.
 * Importing it at module top-level pollutes `mssql` Request and breaks Azure/Tedious
 * with: "connection.queryRaw is not a function".
 */
function loadNativeDriver(): MssqlDriver {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('mssql/msnodesqlv8') as MssqlDriver;
}

export function buildMssqlConfig(url: string): {
  driver: MssqlDriver;
  config: sql.config;
  summary: string;
} {
  const parsed = parseSqlServerUrl(url);
  const summary = `${parsed.server}:${parsed.port}/${parsed.database ?? '?'}${parsed.integrated ? ' (Windows auth)' : ` (user=${parsed.user ?? '?'})`}`;
  const server = parsed.port ? `${parsed.server},${parsed.port}` : parsed.server;
  const trust = parsed.trustServerCertificate ? 'yes' : 'no';
  const encrypt = parsed.encrypt ? 'yes' : 'no';
  const isAzure = parsed.server.toLowerCase().includes('.database.windows.net');

  // Prefer Tedious for Azure SQL. Keep ODBC for local Windows auth / on-prem SQL auth on win32.
  const useNative =
    parsed.integrated ||
    (process.platform === 'win32' && Boolean(parsed.user && parsed.password) && !isAzure);

  if (useNative) {
    const sqlNative = loadNativeDriver();
    const connectionString = parsed.integrated
      ? [
          'Driver={ODBC Driver 18 for SQL Server}',
          `Server=${server}`,
          `Database=${parsed.database ?? ''}`,
          'Trusted_Connection=yes',
          `TrustServerCertificate=${trust}`,
          `Encrypt=${encrypt}`,
          `Connection Timeout=${Math.ceil(DEFAULT_CONNECTION_TIMEOUT_MS / 1000)}`,
        ].join(';')
      : [
          'Driver={ODBC Driver 18 for SQL Server}',
          `Server=${server}`,
          `Database=${parsed.database ?? ''}`,
          `UID=${parsed.user}`,
          `PWD=${parsed.password}`,
          `TrustServerCertificate=${trust}`,
          `Encrypt=${encrypt}`,
          `Connection Timeout=${Math.ceil(DEFAULT_CONNECTION_TIMEOUT_MS / 1000)}`,
        ].join(';');

    return {
      driver: sqlNative,
      summary,
      config: {
        server: parsed.server,
        connectionString,
        connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
        requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
      } as unknown as sql.config,
    };
  }

  // Azure SQL: encrypt required; validate Azure cert (trustServerCertificate=false).
  return {
    driver: sql,
    summary,
    config: {
      server: parsed.server,
      database: parsed.database,
      user: parsed.user,
      password: parsed.password,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
        enableArithAbort: true,
        ...(isAzure ? {} : { port: parsed.port }),
      },
      ...(isAzure ? {} : { port: parsed.port }),
      connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
      requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
      pool: { max: 1, min: 0, idleTimeoutMillis: 1000 },
    },
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
  let pool: sql.ConnectionPool | null = null;
  const { driver, config, summary } = buildMssqlConfig(url);

  try {
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
