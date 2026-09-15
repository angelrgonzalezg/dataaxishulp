import { prisma } from '../../config/db';

export const PRESENCE_WINDOW_MS = 3 * 60 * 1000;

export interface ConnectedUser {
  name: string;
  last_seen_at: Date;
}

export async function heartbeatPresence(input: {
  userId: number;
  username: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { userId: input.userId },
    select: { fullName: true, username: true },
  });
  const displayName = (user?.fullName || user?.username || input.username).slice(0, 150);
  const userKey = String(input.userId);

  await prisma.opsPresence.upsert({
    where: {
      productFamily_userKey: {
        productFamily: 'dataaxishulp',
        userKey,
      },
    },
    update: { displayName, lastSeenAt: new Date() },
    create: {
      productFamily: 'dataaxishulp',
      userKey,
      displayName,
      lastSeenAt: new Date(),
    },
  });
}

export async function listActivePresences(productFamily = 'dataaxishulp'): Promise<ConnectedUser[]> {
  const since = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const rows = await prisma.opsPresence.findMany({
    where: { productFamily, lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: 'desc' },
  });
  return rows.map((row) => ({
    name: row.displayName,
    last_seen_at: row.lastSeenAt,
  }));
}
