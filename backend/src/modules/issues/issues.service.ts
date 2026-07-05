import { prisma } from '../../config/db';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import type { IssuePriority, IssueStatus } from '../../types/database.types';
import type {
  IssueCreateInput,
  IssueDetailResponse,
  IssueHistoryResponse,
  IssueListQuery,
  IssueListResult,
  IssueResolveInput,
  IssueResponse,
  IssueUpdateInput,
  IssueUserSummary,
} from './issues.types';

const issueInclude = {
  system: true,
  createdBy: true,
  assignedTo: true,
  resolvedBy: true,
} as const;

function mapUserSummary(user: {
  userId: number;
  username: string;
  fullName: string | null;
} | null): IssueUserSummary | null {
  if (!user) return null;
  return {
    user_id: user.userId,
    username: user.username,
    full_name: user.fullName,
  };
}

function mapIssue(row: {
  issueId: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  externalRef: string | null;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  system: { systemId: number; systemKey: string; name: string };
  createdBy: { userId: number; username: string; fullName: string | null };
  assignedTo: { userId: number; username: string; fullName: string | null } | null;
  resolvedBy: { userId: number; username: string; fullName: string | null } | null;
}): IssueResponse {
  return {
    issue_id: row.issueId,
    title: row.title,
    description: row.description,
    status: row.status as IssueStatus,
    priority: row.priority as IssuePriority,
    category: row.category,
    external_ref: row.externalRef,
    resolution_notes: row.resolutionNotes,
    system: {
      system_id: row.system.systemId,
      system_key: row.system.systemKey,
      name: row.system.name,
    },
    created_by: mapUserSummary(row.createdBy)!,
    assigned_to: mapUserSummary(row.assignedTo),
    resolved_by: mapUserSummary(row.resolvedBy),
    resolved_at: row.resolvedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function normalizePagination(page = 1, limit = 20) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

async function addHistory(input: {
  issueId: number;
  action: string;
  actorId: number;
  fromStatus?: string | null;
  toStatus?: string | null;
  comment?: string | null;
}) {
  await prisma.issueHistory.create({
    data: {
      issueId: input.issueId,
      action: input.action,
      actorId: input.actorId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      comment: input.comment ?? null,
    },
  });
}

export async function listIssues(query: IssueListQuery): Promise<IssueListResult> {
  const { page, limit, skip } = normalizePagination(query.page, query.limit);
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.system_id ? { systemId: query.system_id } : {}),
    ...(query.assigned_to_id ? { assignedToId: query.assigned_to_id } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search } },
            { description: { contains: query.search } },
            { externalRef: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: issueInclude,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.issue.count({ where }),
  ]);

  return {
    issues: rows.map(mapIssue),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getIssueById(issueId: number): Promise<IssueDetailResponse> {
  const row = await prisma.issue.findUnique({
    where: { issueId },
    include: {
      ...issueInclude,
      history: {
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!row) throw new NotFoundError('Issue not found');

  const history: IssueHistoryResponse[] = row.history.map((entry) => ({
    history_id: entry.historyId,
    action: entry.action,
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    comment: entry.comment,
    actor: mapUserSummary(entry.actor)!,
    created_at: entry.createdAt,
  }));

  return { ...mapIssue(row), history };
}

export async function createIssue(
  input: IssueCreateInput,
  actorId: number,
): Promise<IssueDetailResponse> {
  const system = await prisma.systemConnection.findUnique({
    where: { systemId: input.system_id },
  });
  if (!system || !system.isActive) {
    throw new ValidationError('System connection not found or inactive');
  }

  const row = await prisma.issue.create({
    data: {
      title: input.title,
      description: input.description,
      systemId: input.system_id,
      priority: input.priority ?? 'medium',
      category: input.category,
      externalRef: input.external_ref,
      assignedToId: input.assigned_to_id,
      createdById: actorId,
      status: 'open',
    },
  });

  await addHistory({
    issueId: row.issueId,
    action: 'created',
    actorId,
    toStatus: 'open',
    comment: 'Issue created',
  });

  return getIssueById(row.issueId);
}

export async function updateIssue(
  issueId: number,
  input: IssueUpdateInput,
  actorId: number,
): Promise<IssueDetailResponse> {
  const existing = await prisma.issue.findUnique({ where: { issueId } });
  if (!existing) throw new NotFoundError('Issue not found');

  if (input.system_id) {
    const system = await prisma.systemConnection.findUnique({
      where: { systemId: input.system_id },
    });
    if (!system || !system.isActive) {
      throw new ValidationError('System connection not found or inactive');
    }
  }

  const nextStatus = input.status ?? existing.status;
  const statusChanged = nextStatus !== existing.status;

  await prisma.issue.update({
    where: { issueId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.system_id !== undefined && { systemId: input.system_id }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.external_ref !== undefined && { externalRef: input.external_ref }),
      ...(input.assigned_to_id !== undefined && { assignedToId: input.assigned_to_id }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  await addHistory({
    issueId,
    action: statusChanged ? 'status_changed' : 'updated',
    actorId,
    fromStatus: statusChanged ? existing.status : null,
    toStatus: statusChanged ? nextStatus : null,
    comment: input.comment ?? (statusChanged ? `Status → ${nextStatus}` : 'Issue updated'),
  });

  return getIssueById(issueId);
}

export async function resolveIssue(
  issueId: number,
  input: IssueResolveInput,
  actorId: number,
): Promise<IssueDetailResponse> {
  const existing = await prisma.issue.findUnique({ where: { issueId } });
  if (!existing) throw new NotFoundError('Issue not found');

  const nextStatus = input.status ?? 'resolved';

  await prisma.issue.update({
    where: { issueId },
    data: {
      status: nextStatus,
      resolutionNotes: input.resolution_notes,
      resolvedById: actorId,
      resolvedAt: new Date(),
    },
  });

  await addHistory({
    issueId,
    action: 'resolved',
    actorId,
    fromStatus: existing.status,
    toStatus: nextStatus,
    comment: input.resolution_notes,
  });

  return getIssueById(issueId);
}
