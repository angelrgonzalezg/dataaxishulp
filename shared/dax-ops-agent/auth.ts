import { DAX_OPS_TOKEN_HEADER } from './contract';

export function readDaxOpsToken(request: Request): string | null {
  const headerToken = request.headers.get(DAX_OPS_TOKEN_HEADER);
  if (headerToken?.trim()) return headerToken.trim();

  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return null;
}

export function authorizeDaxOps(request: Request, expectedToken = process.env.DAX_OPS_AGENT_TOKEN): {
  ok: true;
} | {
  ok: false;
  status: number;
  error: string;
} {
  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      error: 'DAX_OPS_AGENT_TOKEN is not configured on this application',
    };
  }

  const provided = readDaxOpsToken(request);
  if (!provided || provided !== expectedToken) {
    return { ok: false, status: 401, error: 'Invalid or missing DAX-OPS token' };
  }

  return { ok: true };
}
