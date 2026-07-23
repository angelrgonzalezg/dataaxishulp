import 'dotenv/config';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { parseSqlServerUrl, testSqlServerConnection } from '../utils/systemConnection';

const scriptDir = __dirname;
const singleTestScript = path.join(scriptDir, 'testSingleConnection.ts');

const targets = [
  { label: 'App database (DataAxisHulp)', envVar: 'DATABASE_URL' },
  { label: 'Kadaster Statia (Local)', envVar: 'SYSTEM_DB_KADASTER_STATIA_URL' },
  { label: 'Kadaster Saba (Local)', envVar: 'SYSTEM_DB_KADASTER_SABA_URL' },
  { label: 'Kadaster Bonaire (Local)', envVar: 'SYSTEM_DB_KADASTER_BONAIRE_URL' },
  { label: 'DLV Aruba (Local)', envVar: 'SYSTEM_DB_DLV_ARUBA_URL' },
  { label: 'Kadaster Statia (PROD)', envVar: 'SYSTEM_DB_KADASTER_STATIA_PROD_URL' },
  { label: 'Kadaster Saba (PROD)', envVar: 'SYSTEM_DB_KADASTER_SABA_PROD_URL' },
  { label: 'Kadaster Bonaire (PROD)', envVar: 'SYSTEM_DB_KADASTER_BONAIRE_PROD_URL' },
  { label: 'DLV Aruba (PROD)', envVar: 'SYSTEM_DB_DLV_ARUBA_PROD_URL' },
];

function testTcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (reachable: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(reachable);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function testConnectionIsolated(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string; elapsed: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', singleTestScript, url], {
      cwd: path.resolve(scriptDir, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        ok: false,
        error: `SQL login timed out after ${timeoutMs}ms. Check credentials, VPN, or SQL permissions.`,
        elapsed: Date.now() - started,
      });
    }, timeoutMs);

    child.on('exit', () => {
      clearTimeout(timer);
      const elapsed = Date.now() - started;
      try {
        const parsed = JSON.parse(stdout.trim()) as { ok: boolean; error?: string };
        resolve({ ok: parsed.ok, error: parsed.error, elapsed });
      } catch {
        resolve({
          ok: false,
          error: 'Connection test process failed',
          elapsed,
        });
      }
    });
  });
}

async function runSqlTest(
  url: string,
  isRemote: boolean,
): Promise<{ ok: boolean; error?: string; elapsed: number }> {
  if (isRemote) {
    return testConnectionIsolated(url, 12000);
  }

  const started = Date.now();
  const result = await testSqlServerConnection(url);
  return { ...result, elapsed: Date.now() - started };
}

async function main(): Promise<void> {
  console.log('Testing configured database connections...\n');

  for (const target of targets) {
    const url = process.env[target.envVar]?.trim();
    if (!url) {
      console.log(`[SKIP] ${target.label} — ${target.envVar} not set`);
      continue;
    }

    const parsed = parseSqlServerUrl(url);
    const isRemote = parsed.server !== 'localhost' && parsed.server !== '127.0.0.1';

    if (isRemote) {
      process.stdout.write(`[TCP ] ${target.label} (${parsed.server}:${parsed.port})... `);
      const reachable = await testTcpReachable(parsed.server, parsed.port, 5000);
      if (!reachable) {
        console.log('UNREACHABLE');
        console.log('       Host/port not reachable. Check VPN or firewall.\n');
        continue;
      }
      console.log('OK');
    }

    process.stdout.write(`[TEST] ${target.label}... `);
    const result = await runSqlTest(url, isRemote);

    if (result.ok) {
      console.log(`OK (${result.elapsed}ms)\n`);
    } else {
      console.log(`FAIL (${result.elapsed}ms)`);
      console.log(`       ${result.error ?? 'Unknown error'}\n`);
    }
  }
}

main().catch((error) => {
  console.error('Connection test failed:', error);
  process.exitCode = 1;
});
