import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardList, FileText, LifeBuoy, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ResolutionToolsMenu } from '@/components/support/ResolutionToolsMenu';
import { ProductionEnvironmentBanner } from '@/components/support/ProductionEnvironmentBanner';
import { TableFrameCard } from '@/components/support/TableFrameCard';
import { extractErrorMessage } from '@/api/client';
import toast from 'react-hot-toast';
import {
  useDeedHistorySupport,
  useOrderSupport,
  useOrderSupportByKenmerk,
  useOrderSupportByRegisterTitle,
  useParcelSupportById,
  useParcelSupportByMeetBrief,
} from '@/hooks/useSupport';
import { useSystems } from '@/hooks/useSystems';
import type {
  DeedTypeAkteOption,
  OrderSupportLookup,
  ParcelSupportLookup,
  SupportLookup,
  TableFrame,
} from '@/types';

const SYSTEM_STORAGE_KEY = 'dataaxis-hulp-support-system';

type EntryMode =
  | 'order'
  | 'kenmerk'
  | 'register_deed'
  | 'deed_history'
  | 'parcel_number'
  | 'meet_brief';

function isTerenoDialect(dialect: string | null | undefined): boolean {
  return dialect === 'tereno';
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function extractDeedTypeAkteOptions(frames: TableFrame[] | undefined): DeedTypeAkteOption[] {
  if (!frames?.length) return [];
  const frame =
    frames.find((item) => item.key === 'deeds_with_legal_fact') ??
    frames.find((item) => item.key === 'seed_deeds' || item.key === 'deeds');
  if (!frame) return [];

  const registerById = new Map<number, string>();
  const registersFrame = frames.find(
    (item) => item.key === 'legal_fact_registers' || item.key === 'registers',
  );
  for (const row of registersFrame?.rows ?? []) {
    const id =
      asNullableNumber(row.id) ??
      asNullableNumber(row.Id) ??
      asNullableNumber(row.RegisterID);
    const register = asNullableString(row.register) ?? asNullableString(row.Register);
    if (id != null && register) registerById.set(id, register);
  }

  const seen = new Set<number>();
  const options: DeedTypeAkteOption[] = [];

  for (const row of frame.rows) {
    const deedId =
      asNullableNumber(row.deedId) ??
      asNullableNumber(row.id) ??
      asNullableNumber(row.Id);
    if (deedId == null || deedId <= 0 || seen.has(deedId)) continue;
    seen.add(deedId);

    const registerFk =
      asNullableNumber(row.legalFactRegisterId) ??
      asNullableNumber(row.DeedTypeId) ??
      asNullableNumber(row.deedTypeId);
    const register =
      asNullableString(row.register) ??
      (registerFk != null ? registerById.get(registerFk) ?? null : null);
    const segment = asNullableString(row.segment) ?? asNullableString(row.Segment);
    const number = asNullableString(row.number) ?? asNullableString(row.Number);
    const titleFromParts =
      register && segment && number ? `${register} ${segment}-${number}` : null;

    options.push({
      deedId,
      title: asNullableString(row.title) ?? titleFromParts ?? `#${deedId}`,
      legalFactId: asNullableNumber(row.legalFactId),
      legalFactCode: asNullableString(row.legalFactCode),
      legalFactNameNl: asNullableString(row.legalFactNameNl),
    });
  }

  return options;
}

function extractParcelEsriOptions(data: SupportLookup | undefined): string[] {
  if (!data?.found) return [];
  const values = new Set<string>();

  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) values.add(trimmed);
  };

  if ('meet_brief' in data) push(data.meet_brief);
  if (data.summary && 'meet_brief' in data.summary) push(data.summary.meet_brief);

  if (data.summary && 'linked_parcels' in data.summary) {
    for (const parcel of data.summary.linked_parcels ?? []) {
      push(parcel.meet_brief);
    }
  }

  const parcelFrames =
    data.frames?.filter((frame) =>
      ['parcel', 'parcels', 'history_parcels'].includes(frame.key),
    ) ?? [];

  for (const frame of parcelFrames) {
    for (const row of frame.rows) {
      push(
        asNullableString(row.esri) ??
          asNullableString(row.MeetbriefInf) ??
          asNullableString(row.Meetbriefinf) ??
          asNullableString(row.PerceelESRI) ??
          asNullableString(row.PerceelEsri) ??
          asNullableString(row.meet_brief) ??
          asNullableString(row.meetBrief),
      );
    }
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}

