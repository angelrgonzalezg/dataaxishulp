/** Keep in sync with backend/src/utils/staleIssue.ts */
export const STALE_ISSUE_DAYS = 14;

export const LIMBO_EXCLUDED_STATUSES = [
  'done',
  'klaar',
  'move',
  'cancelled',
  'canceled',
] as const;

export function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function isExcludedFromLimbo(
  status: string | null | undefined,
  extraDoneStatus?: string | null,
): boolean {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  if ((LIMBO_EXCLUDED_STATUSES as readonly string[]).includes(normalized)) return true;
  const extra = normalizeStatus(extraDoneStatus);
  return Boolean(extra) && normalized === extra;
}

export function daysSinceUpdate(updatedAt: Date | string | null | undefined, now = new Date()): number | null {
  if (!updatedAt) return null;
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  const ms = now.getTime() - date.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function isStaleIssue(updatedAt: Date | string | null | undefined, now = new Date()): boolean {
  const days = daysSinceUpdate(updatedAt, now);
  return days != null && days >= STALE_ISSUE_DAYS;
}

/** Stale by age and not in a terminal status (Done / Klaar / Move / Cancelled…). */
export function isLimboIssue(
  updatedAt: Date | string | null | undefined,
  status?: string | null,
  options?: { doneStatus?: string | null; now?: Date },
): boolean {
  if (isExcludedFromLimbo(status, options?.doneStatus)) return false;
  return isStaleIssue(updatedAt, options?.now);
}
