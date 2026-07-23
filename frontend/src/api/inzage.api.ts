import { api } from './client';
import type {
  InzageObjectReport,
  InzageObjectVariant,
  InzageSubjectReport,
  InzageSubjectVariant,
} from '@/types';

export async function fetchObjectInzage(
  parcelId: number,
  systemKey: string,
  variant: InzageObjectVariant = 'object',
) {
  const { data } = await api.get(`/support/inzage/parcel/${parcelId}`, {
    params: { systemKey, variant },
  });
  return data.data as InzageObjectReport;
}

export async function fetchSubjectInzage(
  subjectId: number,
  systemKey: string,
  variant: InzageSubjectVariant = 'subject',
) {
  const { data } = await api.get(`/support/inzage/subject/${subjectId}`, {
    params: { systemKey, variant },
  });
  return data.data as InzageSubjectReport;
}
