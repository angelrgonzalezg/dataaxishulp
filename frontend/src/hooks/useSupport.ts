import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDeedHistorySupport,
  fetchDeedLegalFact,
  fetchLegalFacts,
  fetchOrderSupport,
  fetchOrderSupportByKenmerk,
  fetchOrderSupportByRegisterTitle,
  fetchParcelSupportById,
  fetchParcelSupportByMeetBrief,
  lookupRetireSubjectCandidates,
  reopenBestelling,
  voidOrder,
  verifyOrder,
  fetchOrderParcelLinks,
  searchParcelByEsri,
  changeOrderParcel,
  fetchOrderDeedLinks,
  searchDeedByTitle,
  changeOrderDeed,
  retireSubjectFromDeed,
  correctOwnershipShare,
  updateDeedLegalFact,
  searchNotaries,
  fetchDeedNotary,
  changeDeedNotary,
  updateFrameRows,
} from '@/api/support.api';
import type { FrameRowChange, RetireSubjectCandidate } from '@/types';

export function useOrderSupport(orderId: number | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'order', systemKey, orderId],
    queryFn: () => fetchOrderSupport(orderId!, systemKey!),
    enabled: orderId != null && orderId > 0 && Boolean(systemKey),
    retry: false,
  });
}

export function useOrderSupportByKenmerk(kenmerk: string | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'kenmerk', systemKey, kenmerk],
    queryFn: () => fetchOrderSupportByKenmerk(kenmerk!, systemKey!),
    enabled: Boolean(kenmerk && kenmerk.trim().length > 0 && systemKey),
    retry: false,
  });
}

export function useOrderSupportByRegisterTitle(title: string | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'register', systemKey, title],
    queryFn: () => fetchOrderSupportByRegisterTitle(title!, systemKey!),
    enabled: Boolean(title && title.trim().length > 0 && systemKey),
    retry: false,
  });
}

export function useDeedHistorySupport(title: string | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'deedHistory', systemKey, title],
    queryFn: () => fetchDeedHistorySupport(title!, systemKey!),
    enabled: Boolean(title && title.trim().length > 0 && systemKey),
    retry: false,
  });
}

export function useParcelSupportById(parcelId: number | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'parcel', systemKey, parcelId],
    queryFn: () => fetchParcelSupportById(parcelId!, systemKey!),
    enabled: parcelId != null && parcelId > 0 && Boolean(systemKey),
    retry: false,
  });
}

export function useParcelSupportByMeetBrief(meetBrief: string | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'meetBrief', systemKey, meetBrief],
    queryFn: () => fetchParcelSupportByMeetBrief(meetBrief!, systemKey!),
    enabled: Boolean(meetBrief && meetBrief.trim().length > 0 && systemKey),
    retry: false,
  });
}

export function useLegalFacts(systemKey: string | null, enabled = true) {
  return useQuery({
    queryKey: ['support', 'legalFacts', systemKey],
    queryFn: () => fetchLegalFacts(systemKey!),
    enabled: Boolean(systemKey) && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useDeedLegalFact(
  deedId: number | null,
  systemKey: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['support', 'deedLegalFact', systemKey, deedId],
    queryFn: () => fetchDeedLegalFact(deedId!, systemKey!),
    enabled: deedId != null && deedId > 0 && Boolean(systemKey) && enabled,
    retry: false,
  });
}

export function useUpdateDeedLegalFact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deedId,
      systemKey,
      legalFactId,
    }: {
      deedId: number;
      systemKey: string;
      legalFactId: number;
    }) =>
      updateDeedLegalFact(deedId, {
        systemKey,
        legalFactId,
        confirm: true,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['support'] });
      void queryClient.invalidateQueries({
        queryKey: ['support', 'deedLegalFact', variables.systemKey, variables.deedId],
      });
    },
  });
}

export function useDeedNotary(
  deedId: number | null,
  systemKey: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['support', 'deedNotary', systemKey, deedId],
    queryFn: () => fetchDeedNotary(deedId!, systemKey!),
    enabled: deedId != null && deedId > 0 && Boolean(systemKey) && enabled,
    retry: false,
  });
}

export function useSearchNotaries() {
  return useMutation({
    mutationFn: ({ systemKey, q }: { systemKey: string; q: string }) =>
      searchNotaries(systemKey, q),
  });
}

export function useChangeDeedNotary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deedId,
      systemKey,
      notaryId,
      previewOnly,
      confirm,
    }: {
      deedId: number;
      systemKey: string;
      notaryId: number;
      previewOnly: boolean;
      confirm?: true;
    }) =>
      changeDeedNotary(deedId, {
        systemKey,
        notaryId,
        previewOnly,
        confirm,
      }),
    onSuccess: (_data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
        void queryClient.invalidateQueries({
          queryKey: ['support', 'deedNotary', variables.systemKey, variables.deedId],
        });
      }
    },
  });
}

export function useUpdateFrameRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      systemKey: string;
      tableName: string;
      primaryKey: string;
      changes: FrameRowChange[];
      previewOnly: boolean;
      confirm?: true;
    }) => updateFrameRows(payload),
    onSuccess: (_data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
      }
    },
  });
}

