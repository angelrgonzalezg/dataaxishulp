import { useEffect } from 'react';
import { heartbeatOpsPresence } from '@/api/opsMonitor.api';
import { useAuthStore } from '@/store/authStore';

const INTERVAL_MS = 30_000;

export function useOpsPresenceHeartbeat() {
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    const ping = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      void heartbeatOpsPresence().catch(() => undefined);
    };

    ping();
    const timer = window.setInterval(ping, INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [accessToken]);
}
