import { api } from './client';
import type {
  DeedHistorySupportLookup,
  DeedLegalFactState,
  LegalFactOption,
  OrderSupportLookup,
  ParcelSupportLookup,
  ReopenBestellingResult,
  VoidOrderResult,
  OrderParcelLinksResult,
  ParcelEsriSearchResult,
  ChangeOrderParcelResult,
  OrderDeedLinksResult,
  DeedTitleSearchResult,
  ChangeOrderDeedResult,
  RetireSubjectCandidate,
  RetireSubjectLookupResult,
  RetireSubjectResult,
  CorrectOwnershipShareResult,
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

export async function reopenBestelling(
  orderId: number,
  payload: {
    systemKey: string;
    previewOnly: boolean;
    confirm?: true;
  },
) {
  const { data } = await api.post(`/support/orders/${orderId}/reopen-bestelling`, payload);
  return data.data as ReopenBestellingResult;
}

export async function voidOrder(
  orderId: number,
  payload: {
    systemKey: string;
    previewOnly: boolean;
    confirm?: true;
    acknowledgeRisk?: boolean;
  },
) {
  const { data } = await api.post(`/support/orders/${orderId}/void`, payload);
  return data.data as VoidOrderResult;
}

export async function fetchOrderParcelLinks(orderId: number, systemKey: string) {
  const { data } = await api.get(`/support/orders/${orderId}/parcel-links`, {
    params: { systemKey },
  });
  return data.data as OrderParcelLinksResult;
}

export async function searchParcelByEsri(systemKey: string, esri: string) {
  const { data } = await api.get('/support/parcels/search-esri', {
    params: { systemKey, esri },
  });
  return data.data as ParcelEsriSearchResult;
}

export async function changeOrderParcel(
  orderId: number,
  payload: {
    systemKey: string;
    linkId: number;
    newParcelEsri?: string;
    newParcelId?: number;
    previewOnly: boolean;
    confirm?: true;
  },
) {
  const { data } = await api.post(`/support/orders/${orderId}/change-parcel`, payload);
  return data.data as ChangeOrderParcelResult;
}

export async function fetchOrderDeedLinks(orderId: number, systemKey: string) {
  const { data } = await api.get(`/support/orders/${orderId}/deed-links`, {
    params: { systemKey },
  });
  return data.data as OrderDeedLinksResult;
}

export async function searchDeedByTitle(systemKey: string, title: string) {
  const { data } = await api.get('/support/deeds/search-title', {
    params: { systemKey, title },
  });
  return data.data as DeedTitleSearchResult;
}

export async function changeOrderDeed(
  orderId: number,
  payload: {
    systemKey: string;
    linkId: number;
    newRegisterTitle?: string;
    newDeedId?: number;
    previewOnly: boolean;
    confirm?: true;
  },
) {
  const { data } = await api.post(`/support/orders/${orderId}/change-deed`, payload);
  return data.data as ChangeOrderDeedResult;
}

export async function lookupRetireSubjectCandidates(params: {
  systemKey: string;
  registerTitle: string;
  parcelEsri: string;
}) {
  const { data } = await api.get('/support/deed-details/retire-subject', {
    params,
  });
  return data.data as RetireSubjectLookupResult;
}

export async function retireSubjectFromDeed(payload: {
  systemKey: string;
  deedDetailIds: number[];
  previewOnly: boolean;
  confirm?: true;
}) {
  const { data } = await api.post('/support/deed-details/retire-subject', payload);
  return data.data as RetireSubjectResult;
}

export async function correctOwnershipShare(
  deedDetailId: number,
  payload: {
    systemKey: string;
    shareNumerator: number;
    shareDenominator: number;
    previewOnly: boolean;
    confirm?: true;
    contextCandidates?: RetireSubjectCandidate[];
  },
) {
  const { data } = await api.post(`/support/deed-details/${deedDetailId}/share`, payload);
  return data.data as CorrectOwnershipShareResult;
}
