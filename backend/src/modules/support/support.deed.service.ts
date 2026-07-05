import { NotFoundError, ValidationError } from '../../utils/AppError';
import {
  DEFAULT_SYSTEM_KEY,
  asNumberIds,
  buildFrame,
  getFieldNumber,
  getFieldString,
  queryByIds,
  querySafe,
  resolveSupportSystem,
} from './support.frames';
import { parseRegisterTitle } from './support.service';
import type { DeedHistorySupportLookup, TableFrame } from './support.types';

const MAX_HISTORY_DEPTH = 25;

interface DeedHistoryNode {
  deedId: number;
  depth: number;
  foundBy: string;
  foundFromDeedId: number | null;
}

function buildInClause(ids: number[], prefix: string): { clause: string; params: Record<string, number> } {
  const params: Record<string, number> = {};
  const parts = ids.map((id, index) => {
    const key = `${prefix}${index}`;
    params[key] = id;
    return `@${key}`;
  });
  return { clause: parts.join(', '), params };
}

async function columnExists(systemKey: string, table: string, column: string): Promise<boolean> {
  const rows = await querySafe(
    systemKey,
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo'
       AND TABLE_NAME = @table
       AND COLUMN_NAME = @column`,
    { table, column },
  );
  return rows.length > 0;
}

async function resolveSeedDeeds(
  systemKey: string,
  parsed: { register: string; segment: number; number: number },
): Promise<Record<string, unknown>[]> {
  return querySafe(
    systemKey,
    `SELECT d.*
     FROM Deed d
     INNER JOIN LegalFactRegister lfr ON lfr.id = d.DeedTypeId
     WHERE UPPER(LTRIM(RTRIM(lfr.register))) = @register
       AND d.Segment = @segment
       AND d.Number = @number`,
    {
      register: parsed.register,
      segment: parsed.segment,
      number: parsed.number,
    },
  );
}

async function traceDeedHistory(
  systemKey: string,
  seedDeedIds: number[],
  hasRetiredByDeedDetailId: boolean,
): Promise<DeedHistoryNode[]> {
  const history = new Map<number, DeedHistoryNode>();
  for (const deedId of seedDeedIds) {
    history.set(deedId, {
      deedId,
      depth: 0,
      foundBy: 'seed deed',
      foundFromDeedId: null,
    });
  }

  let nextNodes: DeedHistoryNode[] = seedDeedIds.map((deedId) => ({
    deedId,
    depth: 0,
    foundBy: 'seed deed',
    foundFromDeedId: null,
  }));

  while (nextNodes.some((node) => node.depth < MAX_HISTORY_DEPTH)) {
    const nextIds = nextNodes.map((node) => node.deedId);
    if (nextIds.length === 0) break;

    const { clause, params: inParams } = buildInClause(nextIds, 'nid');
    const nodeById = new Map(nextNodes.map((node) => [node.deedId, node]));
    const candidates: DeedHistoryNode[] = [];

    const currentDeeds = await querySafe(
      systemKey,
      `SELECT id, linkedDeedId, RetiredByRecord FROM Deed WHERE id IN (${clause})`,
      inParams,
    );

    for (const deed of currentDeeds) {
      const fromId = getFieldNumber(deed, 'id');
      if (!fromId) continue;
      const fromNode = nodeById.get(fromId);
      if (!fromNode) continue;
      const depth = fromNode.depth + 1;

      const linkedDeedId = getFieldNumber(deed, 'linkedDeedId');
      if (linkedDeedId) {
        candidates.push({
          deedId: linkedDeedId,
          depth,
          foundBy: 'Deed.linkedDeedId from current deed',
          foundFromDeedId: fromId,
        });
      }

      const retiredByRecord = getFieldNumber(deed, 'RetiredByRecord');
      if (retiredByRecord) {
        candidates.push({
          deedId: retiredByRecord,
          depth,
          foundBy: 'Deed.RetiredByRecord from current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    const linkedToCurrent = await querySafe(
      systemKey,
      `SELECT id FROM Deed WHERE linkedDeedId IN (${clause})`,
      inParams,
    );
    for (const deed of linkedToCurrent) {
      const deedId = getFieldNumber(deed, 'id');
      if (!deedId) continue;
      for (const fromId of nextIds) {
        candidates.push({
          deedId,
          depth: (nodeById.get(fromId)?.depth ?? 0) + 1,
          foundBy: 'Deed.linkedDeedId points to current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    const retiredByCurrent = await querySafe(
      systemKey,
      `SELECT id FROM Deed WHERE RetiredByRecord IN (${clause})`,
      inParams,
    );
    for (const deed of retiredByCurrent) {
      const deedId = getFieldNumber(deed, 'id');
      if (!deedId) continue;
      for (const fromId of nextIds) {
        candidates.push({
          deedId,
          depth: (nodeById.get(fromId)?.depth ?? 0) + 1,
          foundBy: 'Deed.RetiredByRecord points to current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    const deedDetailsFromCurrent = await querySafe(
      systemKey,
      `SELECT Id, DeedID, amendedDeedId, RetiredByRecordDeedId
       FROM DeedDetail
       WHERE DeedID IN (${clause})`,
      inParams,
    );

    for (const detail of deedDetailsFromCurrent) {
      const fromId = getFieldNumber(detail, 'DeedID');
      if (!fromId) continue;
      const depth = (nodeById.get(fromId)?.depth ?? 0) + 1;

      const amendedDeedId = getFieldNumber(detail, 'amendedDeedId');
      if (amendedDeedId) {
        candidates.push({
          deedId: amendedDeedId,
          depth,
          foundBy: 'DeedDetail.amendedDeedId from current deed',
          foundFromDeedId: fromId,
        });
      }

      const retiredByRecordDeedId = getFieldNumber(detail, 'RetiredByRecordDeedId');
      if (retiredByRecordDeedId) {
        candidates.push({
          deedId: retiredByRecordDeedId,
          depth,
          foundBy: 'DeedDetail.RetiredByRecordDeedId from current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    const amendedToCurrent = await querySafe(
      systemKey,
      `SELECT DeedID FROM DeedDetail WHERE amendedDeedId IN (${clause})`,
      inParams,
    );
    for (const detail of amendedToCurrent) {
      const deedId = getFieldNumber(detail, 'DeedID');
      if (!deedId) continue;
      for (const fromId of nextIds) {
        candidates.push({
          deedId,
          depth: (nodeById.get(fromId)?.depth ?? 0) + 1,
          foundBy: 'DeedDetail.amendedDeedId points to current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    const retiredToCurrent = await querySafe(
      systemKey,
      `SELECT DeedID FROM DeedDetail WHERE RetiredByRecordDeedId IN (${clause})`,
      inParams,
    );
    for (const detail of retiredToCurrent) {
      const deedId = getFieldNumber(detail, 'DeedID');
      if (!deedId) continue;
      for (const fromId of nextIds) {
        candidates.push({
          deedId,
          depth: (nodeById.get(fromId)?.depth ?? 0) + 1,
          foundBy: 'DeedDetail.RetiredByRecordDeedId points to current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    if (hasRetiredByDeedDetailId) {
      const retiredByDetailFromCurrent = await querySafe(
        systemKey,
        `SELECT term.DeedID AS deedId, original.DeedID AS fromDeedId
         FROM DeedDetail original
         INNER JOIN DeedDetail term ON term.Id = original.RetiredByDeedDetailId
         WHERE original.DeedID IN (${clause})
           AND term.DeedID IS NOT NULL`,
        inParams,
      );
      for (const row of retiredByDetailFromCurrent) {
        const deedId = getFieldNumber(row, 'deedId');
        const fromId = getFieldNumber(row, 'fromDeedId');
        if (!deedId || !fromId) continue;
        candidates.push({
          deedId,
          depth: (nodeById.get(fromId)?.depth ?? 0) + 1,
          foundBy: 'DeedDetail.RetiredByDeedDetailId from current deed',
          foundFromDeedId: fromId,
        });
      }

      const retiredByDetailToCurrent = await querySafe(
        systemKey,
        `SELECT original.DeedID AS deedId, term.DeedID AS fromDeedId
         FROM DeedDetail term
         INNER JOIN DeedDetail original ON original.RetiredByDeedDetailId = term.Id
         WHERE term.DeedID IN (${clause})
           AND original.DeedID IS NOT NULL`,
        inParams,
      );
      for (const row of retiredByDetailToCurrent) {
        const deedId = getFieldNumber(row, 'deedId');
        const fromId = getFieldNumber(row, 'fromDeedId');
        if (!deedId || !fromId) continue;
        candidates.push({
          deedId,
          depth: (nodeById.get(fromId)?.depth ?? 0) + 1,
          foundBy: 'DeedDetail.RetiredByDeedDetailId points to current deed',
          foundFromDeedId: fromId,
        });
      }
    }

    const grouped = new Map<number, DeedHistoryNode>();
    for (const candidate of candidates) {
      if (history.has(candidate.deedId)) continue;
      const existing = grouped.get(candidate.deedId);
      if (!existing || candidate.depth < existing.depth) {
        grouped.set(candidate.deedId, candidate);
      }
    }

    nextNodes = [...grouped.values()];
    if (nextNodes.length === 0) break;

    for (const node of nextNodes) {
      history.set(node.deedId, node);
    }
  }

  return [...history.values()].sort((a, b) => a.depth - b.depth || a.deedId - b.deedId);
}

function buildHistoryGraphRows(
  history: DeedHistoryNode[],
  deeds: Record<string, unknown>[],
  registers: Record<string, unknown>[],
): Record<string, unknown>[] {
  const deedById = new Map(deeds.map((deed) => [getFieldNumber(deed, 'id'), deed]));
  const registerById = new Map(registers.map((row) => [getFieldNumber(row, 'id'), row]));

  return history.map((node) => {
    const deed = deedById.get(node.deedId) ?? {};
    const registerId = getFieldNumber(deed, 'DeedTypeId');
    const register = registerId ? registerById.get(registerId) : undefined;
    const registerCode = getFieldString(register ?? {}, 'register') ?? '';
    const segment = getFieldNumber(deed, 'Segment');
    const number = getFieldNumber(deed, 'Number');
    const fromDeed = node.foundFromDeedId ? deedById.get(node.foundFromDeedId) : undefined;
    const fromRegisterId = fromDeed ? getFieldNumber(fromDeed, 'DeedTypeId') : null;
    const fromRegister = fromRegisterId ? registerById.get(fromRegisterId) : undefined;
    const fromRegisterCode = getFieldString(fromRegister ?? {}, 'register') ?? '';
    const fromSegment = fromDeed ? getFieldNumber(fromDeed, 'Segment') : null;
    const fromNumber = fromDeed ? getFieldNumber(fromDeed, 'Number') : null;

    return {
      Depth: node.depth,
      FoundBy: node.foundBy,
      FoundFromDeedId: node.foundFromDeedId,
      FoundFromTitle:
        fromSegment != null && fromNumber != null
          ? `${fromRegisterCode} ${fromSegment}-${fromNumber}`.trim()
          : null,
      DeedRegister: registerCode,
      Title:
        segment != null && number != null
          ? `${registerCode} ${segment}-${number}`.trim()
          : registerTitleFromDeed(deed, registerCode),
      ...deed,
    };
  });
}

function registerTitleFromDeed(deed: Record<string, unknown>, registerCode: string): string | null {
  const segment = getFieldNumber(deed, 'Segment');
  const number = getFieldNumber(deed, 'Number');
  if (segment == null || number == null) return null;
  return `${registerCode} ${segment}-${number}`.trim();
}

async function resolveHistoryDeedDetailIds(
  systemKey: string,
  historyDeedIds: number[],
  hasRetiredByDeedDetailId: boolean,
): Promise<number[]> {
  if (historyDeedIds.length === 0) return [];

  const { clause, params } = buildInClause(historyDeedIds, 'hid');
  const rows = await querySafe(
    systemKey,
    `SELECT Id
     FROM DeedDetail
     WHERE DeedID IN (${clause})
        OR amendedDeedId IN (${clause})
        OR RetiredByRecordDeedId IN (${clause})`,
    params,
  );

  const ids = new Set(asNumberIds(rows, 'Id'));

  if (hasRetiredByDeedDetailId) {
    const retiredRows = await querySafe(
      systemKey,
      `SELECT dd.Id
       FROM DeedDetail dd
       WHERE dd.RetiredByDeedDetailId IN (
         SELECT Id FROM DeedDetail WHERE DeedID IN (${clause})
       )`,
      params,
    );
    for (const id of asNumberIds(retiredRows, 'Id')) {
      ids.add(id);
    }
  }

  return [...ids];
}

export async function lookupDeedHistoryByTitle(
  titleInput: string,
  systemKeyInput?: string,
): Promise<DeedHistorySupportLookup> {
  const registerTitle = titleInput.trim();
  const parsed = parseRegisterTitle(registerTitle);
  if (!parsed) {
    throw new ValidationError(
      'Invalid title. Use Register-Deel-Nummer format like "C 23-92" or "C-23-92"',
    );
  }

  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const hasRetiredByDeedDetailId = await columnExists(
    systemKey,
    'DeedDetail',
    'RetiredByDeedDetailId',
  );

  const seedDeeds = await resolveSeedDeeds(systemKey, parsed);
  if (seedDeeds.length === 0) {
    throw new NotFoundError(
      `Deed "${registerTitle}" not found in ${system.system_name}`,
    );
  }

  const seedDeedIds = asNumberIds(seedDeeds, 'id');
  const history = await traceDeedHistory(systemKey, seedDeedIds, hasRetiredByDeedDetailId);
  const historyDeedIds = history.map((node) => node.deedId);

  const deeds = await queryByIds(systemKey, 'Deed', 'id', historyDeedIds);
  const registerIds = asNumberIds(deeds, 'DeedTypeId');
  const registers = await queryByIds(systemKey, 'LegalFactRegister', 'id', registerIds);

  const historyGraphRows = buildHistoryGraphRows(history, deeds, registers);
  const deedDetailIds = await resolveHistoryDeedDetailIds(
    systemKey,
    historyDeedIds,
    hasRetiredByDeedDetailId,
  );
  const deedDetails = await queryByIds(systemKey, 'DeedDetail', 'Id', deedDetailIds);

  const parcelIds = asNumberIds(deedDetails, 'PlotId');
  const subjectIds = asNumberIds(deedDetails, 'SubjectId');
  const parcels = parcelIds.length > 0
    ? await queryByIds(systemKey, 'PerceelTb', 'PerceelNummer', parcelIds)
    : [];
  const subjects = subjectIds.length > 0
    ? await queryByIds(systemKey, 'Subject', 'SubjectID', subjectIds)
    : [];
  const subjectGroups =
    subjectIds.length > 0
      ? await (async () => {
          const subjectIn = buildInClause(subjectIds, 'sid');
          return querySafe(
            systemKey,
            `SELECT sg.*
             FROM Subjectgroep sg
             WHERE sg.SubjectID IN (${subjectIn.clause})`,
            subjectIn.params,
          );
        })()
      : [];

  const aRegisterIn = buildInClause(historyDeedIds, 'aid');
  const aRegisterRows = await querySafe(
    systemKey,
    `SELECT ar.*
     FROM ARegister ar
     WHERE ar.deedId IN (${aRegisterIn.clause})`,
    aRegisterIn.params,
  );

  const orderDeedLinks = await queryByIds(systemKey, 'AgendaAkteGroup', 'deedId', historyDeedIds);
  const orderProductIds = asNumberIds(orderDeedLinks, 'AgendaO_ID');
  const orderProducts =
    orderProductIds.length > 0
      ? await queryByIds(systemKey, 'Agenda_Opdracht', 'AgendaO_ID', orderProductIds)
      : [];
  const orderIds = asNumberIds(orderProducts, 'AgendaO_IDGroup');
  const orders = orderIds.length > 0 ? await queryByIds(systemKey, 'Agenda', 'Agenda_ID', orderIds) : [];

  const maxDepth = history.reduce((max, node) => Math.max(max, node.depth), 0);
  const frames: TableFrame[] = [
    buildFrame(
      'seed_deeds',
      'Seed deed(s) from title',
      'Deed',
      'id',
      seedDeeds,
      { section: 'deed_history', sectionLabel: 'Deed history' },
    ),
    buildFrame(
      'deed_history_graph',
      'Deed history graph (trace backwards)',
      'Deed',
      'id',
      historyGraphRows,
      { section: 'deed_history', sectionLabel: 'Deed history' },
    ),
    buildFrame(
      'deed_details',
      'DeedDetail rows tied to history deeds',
      'DeedDetail',
      'Id',
      deedDetails,
      { section: 'deed_history', sectionLabel: 'Deed history' },
    ),
    buildFrame(
      'history_parcels',
      'Parcels touched by history DeedDetail rows',
      'PerceelTb',
      'PerceelNummer',
      parcels,
      { section: 'related_records', sectionLabel: 'Related records' },
    ),
    buildFrame(
      'history_subjects',
      'Subjects touched by history DeedDetail rows',
      'Subject',
      'SubjectID',
      subjects,
      { section: 'related_records', sectionLabel: 'Related records' },
    ),
    buildFrame(
      'history_subject_groups',
      'Subjectgroep rows for touched subjects',
      'Subjectgroep',
      'Subjectgroepkey',
      subjectGroups,
      { section: 'related_records', sectionLabel: 'Related records' },
    ),
    buildFrame(
      'history_a_register',
      'A-register rows for history deeds',
      'ARegister',
      'id',
      aRegisterRows,
      { section: 'related_records', sectionLabel: 'Related records' },
    ),
    buildFrame(
      'history_order_deed_links',
      'Order deed links (AgendaAkteGroup)',
      'AgendaAkteGroup',
      'ID',
      orderDeedLinks,
      { section: 'orders', sectionLabel: 'Linked orders' },
    ),
    buildFrame(
      'history_order_products',
      'Order products for linked deeds',
      'Agenda_Opdracht',
      'AgendaO_ID',
      orderProducts,
      { section: 'orders', sectionLabel: 'Linked orders' },
    ),
    buildFrame(
      'history_orders',
      'Orders (Agenda) for linked deeds',
      'Agenda',
      'Agenda_ID',
      orders,
      { section: 'orders', sectionLabel: 'Linked orders' },
    ),
  ];

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    is_production: system.is_production,
    entry: 'deed_history',
    register_title: registerTitle,
    found: true,
    summary: {
      register_title: registerTitle,
      seed_deed_count: seedDeeds.length,
      history_deed_count: history.length,
      history_deed_detail_count: deedDetails.length,
      parcel_count: parcels.length,
      subject_count: subjects.length,
      order_link_count: orders.length,
      max_depth: maxDepth,
    },
    frames: frames.filter((frame) => frame.rowCount > 0 || frame.key === 'seed_deeds'),
  };
}
