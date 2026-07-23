export interface MondayBoardDefinition {
  key: string;
  label: string;
  boardName: string;
  groupName: string;
  defaultSystemKey: string;
  boardId?: string | null;
  groupId?: string | null;
}

export interface MondaySettings {
  apiToken: string;
  workspaceName: string;
  statusColumn: string;
  doneStatus: string;
  workspaceId: string | null;
  boards: MondayBoardDefinition[];
}

export const DEFAULT_MONDAY_BOARDS: MondayBoardDefinition[] = [
  {
    key: 'statia',
    label: 'Statia Issues 2026',
    boardName: 'Statia Issues 2026',
    groupName: 'Open Issues',
    defaultSystemKey: 'kadaster_statia',
  },
  {
    key: 'saba',
    label: 'Saba Issues 2026',
    boardName: 'Saba Issues 2026',
    groupName: 'Open Issues',
    defaultSystemKey: 'kadaster_saba',
  },
  {
    key: 'bonaire',
    label: 'Bonaire Issues',
    boardName: 'Bonaire Issues',
    groupName: 'Tickets',
    defaultSystemKey: 'kadaster_bonaire',
  },
  {
    key: 'dlv',
    label: 'DLV Issues',
    boardName: 'DLV Issues',
    groupName: 'Issues',
    defaultSystemKey: 'dlv_aruba_prod',
  },
];

function parseBoardsFromEnv(): MondayBoardDefinition[] | null {
  const raw = process.env.MONDAY_BOARDS?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MondayBoardDefinition[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getMondaySettings(): MondaySettings | null {
  const apiToken = process.env.MONDAY_API_TOKEN?.trim();
  if (!apiToken) return null;

  const boards = parseBoardsFromEnv() ?? DEFAULT_MONDAY_BOARDS;

  return {
    apiToken,
    workspaceName: process.env.MONDAY_WORKSPACE_NAME?.trim() || 'Projects 2026',
    statusColumn: process.env.MONDAY_STATUS_COLUMN?.trim() || 'Status',
    doneStatus: process.env.MONDAY_DONE_STATUS?.trim() || 'Done',
    workspaceId: process.env.MONDAY_WORKSPACE_ID?.trim() || null,
    boards,
  };
}

export function requireMondaySettings(): MondaySettings {
  const settings = getMondaySettings();
  if (!settings) {
    throw new Error('MONDAY_NOT_CONFIGURED');
  }
  return settings;
}

export function getMondayBoardDefinition(
  settings: MondaySettings,
  boardKey: string,
): MondayBoardDefinition | null {
  return (
    settings.boards.find((board) => board.key.toLowerCase() === boardKey.toLowerCase()) ?? null
  );
}

export function mondayExternalRef(itemId: string | number): string {
  return `monday:${itemId}`;
}
