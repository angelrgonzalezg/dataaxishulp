import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useChangeOrderDeed,
  useOrderDeedLinks,
  useSearchDeedByTitle,
} from '@/hooks/useSupport';
import type { ChangeOrderDeedResult, DeedTitleCandidate } from '@/types';

type ChangeDeedOnOrderToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  orderId: number;
};

function formatDeed(
  id: number | null,
  title: string | null,
  approvalId?: number | null,
): string {
  const base =
    id != null && title
      ? `#${id} · ${title}`
      : id != null
        ? `#${id}`
        : title
          ? title
          : '—';
  if (approvalId == null) return `${base} · approvalId=—`;
  return `${base} · approvalId=${approvalId}`;
}

export function ChangeDeedOnOrderTool({
  systemKey,
  isProduction,
  systemName,
  orderId,
}: ChangeDeedOnOrderToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const linksQuery = useOrderDeedLinks(orderId, systemKey);
  const searchMutation = useSearchDeedByTitle();
  const changeMutation = useChangeOrderDeed();

  const [selectedLinkId, setSelectedLinkId] = useState<number | ''>('');
  const [newTitle, setNewTitle] = useState('');
  const [candidates, setCandidates] = useState<DeedTitleCandidate[]>([]);
  const [selectedDeedId, setSelectedDeedId] = useState<number | ''>('');
  const [preview, setPreview] = useState<ChangeOrderDeedResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const links = linksQuery.data?.links ?? [];

  useEffect(() => {
    setSelectedLinkId('');
    setNewTitle('');
    setCandidates([]);
    setSelectedDeedId('');
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
    const title = newTitle.trim();
    if (!title) {
      toast.error(t('support.tools.changeDeed.missingTitle'));
      return;
    }
    try {
      const result = await searchMutation.mutateAsync({ systemKey, title });
      setCandidates(result.candidates);
      const preferred =
        result.candidates.find((item) => item.approval_id === 3) ??
        (result.candidates.length === 1 ? result.candidates[0] : null);
      setSelectedDeedId(preferred ? preferred.deed_id : '');
      setPreview(null);
      if (result.candidates.length === 0) {
        toast(t('support.tools.changeDeed.noDeedFound'));
      }
    } catch (error) {
      setCandidates([]);
      setSelectedDeedId('');
      toast.error(extractErrorMessage(error));
    }
  }

  async function runPreview() {
    if (!canEdit || selectedLinkId === '' || selectedDeedId === '') return;
    try {
      const result = await changeMutation.mutateAsync({
        orderId,
        systemKey,
        linkId: selectedLinkId,
        newDeedId: selectedDeedId,
        previewOnly: true,
      });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!canEdit || selectedLinkId === '' || selectedDeedId === '') return;
    try {
      const result = await changeMutation.mutateAsync({
        orderId,
        systemKey,
        linkId: selectedLinkId,
        newDeedId: selectedDeedId,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.tools.changeDeed.success', {
          order: result.order_id,
          from: formatDeed(result.from_deed_id, result.from_register_title ?? result.from_akte),
          to: formatDeed(result.to_deed_id, result.to_register_title),
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
          <FileText style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.changeDeed.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.changeDeed.description')}
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-700">
              {t('support.tools.changeDeed.order')}
            </p>
            <div className="rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-900">
              #{orderId}
              <span className="mt-0.5 block text-xs font-normal text-ink-500">
                {t('support.tools.changeDeed.fromCurrentLookup')}
              </span>
            </div>
          </div>

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.changeDeed.viewOnly')}</p>
          )}

          {linksQuery.isError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {extractErrorMessage(linksQuery.error)}
            </p>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink-800">
              {t('support.tools.changeDeed.currentLinks')}
            </p>
            {links.length === 0 && !linksQuery.isFetching ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('support.tools.changeDeed.noLinks')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                    <tr>
                      <th className="px-3 py-2">{t('support.tools.changeDeed.select')}</th>
                      <th className="px-3 py-2">{t('support.tools.changeDeed.deed')}</th>
                      <th className="px-3 py-2">{t('support.tools.changeDeed.akte')}</th>
                      <th className="px-3 py-2">{t('support.tools.changeDeed.linkId')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {links.map((link) => (
                      <tr key={link.link_id}>
                        <td className="px-3 py-2">
                          <input
                            type="radio"
                            name="order-deed-link"
                            checked={selectedLinkId === link.link_id}
                            onChange={() => {
                              setSelectedLinkId(link.link_id);
                              setPreview(null);
                            }}
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-3 py-2 text-ink-900">
                          {formatDeed(link.deed_id, link.register_title)}
                        </td>
                        <td className="px-3 py-2 text-ink-700">{link.akte ?? '—'}</td>
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
                {t('support.tools.changeDeed.newTitle')}
              </label>
              <Input
                value={newTitle}
                onChange={(event) => {
                  setNewTitle(event.target.value);
                  setCandidates([]);
                  setSelectedDeedId('');
                  setPreview(null);
                }}
                placeholder="C 200-18"
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={!canEdit || busy || !newTitle.trim()}
                loading={searchMutation.isPending}
                onClick={() => void searchReplacement()}
              >
                {t('support.tools.changeDeed.findDeed')}
              </Button>
            </div>
          </div>

          {candidates.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.changeDeed.replacement')}
              </label>
              <Select
                value={selectedDeedId === '' ? '' : String(selectedDeedId)}
                onChange={(event) => {
                  setSelectedDeedId(event.target.value ? Number(event.target.value) : '');
                  setPreview(null);
                }}
                disabled={!canEdit}
              >
                <option value="">{t('support.tools.changeDeed.pickDeed')}</option>
                {candidates.map((candidate) => (
                  <option key={candidate.deed_id} value={candidate.deed_id}>
                    {formatDeed(
                      candidate.deed_id,
                      candidate.register_title,
                      candidate.approval_id,
                    )}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <Button
            type="button"
            disabled={
              !canEdit || busy || selectedLinkId === '' || selectedDeedId === ''
            }
            loading={changeMutation.isPending && !confirmOpen}
            onClick={() => void runPreview()}
          >
            {t('support.tools.changeDeed.preview')}
          </Button>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {preview.preview_only
                    ? t('support.tools.changeDeed.previewResult')
                    : t('support.tools.changeDeed.appliedResult')}
                </p>
                {preview.preview_only && (
                  <Button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t('support.tools.changeDeed.apply')}
                  </Button>
                )}
              </div>
              <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700">
                <p>
                  <span className="font-semibold">{t('support.tools.changeDeed.from')}:</span>{' '}
                  {formatDeed(
                    preview.from_deed_id,
                    preview.from_register_title ?? preview.from_akte,
                  )}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">{t('support.tools.changeDeed.to')}:</span>{' '}
                  {formatDeed(preview.to_deed_id, preview.to_register_title)}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {t('support.tools.changeDeed.akteUpdate', {
                    akte: preview.to_akte,
                  })}
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
              {t('support.tools.changeDeed.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.changeDeed.order')}:</span> #
                {orderId}
              </p>
              <p>
                {formatDeed(
                  preview.from_deed_id,
                  preview.from_register_title ?? preview.from_akte,
                )}{' '}
                →{' '}
                <span className="font-semibold">
                  {formatDeed(preview.to_deed_id, preview.to_register_title)}
                </span>
              </p>
              <p>{t('support.tools.changeDeed.confirmHint')}</p>
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
                {t('support.tools.changeDeed.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
