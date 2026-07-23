import { api } from './client';
import type {
  DeedHistorySupportLookup,
  DeedLegalFactState,
  LegalFactOption,
  OrderSupportLookup,
  ParcelSupportLookup,
  UpdateDeedLegalFactResult,
} from '@/types';

export async function fetchOrderSupport(orderId: number, systemKey: string) {
  const { data } = await api.get(`/support/orders/${orderId}`, {
    params: { systemKey },
  });
  return data.data as OrderSupportLookup;
}

export async function fetchOrderSupportByKenmerk(kenmerk: string, systemKey: string) {
  const { data } = await api.get('/support/orders', {
    params: { kenmerk, systemKey },
  });
  return data.data as OrderSupportLookup;
}

export async function fetchOrderSupportByRegisterTitle(title: string, systemKey: string) {
  const { data } = await api.get('/support/orders', {
    params: { title, systemKey },
  });
  return data.data as OrderSupportLookup;
}

export async function fetchDeedHistorySupport(title: string, systemKey: string) {
  const { data } = await api.get('/support/deeds/history', {
    params: { title, systemKey },
  });
  return data.data as DeedHistorySupportLookup;
}

export async function fetchParcelSupportById(parcelId: number, systemKey: string) {
  const { data } = await api.get(`/support/parcels/${parcelId}`, {
    params: { systemKey },
  });
  return data.data as ParcelSupportLookup;
}

export async function fetchParcelSupportByMeetBrief(meetBrief: string, systemKey: string) {
  const { data } = await api.get('/support/parcels', {
    params: { meetBrief, systemKey },
  });
  return data.data as ParcelSupportLookup;
}

export async function fetchLegalFacts(systemKey: string) {
  const { data } = await api.get('/support/legal-facts', {
    params: { systemKey },
  });
  return data.data as LegalFactOption[];
}

export async function fetchDeedLegalFact(deedId: number, systemKey: string) {
  const { data } = await api.get(`/support/deeds/${deedId}/legal-fact`, {
    params: { systemKey },
  });
  return data.data as DeedLegalFactState;
}

export async function updateDeedLegalFact(
  deedId: number,
  payload: { systemKey: string; legalFactId: number; confirm: true },
) {
  const { data } = await api.post(`/support/deeds/${deedId}/legal-fact`, payload);
  return data.data as UpdateDeedLegalFactResult;
}
