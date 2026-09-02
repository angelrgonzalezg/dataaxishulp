/** Open items with no update for this many days are treated as "limbo". */
export const STALE_ISSUE_DAYS = 14;

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

export function countStaleItems(
  items: Array<{ updated_at?: string | null }>,
  now = new Date(),
): number {
  return items.filter((item) => isStaleIssue(item.updated_at, now)).length;
}