function extractRegisterTitleOptions(data: SupportLookup | undefined): string[] {
  if (!data?.found) return [];
  const values = new Set<string>();

  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !trimmed.startsWith('#')) values.add(trimmed);
  };

  if ('register_title' in data) push(data.register_title);
  if (data.summary && 'register_title' in data.summary) push(data.summary.register_title);

  for (const deed of extractDeedTypeAkteOptions(data.frames)) {
    push(deed.title);
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}

type LinkedParcelOrder = NonNullable<
  NonNullable<ParcelSupportLookup['summary']>['linked_orders']
>[number];

type LinkedOrderParcel = NonNullable<
  NonNullable<OrderSupportLookup['summary']>['linked_parcels']
>[number];

function getLinkedParcelOrders(data: SupportLookup | undefined): LinkedParcelOrder[] {
  if (!data || (data.entry !== 'parcel_number' && data.entry !== 'meet_brief')) {
    return [];
  }

  const fromSummary = data.summary?.linked_orders;
  if (fromSummary && fromSummary.length > 0) {
    return fromSummary;
  }

  const productsFrame = data.frames.find((frame) => frame.key === 'order_products');
  const productCountByOrder = new Map<number, number>();
  for (const row of productsFrame?.rows ?? []) {
    const orderId =
      asNullableNumber(row.orderId) ??
      asNullableNumber(row.AgendaO_IDGroup) ??
      asNullableNumber(row.agendaO_IDGroup);
    if (orderId == null) continue;
    productCountByOrder.set(orderId, (productCountByOrder.get(orderId) ?? 0) + 1);
  }

  const ordersFrame = data.frames.find((frame) => frame.key === 'orders');
  if (ordersFrame?.rows.length) {
    return ordersFrame.rows
      .map((row) => {
        const orderId =
          asNullableNumber(row.id) ??
          asNullableNumber(row.Id) ??
          asNullableNumber(row.Agenda_ID) ??
          asNullableNumber(row.agenda_ID) ??
          0;
        return {
          order_id: orderId,
          transaction_id:
            asNullableString(row.transactionId) ?? asNullableString(row.TransactionId),
          notary_code:
            asNullableString(row.notaryCode) ??
            asNullableString(row.Agenda_NotaryCode) ??
            asNullableString(row.agenda_NotaryCode),
          requester:
            asNullableString(row.requester) ??
            asNullableString(row.Agenda_Requester) ??
            asNullableString(row.agenda_Requester),
          register_date:
            asNullableString(row.registerDate) ??
            asNullableString(row.Agenda_RegisterDate) ??
            asNullableString(row.agenda_RegisterDate),
          product_count: productCountByOrder.get(orderId) ?? 0,
        };
      })
      .filter((item) => item.order_id > 0)
      .sort((a, b) => b.order_id - a.order_id);
  }

  // Last resort: distinct orderId from OrderProduct / Agenda_Opdracht rows.
  return [...productCountByOrder.entries()]
    .map(([orderId, productCount]) => ({
      order_id: orderId,
      transaction_id: null,
      notary_code: null,
      requester: null,
      register_date: null,
      product_count: productCount,
    }))
    .sort((a, b) => b.order_id - a.order_id);
}

