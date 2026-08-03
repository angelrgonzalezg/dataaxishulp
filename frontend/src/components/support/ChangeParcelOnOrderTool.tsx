import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useChangeOrderParcel,
  useOrderParcelLinks,
  useSearchParcelByEsri,
} from '@/hooks/useSupport';
import type { ChangeOrderParcelResult, ParcelEsriCandidate } from '@/types';

type ChangeParcelOnOrderToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  orderId: number;
};

function formatParcel(id: number | null, esri: string | null): string {
  if (id != null && esri) return `#${id} · ${esri}`;
  if (id != null) return `#${id}`;
  if (esri) return esri;
  return '—';
}

export function ChangeParcelOnOrderTool({
  systemKey,
  isProduction,
  systemName,
  orderId,
}: ChangeParcelOnOrderToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const linksQuery = useOrderParcelLinks(orderId, systemKey);
  const searchMutation = useSearchParcelByEsri();
  const changeMutation = useChangeOrderParcel();

  const [selectedLinkId, setSelectedLinkId] = useState<number | ''>('');
  const [newEsri, setNewEsri] = useState('');
  const [candidates, setCandidates] = useState<ParcelEsriCandidate[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<number | ''>('');
  const [preview, setPreview] = useState<ChangeOrderParcelResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const links = linksQuery.data?.links ?? [];

  useEffect(() => {
    setSelectedLinkId('');
    setNewEsri('');
    setCandidates([]);
    setSelectedParcelId('');
    setPreview(null);
    setConfirmOpen(false);
  }, [orderId, systemKey]);

  useEffect(() => {
    if (links.length === 1) {
      setSelectedLinkId(links[0].link_id);
    } else if (
      selectedLinkId !== '' &&
      !links.some((link) => link.link_id === selectedLinkId)
    ) {
      setSelectedLinkId('');
    }
  }, [links, selectedLinkId]);

  async function searchReplacement() {
    const esri = newEsri.trim();
    if (!esri) {
      toast.error(t('support.tools.changeParcel.missingEsri'));
      return;
    }
    try {
      const result = await searchMutation.mutateAsync({ systemKey, esri });
      setCandidates(result.candidates);
      setSelectedParcelId(
        result.candidates.length === 1 ? result.candidates[0].parcel_id : '',
      );
      setPreview(null);
      if (result.candidates.length === 0) {
        toast(t('support.tools.changeParcel.noParcelFound'));
      }
    } catch (error) {
      setCandidates([]);
      setSelectedParcelId('');
      toast.error(extractErrorMessage(error));
    }
  }

  async function runPreview() {
    if (!canEdit || selectedLinkId === '' || selectedParcelId === '') return;
    try {
      const result = await changeMutation.mutateAsync({
        orderId,
        systemKey,
        linkId: selectedLinkId,
        newParcelId: selectedParcelId,
        previewOnly: true,
      });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!canEdit || selectedLinkId === '' || selectedParcelId === '') return;
    try {
      const result = await changeMutation.mutateAsync({
        orderId,
        systemKey,
        linkId: selectedLinkId,
        newParcelId: selectedParcelId,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.tools.changeParcel.success', {
          order: result.order_id,
          from: formatParcel(result.from_parcel_id, result.from_parcel_esri),
          to: formatParcel(result.to_parcel_id, result.to_parcel_esri),
        }),
      );
      setConfirmOpen(false);
      setPreview(result);
      void linksQuery.refetch();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  const busy =
    linksQuery.isFetching || searchMutation.isPending || changeMutation.isPending;

  if (!orderId || orderId <= 0) {
    return null;
  }

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <MapPinned style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.changeParcel.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.changeParcel.description')}
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-700">
              {t('support.tools.changeParcel.order')}
            </p>
            <div className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-900">
              #{orderId}
              <span className="mt-0.5 block text-xs font-normal text-ink-500">
                {t('support.tools.changeParcel.fromCurrentLookup')}
              </span>
            </div>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.changeParcel.viewOnly')}</p>
          )}

          {linksQuery.isError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {extractErrorMessage(linksQuery.error)}
            </p>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink-800">
              {t('support.tools.changeParcel.currentLinks')}
            </p>
            {links.length === 0 && !linksQuery.isFetching ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('support.tools.changeParcel.noLinks')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                    <tr>
                      <th className="px-3 py-2">{t('support.tools.changeParcel.select')}</th>
                      <th className="px-3 py-2">{t('support.tools.changeParcel.parcel')}</th>
                      <th className="px-3 py-2">{t('support.tools.changeParcel.location')}</th>
                      <th className="px-3 py-2">{t('support.tools.changeParcel.linkId')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {links.map((link) => (
                      <tr key={link.link_id}>
                        <td className="px-3 py-2">
                          <input
                            type="radio"
                            name="order-parcel-link"
                            checked={selectedLinkId === link.link_id}
                            onChange={() => {
                              setSelectedLinkId(link.link_id);
                              setPreview(null);
                            }}
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-2 text-ink-900">
                          {formatParcel(link.parcel_id, link.parcel_esri)}
                        </td>
                        <td className="px-3 py-2 text-ink-700">
                          {link.parcel_location ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-ink-700">#{link.link_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeParcel.newParcelEsri')}
              </label>
              <Input
                value={newEsri}
                onChange={(event) => {
                  setNewEsri(event.target.value);
                  setCandidates([]);
                  setSelectedParcelId('');
                  setPreview(null);
                }}
                placeholder="1-B-100"
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={!canEdit || busy || !newEsri.trim()}
                loading={searchMutation.isPending}
                onClick={() => void searchReplacement()}
              >
                {t('support.tools.changeParcel.findParcel')}
              </Button>
            </div>
          </div>

          {candidates.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeParcel.replacement')}
              </label>
              <Select
                value={selectedParcelId === '' ? '' : String(selectedParcelId)}
                onChange={(event) => {
                  setSelectedParcelId(event.target.value ? Number(event.target.value) : '');
                  setPreview(null);
                }}
                disabled={!canEdit}
              >
                <option value="">{t('support.tools.changeParcel.pickParcel')}</option>
                {candidates.map((candidate) => (
                  <option key={candidate.parcel_id} value={candidate.parcel_id}>
                    {formatParcel(candidate.parcel_id, candidate.parcel_esri)}
                    {candidate.location ? ` · ${candidate.location}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <Button
            type="button"
            disabled={
              !canEdit ||
              busy ||
              selectedLinkId === '' ||
              selectedParcelId === ''
            }
            loading={changeMutation.isPending && !confirmOpen}
            onClick={() => void runPreview()}
          >
            {t('support.tools.changeParcel.preview')}
          </Button>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {preview.preview_only
                    ? t('support.tools.changeParcel.previewResult')
                    : t('support.tools.changeParcel.appliedResult')}
                </p>
                {preview.preview_only && (
                  <Button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t('support.tools.changeParcel.apply')}
                  </Button>
                )}
              </div>
              <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700">
                <p>
                  <span className="font-semibold">{t('support.tools.changeParcel.from')}:</span>{' '}
                  {formatParcel(preview.from_parcel_id, preview.from_parcel_esri)}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">{t('support.tools.changeParcel.to')}:</span>{' '}
                  {formatParcel(preview.to_parcel_id, preview.to_parcel_esri)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.changeParcel.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.changeParcel.order')}:</span> #
                {orderId}
              </p>
              <p>
                {formatParcel(preview.from_parcel_id, preview.from_parcel_esri)} →{' '}
                <span className="font-semibold">
                  {formatParcel(preview.to_parcel_id, preview.to_parcel_esri)}
                </span>
              </p>
              <p>{t('support.tools.changeParcel.confirmHint')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={changeMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={changeMutation.isPending}
                onClick={() => void applyChange()}
              >
                {t('support.tools.changeParcel.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
