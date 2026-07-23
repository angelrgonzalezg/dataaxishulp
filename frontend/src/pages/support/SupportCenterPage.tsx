import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, LifeBuoy, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ProductionEnvironmentBanner } from '@/components/support/ProductionEnvironmentBanner';
import { TableFrameCard } from '@/components/support/TableFrameCard';
import { extractErrorMessage } from '@/api/client';
import {
  useDeedHistorySupport,
  useOrderSupport,
  useOrderSupportByKenmerk,
  useOrderSupportByRegisterTitle,
  useParcelSupportById,
  useParcelSupportByMeetBrief,
} from '@/hooks/useSupport';
import { useSystems } from '@/hooks/useSystems';
import type { SupportLookup, TableFrame } from '@/types';

const SYSTEM_STORAGE_KEY = 'dataaxis-hulp-support-system';

type EntryMode =
  | 'order'
  | 'kenmerk'
  | 'register_deed'
  | 'deed_history'
  | 'parcel_number'
  | 'meet_brief';

function groupFrames(frames: TableFrame[]) {
  const groups: Array<{ key: string; label: string; frames: TableFrame[] }> = [];
  const indexByKey = new Map<string, number>();

  for (const frame of frames) {
    const key = frame.section ?? 'general';
    const label = frame.sectionLabel ?? 'General';
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, groups.length);
      groups.push({ key, label, frames: [frame] });
    } else {
      groups[existing].frames.push(frame);
    }
  }

  return groups;
}

