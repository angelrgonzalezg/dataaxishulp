import { api } from './client';
import type { DeedHistorySupportLookup, OrderSupportLookup, ParcelSupportLookup } from '@/types';

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