export function useReopenBestelling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      systemKey,
      previewOnly,
      confirm,
    }: {
      orderId: number;
      systemKey: string;
      previewOnly: boolean;
      confirm?: true;
    }) =>
      reopenBestelling(orderId, {
        systemKey,
        previewOnly,
        confirm,
      }),
    onSuccess: (data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
        void queryClient.invalidateQueries({
          queryKey: ['support', 'order', variables.systemKey, data.order_id],
        });
      }
    },
  });
}

export function useVoidOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      systemKey,
      previewOnly,
      confirm,
      acknowledgeRisk,
    }: {
      orderId: number;
      systemKey: string;
      previewOnly: boolean;
      confirm?: true;
      acknowledgeRisk?: boolean;
    }) =>
      voidOrder(orderId, {
        systemKey,
        previewOnly,
        confirm,
        acknowledgeRisk,
      }),
    onSuccess: (data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
        void queryClient.invalidateQueries({
          queryKey: ['support', 'order', variables.systemKey, data.order_id],
        });
      }
    },
  });
}

export function useVerifyOrder() {
  return useMutation({
    mutationFn: ({ orderId, systemKey }: { orderId: number; systemKey: string }) =>
      verifyOrder(orderId, systemKey),
  });
}

export function useOrderParcelLinks(orderId: number | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'orderParcelLinks', systemKey, orderId],
    queryFn: () => fetchOrderParcelLinks(orderId!, systemKey!),
    enabled: orderId != null && orderId > 0 && Boolean(systemKey),
    retry: false,
  });
}

export function useSearchParcelByEsri() {
  return useMutation({
    mutationFn: ({ systemKey, esri }: { systemKey: string; esri: string }) =>
      searchParcelByEsri(systemKey, esri),
  });
}

export function useChangeOrderParcel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      systemKey,
      linkId,
      newParcelEsri,
      newParcelId,
      previewOnly,
      confirm,
    }: {
      orderId: number;
      systemKey: string;
      linkId: number;
      newParcelEsri?: string;
      newParcelId?: number;
      previewOnly: boolean;
      confirm?: true;
    }) =>
      changeOrderParcel(orderId, {
        systemKey,
        linkId,
        newParcelEsri,
        newParcelId,
        previewOnly,
        confirm,
      }),
    onSuccess: (data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
        void queryClient.invalidateQueries({
          queryKey: ['support', 'orderParcelLinks', variables.systemKey, data.order_id],
        });
      }
    },
  });
}

export function useOrderDeedLinks(orderId: number | null, systemKey: string | null) {
  return useQuery({
    queryKey: ['support', 'orderDeedLinks', systemKey, orderId],
    queryFn: () => fetchOrderDeedLinks(orderId!, systemKey!),
    enabled: orderId != null && orderId > 0 && Boolean(systemKey),
    retry: false,
  });
}

export function useSearchDeedByTitle() {
  return useMutation({
    mutationFn: ({ systemKey, title }: { systemKey: string; title: string }) =>
      searchDeedByTitle(systemKey, title),
  });
}

export function useChangeOrderDeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      systemKey,
      linkId,
      newRegisterTitle,
      newDeedId,
      previewOnly,
      confirm,
    }: {
      orderId: number;
      systemKey: string;
      linkId: number;
      newRegisterTitle?: string;
      newDeedId?: number;
      previewOnly: boolean;
      confirm?: true;
    }) =>
      changeOrderDeed(orderId, {
        systemKey,
        linkId,
        newRegisterTitle,
        newDeedId,
        previewOnly,
        confirm,
      }),
    onSuccess: (data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
        void queryClient.invalidateQueries({
          queryKey: ['support', 'orderDeedLinks', variables.systemKey, data.order_id],
        });
      }
    },
  });
}

export function useLookupRetireSubjectCandidates() {
  return useMutation({
    mutationFn: (params: {
      systemKey: string;
      registerTitle: string;
      parcelEsri: string;
    }) => lookupRetireSubjectCandidates(params),
  });
}

export function useRetireSubjectFromDeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      systemKey: string;
      deedDetailIds: number[];
      previewOnly: boolean;
      confirm?: true;
    }) => retireSubjectFromDeed(payload),
    onSuccess: (_data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
      }
    },
  });
}

export function useCorrectOwnershipShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      deedDetailId: number;
      systemKey: string;
      shareNumerator: number;
      shareDenominator: number;
      previewOnly: boolean;
      confirm?: true;
      contextCandidates?: RetireSubjectCandidate[];
    }) =>
      correctOwnershipShare(payload.deedDetailId, {
        systemKey: payload.systemKey,
        shareNumerator: payload.shareNumerator,
        shareDenominator: payload.shareDenominator,
        previewOnly: payload.previewOnly,
        confirm: payload.confirm,
        contextCandidates: payload.contextCandidates,
      }),
    onSuccess: (_data, variables) => {
      if (!variables.previewOnly) {
        void queryClient.invalidateQueries({ queryKey: ['support'] });
      }
    },
  });
}
