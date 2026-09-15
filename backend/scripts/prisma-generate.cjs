/**
 * prisma generate with one retry after freeing the Windows query-engine DLL.
 * The running API (tsx watch on PORT, default 3021) locks
 * src/generated/client/query_engine-windows.dll.node.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');

function readPort() {
  try {
    const envText = fs.readFileSync(path.join(backendRoot, '.env'), 'utf8');
    const match = envText.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (match) return Number(match[1]);
  } catch {
    // no .env
  }
  return Number(process.env.PORT) || 3021;
}

function prismaGenerate() {
  return spawnSync('npx', ['prisma', 'generate'], {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: true,
  });
}

function stopListeners(port) {
  const ps = [
    `$conns = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    'foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }',
  ].join('; ');
  spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    stdio: 'inherit',
    windowsHide: true,
  });
}

let result = prismaGenerate();
if (result.status === 0) {
  process.exit(0);
}

const port = readPort();
console.warn(
  `\nprisma generate failed (often EPERM while the API is running). Stopping listeners on :${port} and retrying...\n`,
);
stopListeners(port);
spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 2'], {
  windowsHide: true,
});

result = prismaGenerate();
process.exit(result.status ?? 1);
