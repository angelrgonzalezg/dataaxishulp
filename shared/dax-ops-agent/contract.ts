export const DAX_OPS_CONTRACT = 'dax-ops/1.0';
export const DAX_OPS_MODULE = 'dax-ops-agent';
export const DAX_OPS_TOKEN_HEADER = 'x-dax-ops-token';

export type DaxOpsStatus = 'online' | 'degraded' | 'offline';

export interface DaxOpsResource {
  total_bytes: number | null;
  used_bytes: number | null;
  free_bytes: number | null;
  used_percent: number | null;
}

export interface DaxOpsDependency {
  key: string;
  kind: 'database' | 'storage' | 'http' | 'other';
  online: boolean;
  latency_ms: number | null;
  error: string | null;
  detail?: Record<string, unknown>;
}

export interface DaxOpsSessionUser {
  name: string;
  last_seen_at: string;
}

export interface DaxOpsSessions {
  active_count: number;
  window_seconds: number;
  users: DaxOpsSessionUser[];
}

export interface DaxOpsHealthReport {
  contract: typeof DAX_OPS_CONTRACT;
  module: typeof DAX_OPS_MODULE;
  owner_app: string;
  checked_at: string;
  status: DaxOpsStatus;
  app: {
    name: string;
    version: string;
    git_sha: string | null;
    git_ref: string | null;
    node_version: string;
    uptime_seconds: number;
  };
  runtime: {
    platform: 'vercel' | 'node';
    hostname: string;
    os: string;
    arch: string;
    region: string | null;
    vercel: {
      env: string | null;
      url: string | null;
      region: string | null;
      deployment_id: string | null;
      git_repo: string | null;
    } | null;
  };
  resources: {
    memory: DaxOpsResource & {
      rss_bytes: number;
      heap_used_bytes: number;
      heap_total_bytes: number;
    };
    cpu_usage_percent: number | null;
    disk: (DaxOpsResource & { path: string }) | null;
  };
  dependencies: DaxOpsDependency[];
  sessions?: DaxOpsSessions;
}
