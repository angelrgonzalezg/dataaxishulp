export interface MondayColumnValue {
  column_id: string;
  column_title: string;
  text: string | null;
  value: string | null;
}

export interface MondayItemDto {
  monday_item_id: string;
  name: string;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  group: string;
  board: string;
  updated_at: string | null;
  monday_url: string | null;
  columns: MondayColumnValue[];
}

export interface MondayBoardItemsResult {
  board_key: string;
  label: string;
  workspace: string;
  board: string;
  group: string;
  /** Pending items (Status !== Done) */
  open_items: MondayItemDto[];
  /** Done items when includeDone is true */
  done_items: MondayItemDto[];
  /** @deprecated Use open_items */
  items: MondayItemDto[];
  counts: {
    open: number;
    done: number;
    total: number;
  };
  local_issue_by_monday_id: Record<string, number>;
}

export interface MondayDashboardSummary {
  configured: boolean;
  workspace: string | null;
  last_synced_at: string | null;
  totals: {
    open: number;
    done: number;
    total: number;
    imported_local: number;
  };
  by_board: Array<{
    board_key: string;
    label: string;
    open: number;
    done: number;
    total: number;
  }>;
}

export interface MondayAllItemsResult {
  workspace: string;
  synced_at: string;
  boards: MondayBoardItemsResult[];
}

/** @deprecated Use MondayBoardItemsResult */
export type MondayItemsResult = MondayBoardItemsResult;

export interface MondayImportResult {
  issue_id: number;
  created: boolean;
  board_key: string;
  monday_item: MondayItemDto;
}
