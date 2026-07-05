import sql from 'mssql';
import sqlNative from 'mssql/msnodesqlv8';

const DEFAULT_CONNECTION_TIMEOUT_MS = 8000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

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

export function buildMssqlConfig(url: string): {
  driver: typeof sql | typeof sqlNative;
  config: sql.config;
  summary: string;
} {
  const parsed = parseSqlServerUrl(url);
  const summary = `${parsed.server}:${parsed.port}/${parsed.database ?? '?'}${parsed.integrated ? ' (Windows auth)' : ` (user=${parsed.user ?? '?'})`}`;

  if (parsed.integrated) {
    const server = parsed.port ? `${parsed.server},${parsed.port}` : parsed.server;
    const trust = parsed.trustServerCertificate ? 'yes' : 'no';
    const encrypt = parsed.encrypt ? 'yes' : 'no';
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
      summary,
      config: {
        connectionString,
        connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
        requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
      } as sql.config,
    };
  }

  return {
    driver: sql,
    summary,
    config: {
      server: parsed.server,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
      password: parsed.password,
      options: {
        encrypt: parsed.encrypt,
        trustServerCertificate: parsed.trustServerCertificate,
        connectTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
      },
      connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
      requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
    },
  };
}

function formatConnectionError(error: unknown): string {
  if (error instanceof Error) {
    const original = (error as Error & { originalError?: unknown }).originalError;
    if (original instanceof Error && original.message && original.message !== '[object Object]') {
      return original.message;
    }
    if (original && typeof original === 'object' && 'message' in original) {
      const nested = String((original as { message?: unknown }).message ?? '');
      if (nested && nested !== '[object Object]') return nested;
    }
    if (error.message && error.message !== '[object Object]') return error.message;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Connection failed';
  }
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

export async function testSqlServerConnection(url: string): Promise<{ ok: boolean; error?: string }> {
  let pool: sql.ConnectionPool | null = null;
  const { driver, config, summary } = buildMssqlConfig(url);

  try {
    pool = await withTimeout(
      new driver.ConnectionPool(config).connect(),
      DEFAULT_CONNECTION_TIMEOUT_MS + 1000,
      `Connect ${summary}`,
    );
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
    if (pool) {
      await pool.close().catch(() => undefined);
    }
  }
}

export function resolveSystemConnectionUrl(envVarName: string): string | null {
  const value = process.env[envVarName];
  return value && value.trim() ? value.trim() : null;
}
