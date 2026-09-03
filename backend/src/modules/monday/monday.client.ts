import { AppError } from '../../utils/AppError';

const MONDAY_API_URL = 'https://api.monday.com/v2';

interface GraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function mondayGraphql<T>(
  apiToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new AppError(
      response.status,
      `Monday API HTTP ${response.status}`,
      'MONDAY_API_ERROR',
    );
  }

  const payload = (await response.json()) as GraphQlResponse<T>;
  if (payload.errors?.length) {
    throw new AppError(
      502,
      payload.errors.map((error) => error.message).join('; '),
      'MONDAY_API_ERROR',
    );
  }

  if (!payload.data) {
    throw new AppError(502, 'Monday API returned no data', 'MONDAY_API_ERROR');
  }

  return payload.data;
}

export async function resolveWorkspaceId(
  apiToken: string,
  workspaceName: string,
  workspaceId: string | null,
): Promise<string> {
  if (workspaceId) return workspaceId;

  const data = await mondayGraphql<{ workspaces: Array<{ id: string; name: string }> }>(
    apiToken,
    `query { workspaces { id name } }`,
  );

  const match = data.workspaces.find(
    (workspace) => workspace.name.trim().toLowerCase() === workspaceName.trim().toLowerCase(),
  );
  if (!match) {
    throw new AppError(
      404,
      `Monday workspace "${workspaceName}" not found`,
      'MONDAY_NOT_FOUND',
    );
  }
  return match.id;
}

export async function resolveBoardId(
  apiToken: string,
  workspaceId: string,
  boardName: string,
  boardId: string | null,
): Promise<string> {
  if (boardId) return boardId;

  const data = await mondayGraphql<{
    boards: Array<{ id: string; name: string; workspace_id: string }>;
  }>(
    apiToken,
    `query ($workspaceIds: [ID!]) {
      boards(workspace_ids: $workspaceIds, limit: 200) {
        id
        name
        workspace_id
      }
    }`,
    { workspaceIds: [workspaceId] },
  );

  const match = data.boards.find(
    (board) => board.name.trim().toLowerCase() === boardName.trim().toLowerCase(),
  );
  if (!match) {
    throw new AppError(
      404,
      `Monday board "${boardName}" not found in workspace`,
      'MONDAY_NOT_FOUND',
    );
  }
  return match.id;
}

export interface MondayBoardGroup {
  id: string;
  title: string;
}

export async function resolveGroupId(
  apiToken: string,
  boardId: string,
  groupName: string,
  groupId: string | null,
): Promise<MondayBoardGroup> {
  const data = await mondayGraphql<{
    boards: Array<{ groups: MondayBoardGroup[] }>;
  }>(
    apiToken,
    `query ($boardIds: [ID!]) {
      boards(ids: $boardIds) {
        groups {
          id
          title
        }
      }
    }`,
    { boardIds: [boardId] },
  );

  const groups = data.boards[0]?.groups ?? [];
  if (groupId) {
    const byId = groups.find((group) => group.id === groupId);
    if (byId) return byId;
  }

  const match = groups.find(
    (group) => group.title.trim().toLowerCase() === groupName.trim().toLowerCase(),
  );
  if (!match) {
    throw new AppError(
      404,
      `Monday group "${groupName}" not found on board`,
      'MONDAY_NOT_FOUND',
    );
  }
  return match;
}

export interface MondayRawItem {
  id: string;
  name: string;
  url?: string | null;
  updated_at: string | null;
  group: { id: string; title: string };
  board: { id: string; name: string };
  column_values: Array<{
    id: string;
    text: string | null;
    value: string | null;
    column: { title: string; id: string };
  }>;
}

export async function fetchGroupItems(
  apiToken: string,
  boardId: string,
  groupId: string,
): Promise<MondayRawItem[]> {
  type ItemsPageResult = {
    boards: Array<{
      groups: Array<{
        items_page: {
          cursor: string | null;
          items: MondayRawItem[];
        };
      }>;
    }>;
  };

  const items: MondayRawItem[] = [];
  let cursor: string | null = null;

  do {
    const data: ItemsPageResult = await mondayGraphql<ItemsPageResult>(
      apiToken,
      `query ($boardIds: [ID!], $groupId: String!, $cursor: String) {
        boards(ids: $boardIds) {
          groups(ids: [$groupId]) {
            items_page(limit: 500, cursor: $cursor) {
              cursor
              items {
                id
                name
                url
                updated_at
                group { id title }
                board { id name }
                column_values {
                  id
                  text
                  value
                  column { title id }
                }
              }
            }
          }
        }
      }`,
      { boardIds: [boardId], groupId, cursor },
    );

    const page = data.boards[0]?.groups[0]?.items_page;
    if (!page) break;
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);

  return items;
}

export async function fetchItemById(
  apiToken: string,
  itemId: string,
): Promise<MondayRawItem | null> {
  const data = await mondayGraphql<{ items: MondayRawItem[] }>(
    apiToken,
    `query ($itemIds: [ID!]) {
      items(ids: $itemIds) {
        id
        name
        url
        updated_at
        group { id title }
        board { id name }
        column_values {
          id
          text
          value
          column { title id }
        }
      }
    }`,
    { itemIds: [itemId] },
  );

  return data.items[0] ?? null;
}
