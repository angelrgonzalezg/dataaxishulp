import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMondayItems, importMondayItem } from '@/api/monday.api';
import type { MondayAllItemsResult } from '@/types';

const MONDAY_ALL_QUERY_KEY = ['monday', 'items', 'all'] as const;

export function useMondayInbox(enabled: boolean) {
  const queryClient = useQueryClient();

  const allQuery = useQuery({
    queryKey: [...MONDAY_ALL_QUERY_KEY, 'withDone'],
    queryFn: () => fetchMondayItems(undefined, true),
    enabled,
    retry: false,
  });

  async function refreshBoard(boardKey: string) {
    const boardResult = await fetchMondayItems(boardKey, true);
    const updatedBoard = boardResult.boards[0];
    if (!updatedBoard) return;

    queryClient.setQueryData<MondayAllItemsResult>([...MONDAY_ALL_QUERY_KEY, 'withDone'], (current) => {
      if (!current) return boardResult;
      const boards = current.boards.some((board) => board.board_key === boardKey)
        ? current.boards.map((board) =>
            board.board_key === boardKey ? updatedBoard : board,
          )
        : [...current.boards, updatedBoard];
      return { ...current, boards, synced_at: boardResult.synced_at };
    });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
  }

  async function refreshAll() {
    await allQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
  }

  return {
    ...allQuery,
    refreshAll,
    refreshBoard,
  };
}

export function useImportMondayItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mondayItemId, boardKey }: { mondayItemId: string; boardKey: string }) =>
      importMondayItem(mondayItemId, boardKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monday', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
    },
  });
}

/** @deprecated Use useMondayInbox */
export function useMondayItems(enabled: boolean) {
  return useMondayInbox(enabled);
}
