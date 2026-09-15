import {
  DAX_OPS_TOKEN_HEADER,
  isDaxOpsHealthReport,
  type DaxOpsHealthReport,
} from './daxOpsContract';

export interface AgentProbeResult {
  ok: boolean;
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number | null;
  httpStatus: number | null;
  error: string | null;
  report: DaxOpsHealthReport | null;
}

export async function callDaxOpsAgent(input: {
  baseUrl: string;
  healthPath: string;
  token: string | null;
  timeoutMs: number;
}): Promise<AgentProbeResult> {
  const url = `${input.baseUrl.replace(/\/$/, '')}${input.healthPath.startsWith('/') ? input.healthPath : `/${input.healthPath}`}`;
  const startedAt = Date.now();

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (input.token) headers[DAX_OPS_TOKEN_HEADER] = input.token;

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const message =
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `HTTP ${response.status}`;
      return {
        ok: false,
        status: 'offline',
        latencyMs,
        httpStatus: response.status,
        error: message.slice(0, 500),
        report: isDaxOpsHealthReport(body) ? body : null,
      };
    }

    if (!isDaxOpsHealthReport(body)) {
      return {
        ok: false,
        status: 'degraded',
        latencyMs,
        httpStatus: response.status,
        error: 'Response is not a dax-ops-agent health report',
        report: null,
      };
    }

    return {
      ok: body.status !== 'offline',
      status: body.status,
      latencyMs,
      httpStatus: response.status,
      error: null,
      report: body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'offline',
      latencyMs: null,
      httpStatus: null,
      error: error instanceof Error ? error.message.slice(0, 500) : 'Agent unreachable',
      report: null,
    };
  }
}
