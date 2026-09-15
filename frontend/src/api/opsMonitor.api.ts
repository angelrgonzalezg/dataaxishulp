import { api } from './client';
import type { OpsOverview, OpsTarget } from '@/types';

export async function fetchOpsOverview() {
  const { data } = await api.get('/ops-monitor');
  return data.data as OpsOverview;
}

export async function probeOpsTargets() {
  const { data } = await api.post('/ops-monitor/probe', {}, { timeout: 60000 });
  return data.data as OpsTarget[];
}

export async function heartbeatOpsPresence() {
  await api.post('/ops-monitor/presence', {});
}

export async function sendOpsWhatsAppTest() {
  const { data } = await api.post('/ops-monitor/alerts/test', {}, { timeout: 20000 });
  return data.data as { sent: boolean; to: string[] };
}

export async function updateOpsInterval(checkIntervalSec: number) {
  const { data } = await api.patch('/ops-monitor/interval', {
    check_interval_sec: checkIntervalSec,
  });
  return data.data as OpsOverview;
}