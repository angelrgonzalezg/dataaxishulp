import { prisma } from '../../config/db';
import type { MondayBoardDefinition, MondaySettings } from '../../config/monday';
import {
  getMondayBoardDefinition,
  getMondaySettings,
  mondayExternalRef,
  requireMondaySettings,
} from '../../config/monday';
import { AppError, NotFoundError, ValidationError } from '../../utils/AppError';
import type { IssuePriority } from '../../types/database.types';
import * as issuesService from '../issues/issues.service';
import {
  fetchGroupItems,
  fetchItemById,
  resolveBoardId,
  resolveGroupId,
  resolveWorkspaceId,
  type MondayRawItem,
} from './monday.client';
import type {
  MondayAllItemsResult,
  MondayBoardItemsResult,
  MondayDashboardSummary,
  MondayImportResult,
  MondayItemDto,
} from './monday.types';

interface MondayMappingContext {
  statusColumn: string;
  doneStatus: string;
}

function parseStatusLabel(text: string | null, value: string | null): string | null {
  if (text?.trim()) return text.trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { label?: string };
    return parsed.label?.trim() ?? null;
  } catch {
    return null;
  }
}

function getColumnValue(
  item: MondayRawItem,
  columnTitle: string,
): { text: string | null; value: string | null; column_id: string } | null {
  const match = item.column_values.find(
    (column) => column.column.title.trim().toLowerCase() === columnTitle.trim().toLowerCase(),
  );
  if (!match) return null;
  return {
    column_id: match.column.id,
    text: match.text,
    value: match.value,
  };
}

function mapPriority(status: string | null, priorityText: string | null): IssuePriority {
  const source = `${priorityText ?? ''} ${status ?? ''}`.toLowerCase();
  if (source.includes('critical') || source.includes('urgent')) return 'critical';
  if (source.includes('high')) return 'high';
  if (source.includes('low')) return 'low';
  return 'medium';
}

function mapMondayItem(item: MondayRawItem, context: MondayMappingContext): MondayItemDto {
  const statusCol = getColumnValue(item, context.statusColumn);
  const priorityCol = getColumnValue(item, 'Priority') ?? getColumnValue(item, 'Prioridad');
  const assigneeCol =
    getColumnValue(item, 'Person') ??
    getColumnValue(item, 'Assignee') ??
    getColumnValue(item, 'Owner');

  const status = parseStatusLabel(statusCol?.text ?? null, statusCol?.value ?? null);

  return {
    monday_item_id: item.id,
    name: item.name,
    status,
    priority: priorityCol?.text?.trim() || null,
    assignee: assigneeCol?.text?.trim() || null,
    group: item.group.title,
    board: item.board.name,
    updated_at: item.updated_at,
    monday_url: `https://view.monday.com/boards/${item.board.id}/pulses/${item.id}`,
    columns: item.column_values.map((column) => ({
      column_id: column.column.id,
      column_title: column.column.title,
      text: column.text,
      value: column.value,
    })),
  };
}

function buildDescription(item: MondayItemDto, boardLabel: string): string {
  const lines = [
    `Imported from Monday.com (${boardLabel}) item ${item.monday_item_id}.`,
    item.monday_url ? `Monday link: ${item.monday_url}` : null,
    item.status ? `Status: ${item.status}` : null,
    item.priority ? `Priority: ${item.priority}` : null,
    item.assignee ? `Assignee: ${item.assignee}` : null,
  ].filter(Boolean);

  const extraColumns = item.columns
    .filter(
      (column) =>
        !['Status', 'Priority', 'Prioridad', 'Person', 'Assignee', 'Owner'].includes(
          column.column_title,
        ) && column.text?.trim(),
    )
    .slice(0, 8)
    .map((column) => `${column.column_title}: ${column.text}`);

  return [...lines, ...extraColumns].join('\n');
}

function assertMondayConfigured(): MondaySettings {
  try {
    return requireMondaySettings();
  } catch {
    throw new AppError(
      503,
      'Monday.com is not configured. Set MONDAY_API_TOKEN in backend/.env',
      'MONDAY_NOT_CONFIGURED',
    );
  }
}

async function resolveBoardContext(
  settings: MondaySettings,
  board: MondayBoardDefinition,
  workspaceId: string,
) {
  const boardId = await resolveBoardId(
    settings.apiToken,
    workspaceId,
    board.boardName,
    board.boardId ?? null,
  );
  const group = await resolveGroupId(
    settings.apiToken,
    boardId,
    board.groupName,
    board.groupId ?? null,
  );

  return { boardId, group };
}

async function attachLocalIssueLinks(
  items: MondayItemDto[],
): Promise<Record<string, number>> {
  const externalRefs = items.map((item) => mondayExternalRef(item.monday_item_id));
  const existingIssues = externalRefs.length
    ? await prisma.issue.findMany({
        where: { externalRef: { in: externalRefs } },
        select: { issueId: true, externalRef: true },
      })
    : [];

  const localIssueByMondayId: Record<string, number> = {};
  for (const issue of existingIssues) {
    if (!issue.externalRef?.startsWith('monday:')) continue;
    const mondayId = issue.externalRef.replace(/^monday:/, '');
    localIssueByMondayId[mondayId] = issue.issueId;
  }
  return localIssueByMondayId;
}

function isDoneItem(status: string | null, doneStatus: string): boolean {
  return (status ?? '').trim().toLowerCase() === doneStatus.trim().toLowerCase();
}