function getLinkedOrderParcels(data: SupportLookup | undefined): LinkedOrderParcel[] {
  if (!data || (data.entry !== 'order' && data.entry !== 'kenmerk' && data.entry !== 'register_deed')) {
    return [];
  }

  const fromSummary = data.summary?.linked_parcels;
  if (fromSummary && fromSummary.length > 0) {
    return fromSummary;
  }

  const parcelsFrame = data.frames.find((frame) => frame.key === 'parcels');
  if (!parcelsFrame?.rows.length) return [];

  return parcelsFrame.rows
    .map((row) => {
      const parcelId =
        asNullableNumber(row.id) ??
        asNullableNumber(row.Id) ??
        asNullableNumber(row.PerceelNummer) ??
        0;
      return {
        parcel_id: parcelId,
        meet_brief:
          asNullableString(row.esri) ??
          asNullableString(row.MeetbriefInf) ??
          asNullableString(row.Meetbriefinf),
        description:
          asNullableString(row.description) ?? asNullableString(row.PerceelOmschrijving),
        location:
          asNullableString(row.location) ?? asNullableString(row.PerceelPlaatselijke),
        status: asNullableString(row.status) ?? asNullableString(row.PerceelStatus),
      };
    })
    .filter((item) => item.parcel_id > 0)
    .sort((a, b) => a.parcel_id - b.parcel_id);
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: systems } = useSystems();
  const activeSystems = useMemo(
    () => (systems ?? []).filter((system) => system.is_active && system.has_connection_url),
    [systems],
  );

  const [systemKey, setSystemKey] = useState(
    () =>
      searchParams.get('systemKey') ??
      localStorage.getItem(SYSTEM_STORAGE_KEY) ??
      'kadaster_statia',
  );
  const [entryMode, setEntryMode] = useState<EntryMode>(() => {
    const entry = searchParams.get('entry');
    if (
      entry === 'order' ||
      entry === 'kenmerk' ||
      entry === 'register_deed' ||
      entry === 'deed_history' ||
      entry === 'parcel_number' ||
      entry === 'meet_brief'
    ) {
      return entry;
    }
    return 'order';
  });
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
  const [parcelReturn, setParcelReturn] = useState<{
    entry: 'parcel_number' | 'meet_brief';
    parcelId: number;
    meetBrief: string | null;
    parcelInput: string;
    meetBriefInput: string;
  } | null>(null);
  const [orderReturn, setOrderReturn] = useState<{
    entry: 'order' | 'kenmerk' | 'register_deed';
    orderId: number;
    orderInput: string;
    kenmerkInput: string;
    registerInput: string;
    kenmerk: string | null;
    registerTitle: string | null;
  } | null>(null);
  const [restoredFromUrl, setRestoredFromUrl] = useState(false);

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

  const deedTypeAkteOptions = useMemo(
    () => extractDeedTypeAkteOptions(data?.frames),
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

  useEffect(() => {
    if (restoredFromUrl) return;
    const entry = searchParams.get('entry') as EntryMode | null;
    const q = searchParams.get('q')?.trim() ?? '';
    const sk = searchParams.get('systemKey')?.trim();
    const autoload = searchParams.get('autoload') === '1';
    if (!autoload || !entry || !q) {
      setRestoredFromUrl(true);
      return;
    }

    if (sk) setSystemKey(sk);
    setEntryMode(entry);
    setParcelReturn(null);
    setOrderReturn(null);
    setActiveOrderId(null);
    setActiveKenmerk(null);
    setActiveRegisterTitle(null);
    setActiveDeedHistoryTitle(null);
    setActiveParcelId(null);
    setActiveMeetBrief(null);

    if (entry === 'order') {
      const orderId = Number(q);
      setOrderInput(q);
      if (Number.isFinite(orderId) && orderId > 0) setActiveOrderId(orderId);
    } else if (entry === 'kenmerk') {
      setKenmerkInput(q);
      setActiveKenmerk(q);
    } else if (entry === 'register_deed') {
      setRegisterInput(q);
      setActiveRegisterTitle(q);
    } else if (entry === 'deed_history') {
      setDeedHistoryInput(q);
      setActiveDeedHistoryTitle(q);
    } else if (entry === 'parcel_number') {
      const parcelId = Number(q);
      setParcelInput(q);
      if (Number.isFinite(parcelId) && parcelId > 0) setActiveParcelId(parcelId);
    } else if (entry === 'meet_brief') {
      setMeetBriefInput(q);
      setActiveMeetBrief(q);
    }

    setRestoredFromUrl(true);
    setSearchParams({}, { replace: true });
  }, [restoredFromUrl, searchParams, setSearchParams]);

  function onSystemChange(nextKey: string) {
    setSystemKey(nextKey);
    setParcelReturn(null);
    setOrderReturn(null);
    clearActiveLookups();
  }

  function onSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSystemKey) return;
    setParcelReturn(null);
    setOrderReturn(null);

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
    rememberOrderReturnFromCurrentLookup();
    setParcelReturn(null);
    setEntryMode('parcel_number');
    setParcelInput(String(parcelId));
    clearActiveLookups();
    setActiveParcelId(parcelId);
  }

  function rememberOrderReturnFromCurrentLookup() {
    if (
      (entryMode === 'order' || entryMode === 'kenmerk' || entryMode === 'register_deed') &&
      data &&
      (data.entry === 'order' || data.entry === 'kenmerk' || data.entry === 'register_deed')
    ) {
      setOrderReturn({
        entry: data.entry,
        orderId: data.order_id,
        orderInput,
        kenmerkInput,
        registerInput,
        kenmerk: data.kenmerk ?? data.summary?.kenmerk ?? null,
        registerTitle: data.register_title ?? data.summary?.register_title ?? null,
      });
    }
  }

  function openDeedHistoryFromOrder(title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error(t('support.deedTitleMissing'));
      return;
    }
    rememberOrderReturnFromCurrentLookup();
    setParcelReturn(null);
    setEntryMode('deed_history');
    setDeedHistoryInput(trimmed);
    clearActiveLookups();
    setActiveDeedHistoryTitle(trimmed);
  }

  function resolveTitleFromRow(row: Record<string, unknown>): string | null {
    return (
      asNullableString(row.title) ??
      asNullableString(row.Title) ??
      asNullableString(row.Akte) ??
      asNullableString(row.akte)
    );
  }

  function isDeedNavigableCell(info: {
    frameKey: string;
    column: string;
    value: unknown;
    row: Record<string, unknown>;
  }): boolean {
    if (
      entryMode !== 'order' &&
      entryMode !== 'kenmerk' &&
      entryMode !== 'register_deed'
    ) {
      return false;
    }
    const frameKey = info.frameKey.toLowerCase();
    if (frameKey !== 'order_deeds' && frameKey !== 'deeds') return false;
    const col = info.column.toLowerCase();
    if (col === 'title' || col === 'akte') {
      return Boolean(asNullableString(info.value)?.trim());
    }
    if (col === 'deedid') {
      const deedId = asNullableNumber(info.value);
      return deedId != null && deedId > 0 && Boolean(resolveTitleFromRow(info.row)?.trim());
    }
    if (frameKey === 'deeds' && col === 'id') {
      const deedId = asNullableNumber(info.value);
      return deedId != null && deedId > 0 && Boolean(resolveTitleFromRow(info.row)?.trim());
    }
    return false;
  }

  function onNavigateFrameCell(info: {
    frameKey: string;
    column: string;
    value: unknown;
    row: Record<string, unknown>;
  }) {
    const col = info.column.toLowerCase();
    if (col === 'title' || col === 'akte') {
      const title = asNullableString(info.value)?.trim();
      if (title) openDeedHistoryFromOrder(title);
      return;
    }
    if (col === 'deedid' || (info.frameKey.toLowerCase() === 'deeds' && col === 'id')) {
      const title = resolveTitleFromRow(info.row)?.trim();
      if (title) {
        openDeedHistoryFromOrder(title);
        return;
      }
      toast.error(t('support.deedTitleMissing'));
    }
  }

  function selectCandidateOrder(orderId: number) {
    if (
      (entryMode === 'parcel_number' || entryMode === 'meet_brief') &&
      data &&
      (data.entry === 'parcel_number' || data.entry === 'meet_brief')
    ) {
      setParcelReturn({
        entry: data.entry,
        parcelId: data.parcel_id,
        meetBrief: data.meet_brief,
        parcelInput,
        meetBriefInput,
      });
    }
    setOrderReturn(null);
    setEntryMode('order');
    setOrderInput(String(orderId));
    clearActiveLookups();
    setActiveOrderId(orderId);
  }

  function backToParcelLookup() {
    if (!parcelReturn) return;
    const ctx = parcelReturn;
    setParcelReturn(null);
    setOrderReturn(null);
    setEntryMode(ctx.entry);
    setParcelInput(ctx.parcelInput);
    setMeetBriefInput(ctx.meetBriefInput);
    clearActiveLookups();
    if (ctx.entry === 'parcel_number') {
      setActiveParcelId(ctx.parcelId);
    } else if (ctx.meetBrief) {
      setActiveMeetBrief(ctx.meetBrief);
    }
  }

  function backToOrderLookup() {
    if (!orderReturn) return;
    const ctx = orderReturn;
    setOrderReturn(null);
    setParcelReturn(null);
    setEntryMode(ctx.entry);
    setOrderInput(ctx.orderInput);
    setKenmerkInput(ctx.kenmerkInput);
    setRegisterInput(ctx.registerInput);
    clearActiveLookups();
    if (ctx.entry === 'order') {
      setActiveOrderId(ctx.orderId);
    } else if (ctx.entry === 'kenmerk' && ctx.kenmerk) {
      setActiveKenmerk(ctx.kenmerk);
    } else if (ctx.entry === 'register_deed' && ctx.registerTitle) {
      setActiveRegisterTitle(ctx.registerTitle);
    } else if (ctx.orderId > 0) {
      setEntryMode('order');
      setActiveOrderId(ctx.orderId);
    }
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
              : isTerenoDialect(selectedSystem?.dialect)
                ? '1-K-3424'
                : '0/1949';

  const isProduction = selectedSystem?.is_production ?? data?.is_production ?? false;
  const isOrderLikeEntry =
    data?.entry === 'order' || data?.entry === 'kenmerk' || data?.entry === 'register_deed';
  const isDeedHistoryEntry = data?.entry === 'deed_history';
  const isParcelLikeEntry =
    data?.entry === 'parcel_number' || data?.entry === 'meet_brief';
  const activeOrderIdForTools =
    isOrderLikeEntry && data && 'order_id' in data && data.order_id > 0 ? data.order_id : null;
  const showChangeTypeAkteTool =
    (isParcelLikeEntry || isDeedHistoryEntry) && deedTypeAkteOptions.length > 0;
  const showChangeNotarisTool =
    (isParcelLikeEntry || isDeedHistoryEntry) && deedTypeAkteOptions.length > 0;
  const showReopenBestellingTool = activeOrderIdForTools != null;
  const showVoidOrderTool = activeOrderIdForTools != null;
  const showChangeParcelTool = activeOrderIdForTools != null;
  const showChangeDeedTool = activeOrderIdForTools != null;
  const showCorrectRegisterTitleTool = Boolean(activeSystemKey);
  const showRetireSubjectTool = Boolean(data?.found);
  const dialect = selectedSystem?.dialect ?? data?.dialect;
  const showResolutionTools =
    Boolean(activeSystemKey) &&
    ((Boolean(data?.found) &&
      ((isTerenoDialect(dialect) && (showChangeTypeAkteTool || showReopenBestellingTool)) ||
        showChangeNotarisTool ||
        showVoidOrderTool ||
        showChangeParcelTool ||
        showChangeDeedTool ||
        showRetireSubjectTool)) ||
      showCorrectRegisterTitleTool);

  const retireInitialRegisterTitle = useMemo(() => {
    if (data?.found) {
      if ('register_title' in data && data.register_title) return data.register_title;
      if (data.summary && 'register_title' in data.summary && data.summary.register_title) {
        return data.summary.register_title;
      }
    }
    if (entryMode === 'deed_history') return deedHistoryInput.trim() || null;
    if (entryMode === 'register_deed') return registerInput.trim() || null;
    return null;
  }, [data, entryMode, deedHistoryInput, registerInput]);

  const retireInitialParcelEsri = useMemo(() => {
    if (!data?.found) return null;
    if ('meet_brief' in data && data.meet_brief) return data.meet_brief;
    if (data.summary && 'meet_brief' in data.summary && data.summary.meet_brief) {
      return data.summary.meet_brief;
    }
    return null;
  }, [data]);

  const retireRegisterTitleOptions = useMemo(
    () => extractRegisterTitleOptions(data),
    [data],
  );
  const retireParcelEsriOptions = useMemo(() => extractParcelEsriOptions(data), [data]);

  const linkedParcelOrders = useMemo(() => getLinkedParcelOrders(data), [data]);
  const linkedOrderParcels = useMemo(() => getLinkedOrderParcels(data), [data]);
  const showParcelOrdersPanel = Boolean(data?.found) && isParcelLikeEntry;
  const showOrderParcelsPanel = Boolean(data?.found) && isOrderLikeEntry;
  const [selectedLinkedOrderId, setSelectedLinkedOrderId] = useState<number | ''>('');
  const [selectedLinkedParcelId, setSelectedLinkedParcelId] = useState<number | ''>('');

  useEffect(() => {
    setSelectedLinkedOrderId('');
    setSelectedLinkedParcelId('');
  }, [data]);

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

      {parcelReturn && isOrderLikeEntry && (
        <Card className="flex flex-col gap-3 border-brand-200 bg-brand-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink-900">{t('support.backToParcelTitle')}</p>
            <p className="text-sm text-ink-600">
              {t('support.backToParcelHint', {
                parcel: parcelReturn.parcelId,
                meetBrief: parcelReturn.meetBrief ?? '—',
              })}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={backToParcelLookup}>
            <ArrowLeft style={{ width: 16, height: 16 }} />
            {t('support.backToParcel')}
          </Button>
        </Card>
      )}

      {orderReturn && (isParcelLikeEntry || isDeedHistoryEntry) && (
        <Card className="flex flex-col gap-3 border-brand-200 bg-brand-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink-900">{t('support.backToOrderTitle')}</p>
            <p className="text-sm text-ink-600">
              {t('support.backToOrderHint', {
                order: orderReturn.orderId,
                kenmerk: orderReturn.kenmerk ?? '—',
              })}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={backToOrderLookup}>
            <ArrowLeft style={{ width: 16, height: 16 }} />
            {t('support.backToOrder')}
          </Button>
        </Card>
      )}

      {showResolutionTools && selectedSystem && (
        <ResolutionToolsMenu
          systemKey={selectedSystem.system_key}
          isProduction={isProduction}
          systemName={selectedSystem.name}
          dialect={dialect}
          deeds={deedTypeAkteOptions}
          orderId={activeOrderIdForTools}
          initialRegisterTitle={retireInitialRegisterTitle}
          initialParcelEsri={retireInitialParcelEsri}
          registerTitleOptions={retireRegisterTitleOptions}
          parcelEsriOptions={retireParcelEsriOptions}
          showChangeTypeAkte={showChangeTypeAkteTool}
          showChangeNotaris={showChangeNotarisTool}
          showReopenBestelling={showReopenBestellingTool}
          showRetireSubject={showRetireSubjectTool}
          showVoidOrder={showVoidOrderTool}
          showChangeParcel={showChangeParcelTool}
          showChangeDeed={showChangeDeedTool}
          showCorrectRegisterTitle={showCorrectRegisterTitleTool}
          onOpenDeedTitle={openDeedHistoryFromOrder}
        />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.parcelId')}</p>
            <p className="mt-1 text-xl font-extrabold text-ink-900">{data.parcel_id}</p>
            <p className="text-xs text-ink-500">{data.summary.meet_brief ?? '—'}</p>
          </Card>
          <Card className="p-4 sm:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase text-ink-400">
              {t('support.parcelDescription')}
            </p>
            <p className="mt-1 line-clamp-3 text-sm font-semibold text-ink-900" title={data.summary.description ?? undefined}>
              {data.summary.description ?? '—'}
            </p>
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
          <Card
            className={`p-4 ${
              data.summary.split_role && data.summary.split_role !== 'none'
                ? 'border-amber-300 bg-amber-50'
                : ''
            }`}
          >
            <p className="text-xs font-semibold uppercase text-ink-400">{t('support.split')}</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">
              {data.summary.split_role === 'source'
                ? t('support.splitSource')
                : data.summary.split_role === 'result'
                  ? t('support.splitResult')
                  : t('support.splitNone')}
            </p>
            <p className="text-xs text-ink-500">
              {data.summary.split_role === 'source'
                ? `${t('support.splitChildren')}: ${(data.summary.split_child_esris ?? []).join(', ') || '—'}`
                : data.summary.split_role === 'result'
                  ? `${t('support.splitParent')}: ${data.summary.split_parent_esri ?? '—'} (#${data.summary.split_parent_parcel_id ?? '—'})`
                  : data.summary.split_flag
                    ? 'splitFlag=1'
                    : '—'}
            </p>
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
            onClick={() => {
              const returnValue =
                entryMode === 'meet_brief'
                  ? (data.meet_brief ?? meetBriefInput).trim() || String(data.parcel_id)
                  : String(data.parcel_id);
              const params = new URLSearchParams({
                parcelId: String(data.parcel_id),
                systemKey: activeSystemKey ?? '',
                variant: 'object',
                returnEntry: entryMode,
                returnValue,
              });
              navigate(`/support/inzage?${params.toString()}`);
            }}
          >
            <FileText style={{ width: 18, height: 18 }} />
            {t('inzage.generate')}
          </Button>
        </Card>
      )}

      {showParcelOrdersPanel && (
        <Card className="border-brand-200 bg-brand-50/30 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <ClipboardList style={{ width: 20, height: 20 }} />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {t('support.linkedParcelOrders')}
                </p>
                <p className="mt-1 text-sm text-ink-600">{t('support.linkedParcelOrdersHint')}</p>
              </div>

              {linkedParcelOrders.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('support.linkedParcelOrdersEmpty')}
                </p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-sm font-medium text-ink-700">
                      {t('support.linkedParcelOrdersSelect')}
                    </label>
                    <Select
                      value={selectedLinkedOrderId}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSelectedLinkedOrderId(
                          Number.isFinite(value) && value > 0 ? value : '',
                        );
                      }}
                    >
                      <option value="">{t('support.linkedParcelOrdersPlaceholder')}</option>
                      {linkedParcelOrders.map((order) => (
                        <option key={order.order_id} value={order.order_id}>
                          #{order.order_id}
                          {order.transaction_id ? ` · ${order.transaction_id}` : ''}
                          {order.notary_code ? ` · ${order.notary_code}` : ''}
                          {` · ${order.product_count} ${t('support.orderProducts')}`}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="button"
                    disabled={!selectedLinkedOrderId}
                    onClick={() => {
                      if (typeof selectedLinkedOrderId === 'number') {
                        selectCandidateOrder(selectedLinkedOrderId);
                      }
                    }}
                  >
                    {t('support.openLinkedOrder')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {showOrderParcelsPanel && (
        <Card className="border-brand-200 bg-brand-50/30 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <ClipboardList style={{ width: 20, height: 20 }} />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {t('support.linkedOrderParcels')}
                </p>
                <p className="mt-1 text-sm text-ink-600">{t('support.linkedOrderParcelsHint')}</p>
              </div>

              {linkedOrderParcels.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t('support.linkedOrderParcelsEmpty')}
                </p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-sm font-medium text-ink-700">
                      {t('support.linkedOrderParcelsSelect')}
                    </label>
                    <Select
                      value={selectedLinkedParcelId}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSelectedLinkedParcelId(
                          Number.isFinite(value) && value > 0 ? value : '',
                        );
                      }}
                    >
                      <option value="">{t('support.linkedOrderParcelsPlaceholder')}</option>
                      {linkedOrderParcels.map((parcel) => (
                        <option key={parcel.parcel_id} value={parcel.parcel_id}>
                          #{parcel.parcel_id}
                          {parcel.meet_brief ? ` · ${parcel.meet_brief}` : ''}
                          {parcel.location ? ` · ${parcel.location}` : ''}
                          {parcel.description ? ` · ${parcel.description}` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="button"
                    disabled={!selectedLinkedParcelId}
                    onClick={() => {
                      if (typeof selectedLinkedParcelId === 'number') {
                        selectCandidateParcel(selectedLinkedParcelId);
                      }
                    }}
                  >
                    {t('support.openLinkedParcel')}
                  </Button>
                </div>
              )}
            </div>
          </div>
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
                <TableFrameCard
                  key={frame.key}
                  frame={frame}
                  systemKey={selectedSystem?.system_key ?? data.system_key}
                  isProduction={isProduction}
                  systemName={selectedSystem?.name ?? data.system_name}
                  isNavigableCell={isDeedNavigableCell}
                  onNavigateCell={onNavigateFrameCell}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
