import type { DaxOpsHealthReport } from './daxOpsContract';

export type OpsStatus = 'online' | 'degraded' | 'offline' | 'unknown' | 'pending';
export type OpsProbeMode = 'dax_ops_agent' | 'sql_direct' | 'local_host' | 'pending_agent';

export interface OpsTargetView {
  target_id: number;
  target_key: string;
  display_name: string;
  product_family: string;
  component_kind: string;
  environment: string;
  owner_app: string;
  origin: string;
  probe_mode: OpsProbeMode;
  health_path: string;
  resolved_base_url: string | null;
  has_auth_token: boolean;
  vercel_project_id: string | null;
  region: string | null;
  requires_vpn: boolean;
  check_interval_sec: number;
  timeout_ms: number;
  is_active: boolean;
  agent_installed: boolean;
  alert_on_offline: boolean;
  alert_on_degraded: boolean;
  notes: string | null;
  last_status: OpsStatus | null;
  last_checked_at: Date | null;
  last_error: string | null;
  last_latency_ms: number | null;
  last_app_version: string | null;
  last_git_sha: string | null;
  last_node_version: string | null;
  last_hostname: string | null;
  last_region: string | null;
  last_cpu_percent: number | null;
  last_mem_used_pct: number | null;
  last_disk_used_pct: number | null;
  last_report: DaxOpsHealthReport | null;
  connected_users: {
    count: number;
    names: string[];
  } | null;
  created_at: Date;
  updated_at: Date;
}

export interface OpsHealthLogView {
  log_id: number;
  target_id: number;
  checked_at: Date;
  status: OpsStatus;
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  app_version: string | null;
  git_sha: string | null;
  region: string | null;
  mem_used_percent: number | null;
  disk_used_percent: number | null;
  db_online: boolean | null;
  db_latency_ms: number | null;
  vercel_env: string | null;
  source_module: string;
  alert_triggered: boolean;
}

export interface OpsAlertView {
  event_id: number;
  target_id: number;
  target_name: string;
  triggered_at: Date;
  severity: string;
  kind: string;
  message: string;
  from_status: string | null;
  to_status: string | null;
  notification_status: string;
  channel: string | null;
}

export interface OpsOverview {
  generated_at: string;
  control_plane: 'daxhulp';
  agent_module: 'dax-ops-agent';
  probe_interval_sec: number;
  targets: OpsTargetView[];
  recent_alerts: OpsAlertView[];
  control_plane_users: Array<{ name: string; last_seen_at: Date }>;
  whatsapp: {
    configured: boolean;
    provider: string;
    to: string[];
    missing: string[];
    last_error: string | null;
    last_sent_at: Date | null;
  };
  counts: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
    pending: number;
  };
}
