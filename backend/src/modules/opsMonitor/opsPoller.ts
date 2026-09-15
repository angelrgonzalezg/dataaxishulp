import { probeTargets } from './opsMonitor.service';

let timer: NodeJS.Timeout | null = null;
let probing = false;

function tickMs(): number {
  const parsed = Number(process.env.OPS_POLL_TICK_MS ?? 15000);
  return Number.isFinite(parsed) && parsed >= 5000 ? parsed : 15000;
}

async function runTick(force = false): Promise<void> {
  if (probing) return;
  probing = true;
  try {
    await probeTargets({ force });
  } catch (error) {
    console.warn('[daxhulp-poller] tick failed', error);
  } finally {
    probing = false;
  }
}

export function startOpsPoller(): void {
  if (timer) return;
  const interval = tickMs();
  console.log(`[daxhulp-poller] starting (tick ${interval}ms)`);
  void runTick(true);
  timer = setInterval(() => {
    void runTick(false);
  }, interval);
  timer.unref?.();
}

export function stopOpsPoller(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
