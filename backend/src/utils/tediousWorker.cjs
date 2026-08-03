'use strict';

/**
 * Runs in a worker_threads isolate so Tedious never shares mssql `base.driver`
 * with msnodesqlv8 in the parent process.
 */
const { parentPort } = require('worker_threads');
const sql = require('mssql/tedious');

/** @type {Map<string, import('mssql').ConnectionPool>} */
const pools = new Map();

const DEFAULT_CONNECTION_TIMEOUT_MS = 8000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

/**
 * @param {string} url
 */
function parseSqlServerUrl(url) {
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

  return {
    server: server || 'localhost',
    port: portRaw ? Number(portRaw) : 1433,
    database: params.database,
    user: params.user,
    password: params.password,
    encrypt: params.encrypt === 'true',
    trustServerCertificate: params.trustservercertificate !== 'false',
  };
}

/**
 * @param {string} url
 */
function buildConfig(url) {
  const parsed = parseSqlServerUrl(url);
  const isAzure = parsed.server.toLowerCase().includes('.database.windows.net');
  return {
    server: parsed.server,
    database: parsed.database,
    user: parsed.user,
    password: parsed.password,
    options: {
      encrypt: isAzure ? true : parsed.encrypt,
      trustServerCertificate: isAzure ? false : parsed.trustServerCertificate,
      connectTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
      enableArithAbort: true,
      ...(isAzure ? {} : { port: parsed.port }),
    },
    ...(isAzure ? {} : { port: parsed.port }),
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
    pool: { max: 1, min: 0, idleTimeoutMillis: 1000 },
  };
}

/**
 * @param {import('mssql').ConnectionPool} pool
 * @param {Record<string, unknown>} params
 */
function bindParams(pool, params) {
  const request = pool.request();
  for (const [key, value] of Object.entries(params || {})) {
    request.input(key, value);
  }
  return request;
}

async function ensurePool(systemKey, url) {
  const existing = pools.get(systemKey);
  if (existing?.connected) return existing;
  if (existing) {
    pools.delete(systemKey);
    await existing.close().catch(() => undefined);
  }
  const pool = await new sql.ConnectionPool(buildConfig(url)).connect();
  pools.set(systemKey, pool);
  return pool;
}

parentPort.on('message', async (msg) => {
  const { id, type } = msg;
  try {
    if (type === 'test') {
      let pool = null;
      try {
        pool = await new sql.ConnectionPool(buildConfig(msg.url)).connect();
        await pool.request().query('SELECT 1 AS ok');
        parentPort.postMessage({ id, ok: true });
      } finally {
        if (pool) await pool.close().catch(() => undefined);
      }
      return;
    }

    if (type === 'query') {
      const pool = await ensurePool(msg.systemKey, msg.url);
      const result = await bindParams(pool, msg.params).query(msg.sql);
      const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum, n) => sum + (Number(n) || 0), 0)
        : Number(result.rowsAffected ?? 0);
      parentPort.postMessage({
        id,
        ok: true,
        rows: result.recordset ?? [],
        rowsAffected: affected,
      });
      return;
    }

    if (type === 'execute') {
      const pool = await ensurePool(msg.systemKey, msg.url);
      const result = await bindParams(pool, msg.params).execute(msg.procedureName);
      const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum, n) => sum + (Number(n) || 0), 0)
        : Number(result.rowsAffected ?? 0);
      const returnRaw = result.returnValue;
      const returnValue =
        typeof returnRaw === 'number' && Number.isFinite(returnRaw) ? returnRaw : null;
      const recordsets = (result.recordsets ?? []).map((set) => set ?? []);
      parentPort.postMessage({
        id,
        ok: true,
        rows: result.recordset ?? recordsets[0] ?? [],
        recordsets,
        returnValue,
        rowsAffected: affected,
      });
      return;
    }

    if (type === 'close') {
      const existing = pools.get(msg.systemKey);
      if (existing) {
        pools.delete(msg.systemKey);
        await existing.close().catch(() => undefined);
      }
      parentPort.postMessage({ id, ok: true });
      return;
    }

    parentPort.postMessage({ id, ok: false, error: `Unknown message type: ${type}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort.postMessage({ id, ok: false, error: message });
  }
});
