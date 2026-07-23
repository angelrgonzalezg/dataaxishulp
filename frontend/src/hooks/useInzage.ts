import { useQuery } from '@tanstack/react-query';
import { fetchObjectInzage, fetchSubjectInzage } from '@/api/inzage.api';
import type { InzageObjectVariant, InzageSubjectVariant } from '@/types';

export function useObjectInzage(
  parcelId: number | null,
  systemKey: string | null,
  variant: InzageObjectVariant,
) {
  return useQuery({
    queryKey: ['inzage', 'object', systemKey, parcelId, variant],
    queryFn: () => fetchObjectInzage(parcelId!, systemKey!, variant),
    enabled: parcelId != null && parcelId > 0 && Boolean(systemKey),
    retry: false,
  });
}

export function useSubjectInzage(
  subjectId: number | null,
  systemKey: string | null,
  variant: InzageSubjectVariant,
) {
  return useQuery({
    queryKey: ['inzage', 'subject', systemKey, subjectId, variant],
    queryFn: () => fetchSubjectInzage(subjectId!, systemKey!, variant),
    enabled: subjectId != null && subjectId > 0 && Boolean(systemKey),
    retry: false,
  });
}
