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
  updateDeedLegalFact,
} from '@/api/support.api';

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
