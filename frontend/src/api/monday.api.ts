import { api } from './client';
import type { MondayAllItemsResult, MondayImportResult } from '@/types';

export async function fetchMondayItems(boardKey?: string, includeDone = false) {
  const { data } = await api.get('/issues/monday/items', {
    params: {
      ...(boardKey ? { boardKey } : {}),
      ...(includeDone ? { includeDone: 'true' } : {}),
    },
  });
  return data.data as MondayAllItemsResult;
}

export async function importMondayItem(mondayItemId: string, boardKey: string) {
  const { data } = await api.post(
    `/issues/monday/items/${encodeURIComponent(mondayItemId)}/import`,
    null,
    { params: { boardKey } },
  );
  return data.data as MondayImportResult;
}
