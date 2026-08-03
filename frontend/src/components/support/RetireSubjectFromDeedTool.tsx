import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useCorrectOwnershipShare,
  useLookupRetireSubjectCandidates,
  useRetireSubjectFromDeed,
} from '@/hooks/useSupport';
import type {
  CorrectOwnershipShareResult,
  OwnershipShareValidation,
  RetireSubjectCandidate,
  RetireSubjectLookupResult,
  RetireSubjectResult,
} from '@/types';

type RetireSubjectFromDeedToolProps = {
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  initialRegisterTitle?: string | null;
  initialParcelEsri?: string | null;
  registerTitleOptions?: string[];
  parcelEsriOptions?: string[];
};

function formatShare(numerator: number | null, denominator: number | null): string {
  if (numerator == null && denominator == null) return '—';
  if (numerator != null && denominator != null) return `${numerator}/${denominator}`;
  if (numerator != null) return String(numerator);
  return `?/${denominator}`;
}

function pickContextValue(preferred: string | null | undefined, options: string[]): string {
  const preferredTrimmed = preferred?.trim() ?? '';
  if (preferredTrimmed) return preferredTrimmed;
  if (options.length === 1) return options[0];
  return '';
}

function ShareValidationBanner({
  validation,
  t,
}: {
  validation: OwnershipShareValidation;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const tone = validation.is_valid
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${tone}`}>
      <p className="font-semibold">
        {validation.is_valid
          ? t('support.tools.retireSubject.shareValid')
          : t('support.tools.retireSubject.shareInvalid')}
      </p>
      <p className="mt-1">
        {t('support.tools.retireSubject.shareTotal', {
          total: validation.total_display ?? '—',
          decimal:
            validation.total_decimal != null ? validation.total_decimal.toFixed(2) : '—',
          expected: validation.expected_display,
        })}
      </p>
      <p className="mt-1 text-xs opacity-90">{validation.message}</p>
    </div>
  );
}

export function RetireSubjectFromDeedTool({
  systemKey,
  isProduction,
  systemName,
  initialRegisterTitle = null,
  initialParcelEsri = null,
  registerTitleOptions = [],
  parcelEsriOptions = [],
}: RetireSubjectFromDeedToolProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const lookupMutation = useLookupRetireSubjectCandidates();
  const retireMutation = useRetireSubjectFromDeed();
  const shareMutation = useCorrectOwnershipShare();

  const registerOptions = useMemo(() => {
    const values = new Set(registerTitleOptions.map((item) => item.trim()).filter(Boolean));
    const preferred = initialRegisterTitle?.trim();
    if (preferred) values.add(preferred);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [initialRegisterTitle, registerTitleOptions]);

  const parcelOptions = useMemo(() => {
    const values = new Set(parcelEsriOptions.map((item) => item.trim()).filter(Boolean));
    const preferred = initialParcelEsri?.trim();
    if (preferred) values.add(preferred);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [initialParcelEsri, parcelEsriOptions]);

  const registerLocked = Boolean(initialRegisterTitle?.trim()) || registerOptions.length === 1;
  const parcelLocked = Boolean(initialParcelEsri?.trim()) || parcelOptions.length === 1;

  const [registerTitle, setRegisterTitle] = useState(() =>
    pickContextValue(initialRegisterTitle, registerOptions),
  );
  const [parcelEsri, setParcelEsri] = useState(() =>
    pickContextValue(initialParcelEsri, parcelOptions),
  );
  const [lookup, setLookup] = useState<RetireSubjectLookupResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<RetireSubjectResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoLookupKey, setAutoLookupKey] = useState<string | null>(null);

  const [correctDetailId, setCorrectDetailId] = useState<number | ''>('');
  const [shareNumerator, setShareNumerator] = useState('1');
  const [shareDenominator, setShareDenominator] = useState('3');
  const [sharePreview, setSharePreview] = useState<CorrectOwnershipShareResult | null>(null);
  const [shareConfirmOpen, setShareConfirmOpen] = useState(false);

  useEffect(() => {
    const nextTitle = pickContextValue(initialRegisterTitle, registerOptions);
    const nextParcel = pickContextValue(initialParcelEsri, parcelOptions);
    setRegisterTitle(nextTitle);
    setParcelEsri(nextParcel);
    setLookup(null);
    setSelectedIds([]);
    setPreview(null);
    setConfirmOpen(false);
    setCorrectDetailId('');
    setSharePreview(null);
    setShareConfirmOpen(false);
    setAutoLookupKey(null);
  }, [systemKey, initialRegisterTitle, initialParcelEsri, registerOptions, parcelOptions]);

  const activeCandidates = useMemo(
    () => (lookup?.candidates ?? []).filter((row) => !row.is_retired),
    [lookup],
  );
  const retiredCandidates = useMemo(
    () => (lookup?.candidates ?? []).filter((row) => row.is_retired),
    [lookup],
  );

  const correctionCandidates: RetireSubjectCandidate[] = useMemo(() => {
    if (preview && !preview.preview_only) {
      return preview.remaining_active;
    }
    if (preview?.preview_only) {
      return preview.remaining_active;
    }
    return activeCandidates;
  }, [activeCandidates, preview]);

  const currentShareValidation: OwnershipShareValidation | null =
    preview?.share_validation ?? lookup?.share_validation ?? null;

  const showShareCorrection =
    Boolean(currentShareValidation) &&
    currentShareValidation != null &&
    !currentShareValidation.is_valid &&
    correctionCandidates.length > 0;

  function resetDerivedState() {
    setLookup(null);
    setSelectedIds([]);
    setPreview(null);
    setSharePreview(null);
    setCorrectDetailId('');
    setAutoLookupKey(null);
  }

  function toggleSelected(deedDetailId: number) {
    setSelectedIds((current) =>
      current.includes(deedDetailId)
        ? current.filter((id) => id !== deedDetailId)
        : [...current, deedDetailId],
    );
    setPreview(null);
    setSharePreview(null);
  }

  async function runLookup(titleOverride?: string, parcelOverride?: string) {
    const title = (titleOverride ?? registerTitle).trim();
    const esri = (parcelOverride ?? parcelEsri).trim();
    if (!title || !esri) {
      toast.error(t('support.tools.retireSubject.missingInputs'));
      return;
    }
    try {
      const result = await lookupMutation.mutateAsync({
        systemKey,
        registerTitle: title,
        parcelEsri: esri,
      });
      setLookup(result);
      setSelectedIds([]);
      setPreview(null);
      setSharePreview(null);
      setCorrectDetailId('');
      if (result.candidates.length === 0) {
        toast(t('support.tools.retireSubject.noCandidates'));
      } else if (!result.share_validation.is_valid) {
        toast(t('support.tools.retireSubject.shareWarnToast'));
      }
    } catch (error) {
      setLookup(null);
      setSelectedIds([]);
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  // When both deed + parcel are already known from Support Center, load subjects automatically.
  useEffect(() => {
    const title = registerTitle.trim();
    const esri = parcelEsri.trim();
    if (!title || !esri) return;
    const key = `${systemKey}|${title}|${esri}`;
    if (autoLookupKey === key) return;
    setAutoLookupKey(key);
    void runLookup(title, esri);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional auto-load on context values
  }, [systemKey, registerTitle, parcelEsri, autoLookupKey]);

  async function runPreview() {
    if (!canEdit || selectedIds.length === 0) return;
    try {
      const result = await retireMutation.mutateAsync({
        systemKey,
        deedDetailIds: selectedIds,
        previewOnly: true,
      });
      setPreview(result);
      if (result.change_count === 0) {
        toast(t('support.tools.retireSubject.noChanges'));
      } else if (!result.share_validation.is_valid) {
        toast(t('support.tools.retireSubject.shareWarnToast'));
      }
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyChange() {
    if (!canEdit || selectedIds.length === 0) return;
    try {
      const result = await retireMutation.mutateAsync({
        systemKey,
        deedDetailIds: selectedIds,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.tools.retireSubject.success', {
          count: result.change_count,
        }),
      );
      setConfirmOpen(false);
      setPreview(result);
      setSelectedIds([]);
      if (lookup) {
        const refreshed = await lookupMutation.mutateAsync({
          systemKey,
          registerTitle: lookup.register_title,
          parcelEsri: lookup.parcel_esri,
        });
        setLookup(refreshed);
      }
      if (!result.share_validation.is_valid) {
        toast(t('support.tools.retireSubject.shareWarnToast'));
      }
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  async function runSharePreview() {
    if (!canEdit || correctDetailId === '') return;
    const numerator = Number(shareNumerator);
    const denominator = Number(shareDenominator);
    if (!Number.isInteger(numerator) || numerator < 0 || !Number.isInteger(denominator) || denominator <= 0) {
      toast.error(t('support.tools.retireSubject.shareInvalidInput'));
      return;
    }

    const contextCandidates =
      lookup?.candidates.map((row) =>
        preview && selectedIds.includes(row.deed_detail_id)
          ? { ...row, is_retired: true }
          : row,
      ) ?? correctionCandidates;

    try {
      const result = await shareMutation.mutateAsync({
        deedDetailId: correctDetailId,
        systemKey,
        shareNumerator: numerator,
        shareDenominator: denominator,
        previewOnly: true,
        contextCandidates,
      });
      setSharePreview(result);
    } catch (error) {
      setSharePreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applyShareChange() {
    if (!canEdit || correctDetailId === '' || !sharePreview) return;
    const contextCandidates =
      lookup?.candidates.map((row) => {
        let next = row;
        if (preview && selectedIds.includes(row.deed_detail_id)) {
          next = { ...next, is_retired: true };
        }
        if (next.deed_detail_id === correctDetailId) {
          next = {
            ...next,
            share_numerator: sharePreview.to_share_numerator,
            share_denominator: sharePreview.to_share_denominator,
          };
        }
        return next;
      }) ?? correctionCandidates;

    try {
      const result = await shareMutation.mutateAsync({
        deedDetailId: correctDetailId,
        systemKey,
        shareNumerator: sharePreview.to_share_numerator,
        shareDenominator: sharePreview.to_share_denominator,
        previewOnly: false,
        confirm: true,
        contextCandidates,
      });
      toast.success(
        t('support.tools.retireSubject.shareSuccess', {
          subject: result.subject_name,
          share: formatShare(result.to_share_numerator, result.to_share_denominator),
        }),
      );
      setShareConfirmOpen(false);
      setSharePreview(result);
      if (lookup) {
        const refreshed = await lookupMutation.mutateAsync({
          systemKey,
          registerTitle: lookup.register_title,
          parcelEsri: lookup.parcel_esri,
        });
        setLookup(refreshed);
        if (preview && !preview.preview_only) {
          setPreview({
            ...preview,
            share_validation: refreshed.share_validation,
            remaining_active: refreshed.candidates.filter((row) => !row.is_retired),
          });
        } else {
          setPreview(null);
        }
      }
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  const busy =
    lookupMutation.isPending || retireMutation.isPending || shareMutation.isPending;

  return (
    <Card className="border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <UserMinus style={{ width: 20, height: 20 }} />
        </span>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="pr-24 text-lg font-extrabold text-ink-900">
              {t('support.tools.retireSubject.title')}
            </h3>
            <p className="mt-1 text-sm text-ink-600">
              {t('support.tools.retireSubject.description')}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.retireSubject.registerTitle')}
              </label>
              {registerLocked && registerTitle ? (
                <div className="rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm font-semibold text-ink-900">
                  {registerTitle}
                  <span className="mt-0.5 block text-xs font-normal text-ink-500">
                    {t('support.tools.retireSubject.fromCurrentLookup')}
                  </span>
                </div>
              ) : registerOptions.length > 1 ? (
                <Select
                  value={registerTitle}
                  onChange={(event) => {
                    setRegisterTitle(event.target.value);
                    resetDerivedState();
                  }}
                >
                  <option value="">
                    {t('support.tools.retireSubject.pickRegisterPlaceholder')}
                  </option>
                  {registerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={registerTitle}
                  onChange={(event) => {
                    setRegisterTitle(event.target.value);
                    resetDerivedState();
                  }}
                  placeholder="C 240-6"
                />
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                {t('support.tools.retireSubject.parcelEsri')}
              </label>
              {parcelLocked && parcelEsri ? (
                <div className="rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm font-semibold text-ink-900">
                  {parcelEsri}
                  <span className="mt-0.5 block text-xs font-normal text-ink-500">
                    {t('support.tools.retireSubject.fromCurrentLookup')}
                  </span>
                </div>
              ) : parcelOptions.length > 1 ? (
                <Select
                  value={parcelEsri}
                  onChange={(event) => {
                    setParcelEsri(event.target.value);
                    resetDerivedState();
                  }}
                >
                  <option value="">{t('support.tools.retireSubject.pickParcelPlaceholder')}</option>
                  {parcelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={parcelEsri}
                  onChange={(event) => {
                    setParcelEsri(event.target.value);
                    resetDerivedState();
                  }}
                  placeholder="4-E-200"
                />
              )}
            </div>
          </div>

          {(!registerTitle.trim() || !parcelEsri.trim()) && (
            <p className="text-sm text-ink-600">
              {t('support.tools.retireSubject.needBothFromContext')}
            </p>
          )}

          {(!registerLocked || !parcelLocked) && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !registerTitle.trim() || !parcelEsri.trim()}
                loading={lookupMutation.isPending}
                onClick={() => void runLookup()}
              >
                {t('support.tools.retireSubject.findSubjects')}
              </Button>
            </div>
          )}

          {registerLocked && parcelLocked && lookupMutation.isPending && !lookup && (
            <p className="text-sm text-ink-500">{t('support.tools.retireSubject.loadingSubjects')}</p>
          )}

          {!canEdit && (
            <p className="text-xs text-ink-500">{t('support.tools.retireSubject.viewOnly')}</p>
          )}

          {lookup && (
            <div className="space-y-3">
              <p className="text-sm text-ink-700">
                {t('support.tools.retireSubject.lookupSummary', {
                  deed: lookup.register_title,
                  parcel: lookup.parcel_esri,
                  count: activeCandidates.length,
                })}
              </p>

              {!preview && (
                <ShareValidationBanner validation={lookup.share_validation} t={t} />
              )}

              {activeCandidates.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('support.tools.retireSubject.noActiveSubjects')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                      <tr>
                        <th className="px-3 py-2">{t('support.tools.retireSubject.select')}</th>
                        <th className="px-3 py-2">{t('support.tools.retireSubject.subject')}</th>
                        <th className="px-3 py-2">{t('support.tools.retireSubject.share')}</th>
                        <th className="px-3 py-2">{t('support.tools.retireSubject.status')}</th>
                        <th className="px-3 py-2">{t('support.tools.retireSubject.deedDetail')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {lookup.candidates.map((row) => (
                        <tr
                          key={row.deed_detail_id}
                          className={row.is_retired ? 'bg-ink-50/60 text-ink-500' : undefined}
                        >
                          <td className="px-3 py-2">
                            {!row.is_retired ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(row.deed_detail_id)}
                                onChange={() => toggleSelected(row.deed_detail_id)}
                                disabled={!canEdit}
                              />
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-ink-900">
                            <span className="font-semibold">{row.subject_name}</span>
                            <span className="mt-0.5 block text-xs text-ink-500">
                              #{row.subject_id}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-ink-700">
                            {formatShare(row.share_numerator, row.share_denominator)}
                          </td>
                          <td className="px-3 py-2 text-ink-700">
                            {row.is_retired
                              ? t('support.tools.retireSubject.retired')
                              : t('support.tools.retireSubject.active')}
                          </td>
                          <td className="px-3 py-2 text-ink-700">#{row.deed_detail_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {retiredCandidates.length > 0 && (
                <p className="text-xs text-ink-500">
                  {t('support.tools.retireSubject.alreadyRetired', {
                    count: retiredCandidates.length,
                  })}
                </p>
              )}

              {canEdit && activeCandidates.length > 0 && (
                <Button
                  type="button"
                  disabled={selectedIds.length === 0 || busy}
                  loading={retireMutation.isPending && !confirmOpen}
                  onClick={() => void runPreview()}
                >
                  {t('support.tools.retireSubject.preview')}
                </Button>
              )}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {preview.preview_only
                    ? t('support.tools.retireSubject.previewResult', {
                        count: preview.change_count,
                      })
                    : t('support.tools.retireSubject.appliedResult', {
                        count: preview.change_count,
                      })}
                </p>
                {preview.preview_only && preview.change_count > 0 && (
                  <Button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t('support.tools.retireSubject.apply')}
                  </Button>
                )}
              </div>

              <ShareValidationBanner validation={preview.share_validation} t={t} />

              <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                    <tr>
                      <th className="px-3 py-2">{t('support.tools.retireSubject.subject')}</th>
                      <th className="px-3 py-2">{t('support.tools.retireSubject.deedDetail')}</th>
                      <th className="px-3 py-2">{t('support.tools.retireSubject.from')}</th>
                      <th className="px-3 py-2">{t('support.tools.retireSubject.to')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {preview.changes.map((change) => (
                      <tr key={change.deed_detail_id}>
                        <td className="px-3 py-2 text-ink-900">
                          <span className="font-semibold">{change.subject_name}</span>
                          <span className="mt-0.5 block text-xs text-ink-500">
                            #{change.subject_id}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-ink-700">#{change.deed_detail_id}</td>
                        <td className="px-3 py-2 text-ink-700">
                          {change.from_is_retired
                            ? t('support.tools.retireSubject.retired')
                            : t('support.tools.retireSubject.active')}
                        </td>
                        <td className="px-3 py-2 font-semibold text-ink-900">
                          {t('support.tools.retireSubject.retired')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showShareCorrection && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {t('support.tools.retireSubject.correctShareTitle')}
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  {t('support.tools.retireSubject.correctShareHint')}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">
                    {t('support.tools.retireSubject.correctSubject')}
                  </label>
                  <Select
                    value={correctDetailId === '' ? '' : String(correctDetailId)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCorrectDetailId(value ? Number(value) : '');
                      setSharePreview(null);
                      const selected = correctionCandidates.find(
                        (row) => row.deed_detail_id === Number(value),
                      );
                      if (selected?.share_numerator != null) {
                        setShareNumerator(String(selected.share_numerator));
                      }
                      if (selected?.share_denominator != null) {
                        setShareDenominator(String(selected.share_denominator));
                      }
                    }}
                    disabled={!canEdit}
                  >
                    <option value="">{t('support.tools.retireSubject.correctSubjectPlaceholder')}</option>
                    {correctionCandidates.map((row) => (
                      <option key={row.deed_detail_id} value={row.deed_detail_id}>
                        {row.subject_name} ·{' '}
                        {formatShare(row.share_numerator, row.share_denominator)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">
                    {t('support.tools.retireSubject.numerator')}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={shareNumerator}
                    onChange={(event) => {
                      setShareNumerator(event.target.value);
                      setSharePreview(null);
                    }}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">
                    {t('support.tools.retireSubject.denominator')}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={shareDenominator}
                    onChange={(event) => {
                      setShareDenominator(event.target.value);
                      setSharePreview(null);
                    }}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <Button
                type="button"
                disabled={!canEdit || correctDetailId === '' || busy}
                loading={shareMutation.isPending && !shareConfirmOpen}
                onClick={() => void runSharePreview()}
              >
                {t('support.tools.retireSubject.previewShare')}
              </Button>

              {sharePreview && (
                <div className="space-y-3">
                  <ShareValidationBanner validation={sharePreview.share_validation} t={t} />
                  <p className="text-sm text-ink-700">
                    {sharePreview.subject_name}:{' '}
                    {formatShare(
                      sharePreview.from_share_numerator,
                      sharePreview.from_share_denominator,
                    )}{' '}
                    →{' '}
                    <span className="font-semibold">
                      {formatShare(
                        sharePreview.to_share_numerator,
                        sharePreview.to_share_denominator,
                      )}
                    </span>
                  </p>
                  {sharePreview.preview_only && (
                    <Button
                      type="button"
                      disabled={!canEdit || busy}
                      onClick={() => setShareConfirmOpen(true)}
                    >
                      {t('support.tools.retireSubject.applyShare')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.retireSubject.confirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                <span className="font-semibold">{t('support.tools.retireSubject.changes')}:</span>{' '}
                {preview.change_count}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {preview.changes.map((change) => (
                  <li key={change.deed_detail_id}>
                    {change.subject_name} (#{change.subject_id}) → IsRetired = 1
                  </li>
                ))}
              </ul>
              <ShareValidationBanner validation={preview.share_validation} t={t} />
              <p>{t('support.tools.retireSubject.confirmHint')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={retireMutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={retireMutation.isPending}
                onClick={() => void applyChange()}
              >
                {t('support.tools.retireSubject.confirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {shareConfirmOpen && sharePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.tools.retireSubject.confirmShareTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <div className="space-y-2 text-sm text-ink-700">
              <p>
                {sharePreview.subject_name}:{' '}
                {formatShare(
                  sharePreview.from_share_numerator,
                  sharePreview.from_share_denominator,
                )}{' '}
                →{' '}
                <span className="font-semibold">
                  {formatShare(
                    sharePreview.to_share_numerator,
                    sharePreview.to_share_denominator,
                  )}
                </span>
              </p>
              <ShareValidationBanner validation={sharePreview.share_validation} t={t} />
              <p>{t('support.tools.retireSubject.confirmShareHint')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={shareMutation.isPending}
                onClick={() => setShareConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                loading={shareMutation.isPending}
                onClick={() => void applyShareChange()}
              >
                {t('support.tools.retireSubject.confirmShareApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