async function listMondayBoardItems(
  settings: MondaySettings,
  board: MondayBoardDefinition,
  workspaceId: string,
  includeDone: boolean,
): Promise<MondayBoardItemsResult> {
  const context: MondayMappingContext = {
    statusColumn: settings.statusColumn,
    doneStatus: settings.doneStatus,
  };
  const { boardId, group } = await resolveBoardContext(settings, board, workspaceId);
  const rawItems = await fetchGroupItems(settings.apiToken, boardId, group.id);
  const mapped = rawItems.map((item) => mapMondayItem(item, context));
  const openItems = mapped.filter((item) => !isDoneItem(item.status, settings.doneStatus));
  const doneItems = includeDone
    ? mapped.filter((item) => isDoneItem(item.status, settings.doneStatus))
    : [];
  const linkSource = includeDone ? [...openItems, ...doneItems] : openItems;

  return {
    board_key: board.key,
    label: board.label,
    workspace: settings.workspaceName,
    board: board.boardName,
    group: group.title,
    open_items: openItems,
    done_items: doneItems,
    items: openItems,
    counts: {
      open: openItems.length,
      done: doneItems.length,
      total: openItems.length + doneItems.length,
    },
    local_issue_by_monday_id: await attachLocalIssueLinks(linkSource),
  };
}

export async function listMondayItems(
  boardKey?: string,
  options?: { includeDone?: boolean },
): Promise<MondayAllItemsResult> {
  const includeDone = options?.includeDone ?? false;
  const settings = assertMondayConfigured();
  const boards = boardKey
    ? (() => {
        const board = getMondayBoardDefinition(settings, boardKey);
        if (!board) {
          throw new NotFoundError(`Monday board "${boardKey}" is not configured`);
        }
        return [board];
      })()
    : settings.boards;

  const workspaceId = await resolveWorkspaceId(
    settings.apiToken,
    settings.workspaceName,
    settings.workspaceId,
  );

  const boardResults = await Promise.all(
    boards.map((board) => listMondayBoardItems(settings, board, workspaceId, includeDone)),
  );

  return {
    workspace: settings.workspaceName,
    synced_at: new Date().toISOString(),
    boards: boardResults,
  };
}

export async function importMondayItem(
  mondayItemId: string,
  boardKey: string,
  actorId: number,
): Promise<MondayImportResult> {
  const settings = assertMondayConfigured();
  const board = getMondayBoardDefinition(settings, boardKey);
  if (!board) {
    throw new ValidationError(`Monday board "${boardKey}" is not configured`);
  }

  const context: MondayMappingContext = {
    statusColumn: settings.statusColumn,
    doneStatus: settings.doneStatus,
  };
  const externalRef = mondayExternalRef(mondayItemId);

  const existing = await prisma.issue.findFirst({
    where: { externalRef },
    select: { issueId: true },
  });
  if (existing) {
    const raw = await fetchItemById(settings.apiToken, mondayItemId);
    if (!raw) throw new NotFoundError(`Monday item ${mondayItemId} not found`);
    return {
      issue_id: existing.issueId,
      created: false,
      board_key: board.key,
      monday_item: mapMondayItem(raw, context),
    };
  }

  const raw = await fetchItemById(settings.apiToken, mondayItemId);
  if (!raw) throw new NotFoundError(`Monday item ${mondayItemId} not found`);

  const mondayItem = mapMondayItem(raw, context);
  if (isDoneItem(mondayItem.status, settings.doneStatus)) {
    throw new ValidationError(`Monday item is already in status "${settings.doneStatus}"`);
  }

  const system = await prisma.systemConnection.findUnique({
    where: { systemKey: board.defaultSystemKey },
  });
  if (!system || !system.isActive) {
    throw new ValidationError(
      `Default system "${board.defaultSystemKey}" not found or inactive`,
    );
  }

  const created = await issuesService.createIssue(
    {
      title: mondayItem.name.slice(0, 200),
      description: buildDescription(mondayItem, board.label),
      system_id: system.systemId,
      priority: mapPriority(mondayItem.status, mondayItem.priority),
      category: 'monday',
      external_ref: externalRef,
    },
    actorId,
  );

  return {
    issue_id: created.issue_id,
    created: true,
    board_key: board.key,
    monday_item: mondayItem,
  };
}

export function isMondayConfigured(): boolean {
  return getMondaySettings() != null;
}

export function listMondayBoardKeys(): string[] {
  return getMondaySettings()?.boards.map((board) => board.key) ?? [];
}

export async function getMondayDashboardSummary(): Promise<MondayDashboardSummary | null> {
  const settings = getMondaySettings();
  if (!settings) {
    return null;
  }

  try {
    const [mondayData, importedLocal] = await Promise.all([
      listMondayItems(undefined, { includeDone: true }),
      prisma.issue.count({
        where: { externalRef: { startsWith: 'monday:' } },
      }),
    ]);

    const totals = mondayData.boards.reduce(
      (acc, board) => ({
        open: acc.open + board.counts.open,
        done: acc.done + board.counts.done,
        total: acc.total + board.counts.total,
      }),
      { open: 0, done: 0, total: 0 },
    );

    return {
      configured: true,
      workspace: mondayData.workspace,
      last_synced_at: mondayData.synced_at,
      totals: {
        ...totals,
        imported_local: importedLocal,
      },
      by_board: mondayData.boards.map((board) => ({
        board_key: board.board_key,
        label: board.label,
        open: board.counts.open,
        done: board.counts.done,
        total: board.counts.total,
      })),
    };
  } catch {
    return {
      configured: true,
      workspace: settings.workspaceName,
      last_synced_at: null,
      totals: { open: 0, done: 0, total: 0, imported_local: 0 },
      by_board: settings.boards.map((board) => ({
        board_key: board.key,
        label: board.label,
        open: 0,
        done: 0,
        total: 0,
      })),
    };
  }
}