export function SupportCenterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: systems } = useSystems();
  const activeSystems = useMemo(
    () => (systems ?? []).filter((system) => system.is_active && system.has_connection_url),
    [systems],
  );

  const [systemKey, setSystemKey] = useState(
    () => localStorage.getItem(SYSTEM_STORAGE_KEY) ?? 'kadaster_statia',
  );
  const [entryMode, setEntryMode] = useState<EntryMode>('order');
  const [orderInput, setOrderInput] = useState('5303');
  const [kenmerkInput, setKenmerkInput] = useState('107/2026');
  const [registerInput, setRegisterInput] = useState('B 156-3');
  const [deedHistoryInput, setDeedHistoryInput] = useState('C 23-92');
  const [parcelInput, setParcelInput] = useState('12255');
  const [meetBriefInput, setMeetBriefInput] = useState('0/1949');

  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [activeKenmerk, setActiveKenmerk] = useState<string | null>(null);
  const [activeRegisterTitle, setActiveRegisterTitle] = useState<string | null>(null);
  const [activeDeedHistoryTitle, setActiveDeedHistoryTitle] = useState<string | null>(null);
  const [activeParcelId, setActiveParcelId] = useState<number | null>(null);
  const [activeMeetBrief, setActiveMeetBrief] = useState<string | null>(null);

  const selectedSystem = activeSystems.find((system) => system.system_key === systemKey)
    ?? activeSystems[0]
    ?? null;

  useEffect(() => {
    if (!activeSystems.length) return;
    const exists = activeSystems.some((system) => system.system_key === systemKey);
    if (!exists) {
      setSystemKey(activeSystems[0].system_key);
    }
  }, [activeSystems, systemKey]);

  useEffect(() => {
    if (selectedSystem) {
      localStorage.setItem(SYSTEM_STORAGE_KEY, selectedSystem.system_key);
    }
  }, [selectedSystem]);

  const activeSystemKey = selectedSystem?.system_key ?? null;

  const orderQuery = useOrderSupport(
    entryMode === 'order' ? activeOrderId : null,
    activeSystemKey,
  );
  const kenmerkQuery = useOrderSupportByKenmerk(
    entryMode === 'kenmerk' ? activeKenmerk : null,
    activeSystemKey,
  );
  const registerQuery = useOrderSupportByRegisterTitle(
    entryMode === 'register_deed' ? activeRegisterTitle : null,
    activeSystemKey,
  );
  const deedHistoryQuery = useDeedHistorySupport(
    entryMode === 'deed_history' ? activeDeedHistoryTitle : null,
    activeSystemKey,
  );
  const parcelIdQuery = useParcelSupportById(
    entryMode === 'parcel_number' ? activeParcelId : null,
    activeSystemKey,
  );
  const meetBriefQuery = useParcelSupportByMeetBrief(
    entryMode === 'meet_brief' ? activeMeetBrief : null,
    activeSystemKey,
  );

  const activeQuery =
    entryMode === 'order'
      ? orderQuery
      : entryMode === 'kenmerk'
        ? kenmerkQuery
        : entryMode === 'register_deed'
          ? registerQuery
          : entryMode === 'deed_history'
            ? deedHistoryQuery
            : entryMode === 'parcel_number'
              ? parcelIdQuery
              : meetBriefQuery;

  const data = activeQuery.data as SupportLookup | undefined;
  const { isFetching, isError, error } = activeQuery;

  const frameGroups = useMemo(
    () => (data?.frames ? groupFrames(data.frames) : []),
    [data?.frames],
  );

  function clearActiveLookups() {
    setActiveOrderId(null);
    setActiveKenmerk(null);
    setActiveRegisterTitle(null);
    setActiveDeedHistoryTitle(null);
    setActiveParcelId(null);
    setActiveMeetBrief(null);
  }

  function onSystemChange(nextKey: string) {
    setSystemKey(nextKey);
    clearActiveLookups();
  }

  function onSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSystemKey) return;

    if (entryMode === 'order') {
      const orderId = Number(orderInput.trim());
      if (!Number.isFinite(orderId) || orderId <= 0) return;
      clearActiveLookups();
      setActiveOrderId(orderId);
      return;
    }

    if (entryMode === 'kenmerk') {
      const kenmerk = kenmerkInput.trim();
      if (!kenmerk) return;
      clearActiveLookups();
      setActiveKenmerk(kenmerk);
      return;
    }

    if (entryMode === 'register_deed') {
      const title = registerInput.trim();
      if (!title) return;
      clearActiveLookups();
      setActiveRegisterTitle(title);
      return;
    }

    if (entryMode === 'deed_history') {
      const title = deedHistoryInput.trim();
      if (!title) return;
      clearActiveLookups();
      setActiveDeedHistoryTitle(title);
      return;
    }

    if (entryMode === 'parcel_number') {
      const parcelId = Number(parcelInput.trim());
      if (!Number.isFinite(parcelId) || parcelId <= 0) return;
      clearActiveLookups();
      setActiveParcelId(parcelId);
      return;
    }

    const meetBrief = meetBriefInput.trim();
    if (!meetBrief) return;
    clearActiveLookups();
    setActiveMeetBrief(meetBrief);
  }

  function selectCandidateParcel(parcelId: number) {
    setEntryMode('parcel_number');
    setParcelInput(String(parcelId));
    clearActiveLookups();
    setActiveParcelId(parcelId);
  }

  function selectCandidateOrder(orderId: number) {
    setEntryMode('order');
    setOrderInput(String(orderId));
    clearActiveLookups();
    setActiveOrderId(orderId);
  }

  const searchValue =
    entryMode === 'order'
      ? orderInput
      : entryMode === 'kenmerk'
        ? kenmerkInput
        : entryMode === 'register_deed'
          ? registerInput
          : entryMode === 'deed_history'
            ? deedHistoryInput
            : entryMode === 'parcel_number'
              ? parcelInput
              : meetBriefInput;

  const setSearchValue =
    entryMode === 'order'
      ? setOrderInput
      : entryMode === 'kenmerk'
        ? setKenmerkInput
        : entryMode === 'register_deed'
          ? setRegisterInput
          : entryMode === 'deed_history'
            ? setDeedHistoryInput
            : entryMode === 'parcel_number'
              ? setParcelInput
              : setMeetBriefInput;

  const searchLabel =
    entryMode === 'order'
      ? t('support.orderId')
      : entryMode === 'kenmerk'
        ? t('support.kenmerk')
        : entryMode === 'register_deed'
          ? t('support.registerTitle')
          : entryMode === 'deed_history'
            ? t('support.deedHistoryTitle')
            : entryMode === 'parcel_number'
              ? t('support.parcelId')
              : t('support.meetBrief');

  const searchPlaceholder =
    entryMode === 'order'
      ? '5303'
      : entryMode === 'kenmerk'
        ? '107/2026'
        : entryMode === 'register_deed'
          ? 'B 156-3'
          : entryMode === 'deed_history'
            ? 'C 23-92'
            : entryMode === 'parcel_number'
              ? '12255'
              : '0/1949';

  const isProduction = selectedSystem?.is_production ?? false;
  const isOrderLikeEntry =
    data?.entry === 'order' || data?.entry === 'kenmerk' || data?.entry === 'register_deed';
  const isDeedHistoryEntry = data?.entry === 'deed_history';
  const isParcelLikeEntry =
    data?.entry === 'parcel_number' || data?.entry === 'meet_brief';

  return (
    <div className="-mx-8 -mt-8">
      {isProduction && selectedSystem && (
        <ProductionEnvironmentBanner systemName={selectedSystem.name} />
      )}

      <div className="mx-auto max-w-7xl space-y-6 px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white shadow-glow"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <LifeBuoy style={{ width: 24, height: 24 }} />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">{t('support.title')}</h2>
            <p className="mt-2 max-w-2xl text-white/80">{t('support.description')}</p>
          </div>
        </div>
      </motion.div>

      <Card className="p-6">
        <form onSubmit={onSearch} className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="lg:w-72">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              {t('support.database')}
            </label>
            <Select
              value={selectedSystem?.system_key ?? ''}
              onChange={(event) => onSystemChange(event.target.value)}
            >
              {activeSystems.map((system) => (
                <option key={system.system_key} value={system.system_key}>
                  {system.is_production ? `⚠ PROD · ${system.name}` : system.name}
                </option>
              ))}
            </Select>
            {selectedSystem && (
              <p className="mt-1 text-xs text-ink-400">
                {selectedSystem.env_var_name}
                {selectedSystem.database_name ? ` · ${selectedSystem.database_name}` : ''}
              </p>
            )}
          </div>

          <div className="lg:w-56">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              {t('support.entryMode')}
            </label>
            <Select
              value={entryMode}
              onChange={(event) => setEntryMode(event.target.value as EntryMode)}
            >
              <option value="order">{t('support.entryOrder')}</option>
              <option value="kenmerk">{t('support.entryKenmerk')}</option>
              <option value="register_deed">{t('support.entryRegister')}</option>
              <option value="deed_history">{t('support.entryDeedHistory')}</option>
              <option value="parcel_number">{t('support.entryParcelNumber')}</option>
              <option value="meet_brief">{t('support.entryMeetBrief')}</option>
            </Select>
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink-700">{searchLabel}</label>
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={searchPlaceholder}
              icon={<Search style={{ width: 18, height: 18 }} />}
            />
          </div>

          <Button type="submit" loading={isFetching}>
            <Search style={{ width: 18, height: 18 }} />
            {t('support.lookup')}
          </Button>
        </form>
      </Card>

      {isError && (
        <Card className="p-6 text-sm text-red-600">{extractErrorMessage(error)}</Card>
      )}

      {isFetching && !data && (
        <Card className="p-8 text-center text-sm text-ink-500">{t('common.loading')}</Card>
      )}

      {isOrderLikeEntry && data && data.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.orderId')}</p>
            <p className="mt-1 text-xl font-extrabold text-ink-900">
              {data.order_id > 0 ? data.order_id : '—'}
            </p>
            <p className="text-xs text-ink-500">{data.summary.kenmerk ?? data.kenmerk ?? '—'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.registerTitle')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-900">
              {data.summary.register_title ?? data.register_title ?? '—'}
            </p>
            <p className="text-xs text-ink-500">{data.summary.transaction_id ?? '—'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.requester')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-900">
              {data.summary.requester ?? '—'}
            </p>
            <p className="text-xs text-ink-500">{data.summary.request_type ?? '—'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.counts')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {data.summary.product_count} {t('support.products')} · {data.summary.parcel_count}{' '}
              {t('support.parcels')}
            </p>
            <p className="text-xs text-ink-500">{data.summary.status ?? '—'}</p>
          </Card>
        </div>
      )}

      {isDeedHistoryEntry && data && data.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.deedHistoryTitle')}</p>
            <p className="mt-1 text-xl font-extrabold text-ink-900">{data.summary.register_title}</p>
            <p className="text-xs text-ink-500">
              {t('support.seedDeeds')}: {data.summary.seed_deed_count}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.historyGraph')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {data.summary.history_deed_count} {t('support.historyDeeds')} ·{' '}
              {t('support.maxDepth')}: {data.summary.max_depth}
            </p>
            <p className="text-xs text-ink-500">
              {data.summary.history_deed_detail_count} DeedDetail
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.relatedRecords')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {data.summary.parcel_count} {t('support.parcels')} · {data.summary.subject_count}{' '}
              {t('support.subjects')}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.linkedOrders')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {data.summary.order_link_count} {t('support.orders')}
            </p>
            <p className="text-xs text-ink-500">{t('support.deedHistoryHint')}</p>
          </Card>
        </div>
      )}

      {isParcelLikeEntry && data && data.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.parcelId')}</p>
            <p className="mt-1 text-xl font-extrabold text-ink-900">{data.parcel_id}</p>
            <p className="text-xs text-ink-500">{data.summary.meet_brief ?? '—'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.location')}</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-900">
              {data.summary.location ?? '—'}
            </p>
            <p className="text-xs text-ink-500">
              {data.summary.sheet ?? '—'} · {data.summary.size ?? '—'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.andereDetails')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {t('support.titles')}: {data.summary.title_details} · {t('support.mortgages')}:{' '}
              {data.summary.mortgage_details} · {t('support.seizures')}:{' '}
              {data.summary.seizure_details}
            </p>
            <p className="text-xs text-ink-500">
              {t('support.limitedRights')}: {data.summary.limited_rights_details} ·{' '}
              {t('support.shareTitles')}: {data.summary.share_details}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.counts')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {data.summary.order_links} {t('support.orderLinks')}
            </p>
            <p className="text-xs text-ink-500">{data.summary.status ?? '—'}</p>
          </Card>
        </div>
      )}

      {isParcelLikeEntry && data && data.parcel_id > 0 && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FileText style={{ width: 20, height: 20 }} />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-900">{t('inzage.generateTitle')}</p>
              <p className="text-sm text-ink-500">{t('inzage.generateHint')}</p>
            </div>
          </div>
          <Button
            onClick={() =>
              navigate(
                `/support/inzage?parcelId=${data.parcel_id}&systemKey=${encodeURIComponent(
                  activeSystemKey ?? '',
                )}&variant=object`,
              )
            }
          >
            <FileText style={{ width: 18, height: 18 }} />
            {t('inzage.generate')}
          </Button>
        </Card>
      )}

      {isOrderLikeEntry && data && data.candidates && data.candidates.length > 1 && (
        <Card className="p-6">
          <h3 className="text-sm font-bold text-ink-900">{t('support.multipleOrders')}</h3>
          <p className="mt-1 text-sm text-ink-500">{t('support.multipleOrdersHint')}</p>
          <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-200">
            {data.candidates.map((candidate) => (
              <button
                key={candidate.order_id}
                type="button"
                onClick={() => selectCandidateOrder(candidate.order_id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-brand-50"
              >
                <div>
                  <p className="font-semibold text-ink-900">
                    {t('support.orderId')} #{candidate.order_id}
                  </p>
                  <p className="text-xs text-ink-500">
                    {candidate.kenmerk ?? '—'} · {candidate.requester ?? '—'}
                    {candidate.register_title ? ` · ${candidate.register_title}` : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold text-brand-700">{t('support.openOrder')}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {isParcelLikeEntry && data && data.candidates && data.candidates.length > 1 && (
        <Card className="p-6">
          <h3 className="text-sm font-bold text-ink-900">{t('support.multipleParcels')}</h3>
          <p className="mt-1 text-sm text-ink-500">{t('support.multipleParcelsHint')}</p>
          <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-200">
            {data.candidates.map((candidate) => (
              <button
                key={candidate.parcel_id}
                type="button"
                onClick={() => selectCandidateParcel(candidate.parcel_id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-brand-50"
              >
                <div>
                  <p className="font-semibold text-ink-900">#{candidate.parcel_id}</p>
                  <p className="text-xs text-ink-500">
                    {candidate.meet_brief ?? '—'} · {candidate.location ?? '—'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-brand-700">{t('support.openParcel')}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {data && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-500">
              {t('support.tableFrames')} ({data.frames.length})
            </h3>
            <p className="text-xs text-ink-400">
              {t('support.system')}: {data.system_name} ({data.system_key})
              {data.is_production ? ` · ${t('support.production')}` : ''}
            </p>
          </div>

          {frameGroups.map((group) => (
            <div key={group.key} className="space-y-4">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-extrabold uppercase tracking-wide text-brand-800">
                  {group.label}
                </h4>
                <div className="h-px flex-1 bg-brand-100" />
                <span className="text-xs text-ink-400">
                  {group.frames.length} {t('support.frames')}
                </span>
              </div>
              {group.frames.map((frame) => (
                <TableFrameCard key={frame.key} frame={frame} />
              ))}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
