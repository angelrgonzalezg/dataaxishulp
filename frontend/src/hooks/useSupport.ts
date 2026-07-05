import { useQuery } from '@tanstack/react-query';
import {
  fetchDeedHistorySupport,
  fetchOrderSupport,
  fetchOrderSupportByKenmerk,
  fetchOrderSupportByRegisterTitle,
  fetchParcelSupportById,
  fetchParcelSupportByMeetBrief,
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
