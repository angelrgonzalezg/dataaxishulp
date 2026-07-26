import { NotFoundError, ValidationError } from '../../utils/AppError';
import { querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  asNumberIds,
  buildFrame,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  queryByIds,
  querySafe,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import { parseRegisterTitle } from './support.service';
import { enrichDeedDetailRows } from './support.deeddetail.enrich';
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
  // Tereno/DLV: Deed.legalFactRegisterId → LegalFactRegister.id
  // Kadaster:   Deed.DeedTypeId → LegalFactRegister.id
  const dialect = await resolveSystemDialect(systemKey);
  const tereno = isTerenoDialect(dialect);
  const registerFk = tereno ? 'legalFactRegisterId' : 'DeedTypeId';

  // Use querySystem (not querySafe): a bad SQL used to return [] and look like "not found".
  // Bracket [number] — reserved/ambiguous as bare identifier with some drivers.
  // Param names avoid clashing with column name "number".
  return querySystem(
    systemKey,
    `SELECT d.*
     FROM Deed d
     INNER JOIN LegalFactRegister lfr ON lfr.id = d.${registerFk}
     WHERE UPPER(LTRIM(RTRIM(lfr.register))) = @registerCode
       AND d.[segment] = @deedSegment
       AND d.[number] = @deedNumber`,
    {
      registerCode: parsed.register,
      deedSegment: parsed.segment,
      deedNumber: parsed.number,
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
    const registerId = getFieldNumber(deed, 'legalFactRegisterId', 'DeedTypeId');
    const register = registerId ? registerById.get(registerId) : undefined;
    const registerCode = getFieldString(register ?? {}, 'register') ?? '';
    const segment = getFieldNumber(deed, 'segment', 'Segment');
    const number = getFieldNumber(deed, 'number', 'Number');
    const fromDeed = node.foundFromDeedId ? deedById.get(node.foundFromDeedId) : undefined;
    const fromRegisterId = fromDeed
      ? getFieldNumber(fromDeed, 'legalFactRegisterId', 'DeedTypeId')
      : null;
    const fromRegister = fromRegisterId ? registerById.get(fromRegisterId) : undefined;
    const fromRegisterCode = getFieldString(fromRegister ?? {}, 'register') ?? '';
    const fromSegment = fromDeed ? getFieldNumber(fromDeed, 'segment', 'Segment') : null;
    const fromNumber = fromDeed ? getFieldNumber(fromDeed, 'number', 'Number') : null;

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
  const segment = getFieldNumber(deed, 'segment', 'Segment');
  const number = getFieldNumber(deed, 'number', 'Number');
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
  const dialect = await resolveSystemDialect(systemKey);
  const tereno = isTerenoDialect(dialect);

  // Tereno has no amendedDeedId; Kadaster may still use DeedID / amendedDeedId naming.
  const rows = tereno
    ? await querySafe(
        systemKey,
        `SELECT id
         FROM DeedDetail
         WHERE deedId IN (${clause})
            OR retiredByRecordDeedId IN (${clause})`,
        params,
      )
    : await querySafe(
        systemKey,
        `SELECT Id
         FROM DeedDetail
         WHERE DeedID IN (${clause})
            OR amendedDeedId IN (${clause})
            OR RetiredByRecordDeedId IN (${clause})`,
        params,
      );

  const ids = new Set(asNumberIds(rows, 'id'));

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
    for (const id of asNumberIds(retiredRows, 'id')) {
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

  const tereno = isTerenoDialect(system.dialect);
  const deeds = await queryByIds(systemKey, 'Deed', 'id', historyDeedIds);
  const registerIds = tereno
    ? asNumberIds(deeds, 'legalFactRegisterId')
    : asNumberIds(deeds, 'DeedTypeId');
  const registers = await queryByIds(systemKey, 'LegalFactRegister', 'id', registerIds);

  const historyGraphRows = buildHistoryGraphRows(history, deeds, registers);
  const deedDetailIds = await resolveHistoryDeedDetailIds(
    systemKey,
    historyDeedIds,
    hasRetiredByDeedDetailId,
  );
  const deedDetailsRaw = await queryByIds(
    systemKey,
    'DeedDetail',
    tereno ? 'id' : 'Id',
    deedDetailIds,
  );
  const deedDetails = await enrichDeedDetailRows(systemKey, deedDetailsRaw);

  const parcelIds = asNumberIds(deedDetails, tereno ? 'plotId' : 'PlotId');
  const subjectIds = asNumberIds(deedDetails, tereno ? 'subjectId' : 'SubjectId');
  const parcels =
    parcelIds.length > 0
      ? await queryByIds(
          systemKey,
          tereno ? 'Parcel' : 'PerceelTb',
          tereno ? 'id' : 'PerceelNummer',
          parcelIds,
        )
      : [];
  const subjects =
    subjectIds.length > 0
      ? await queryByIds(
          systemKey,
          'Subject',
          tereno ? 'id' : 'SubjectID',
          subjectIds,
        )
      : [];
  const subjectGroups =
    subjectIds.length > 0
      ? await (async () => {
          const subjectIn = buildInClause(subjectIds, 'sid');
          return tereno
            ? querySafe(
                systemKey,
                `SELECT sg.*
                 FROM SubjectGroup sg
                 WHERE sg.subjectId IN (${subjectIn.clause})`,
                subjectIn.params,
              )
            : querySafe(
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

  const orderDeedLinks = tereno
    ? await queryByIds(systemKey, 'OrderDeed', 'deedId', historyDeedIds)
    : await queryByIds(systemKey, 'AgendaAkteGroup', 'deedId', historyDeedIds);
  const orderProductIds = tereno
    ? asNumberIds(orderDeedLinks, 'orderProductId')
    : asNumberIds(orderDeedLinks, 'AgendaO_ID');
  const orderProducts =
    orderProductIds.length > 0
      ? await queryByIds(
          systemKey,
          tereno ? 'OrderProduct' : 'Agenda_Opdracht',
          tereno ? 'id' : 'AgendaO_ID',
          orderProductIds,
        )
      : [];
  const orderIds = tereno
    ? asNumberIds(orderProducts, 'orderId')
    : asNumberIds(orderProducts, 'AgendaO_IDGroup');
  const orders =
    orderIds.length > 0
      ? await queryByIds(
          systemKey,
          tereno ? '[Order]' : 'Agenda',
          tereno ? 'id' : 'Agenda_ID',
          orderIds,
        )
      : [];

  const maxDepth = history.reduce((max, node) => Math.max(max, node.depth), 0);

  const deedsWithLegalFact =
    tereno && historyDeedIds.length > 0
      ? await (async () => {
          const { clause, params } = buildInClause(historyDeedIds, 'hid');
          return querySafe(
            systemKey,
            `SELECT d.id AS deedId,
                    lfr.register AS register,
                    d.[segment] AS segment,
                    d.[number] AS number,
                    d.legalFactId AS legalFactId,
                    lf.code AS legalFactCode,
                    lf.nameNl AS legalFactNameNl,
                    CONCAT(
                      ISNULL(lfr.register, ''),
                      ' ',
                      CAST(d.[segment] AS varchar(20)),
                      '-',
                      CAST(d.[number] AS varchar(20))
                    ) AS title
             FROM Deed d
             LEFT JOIN LegalFactRegister lfr ON lfr.id = d.legalFactRegisterId
             LEFT JOIN LegalFact lf ON lf.id = d.legalFactId
             WHERE d.id IN (${clause})
             ORDER BY lfr.register, d.[segment], d.[number], d.id`,
            params,
          );
        })()
      : [];

  const frames: TableFrame[] = [
    buildFrame(
      'seed_deeds',
      'Seed deed(s) from title',
      'Deed',
      'id',
      seedDeeds,
      { section: 'deed_history', sectionLabel: 'Deed history' },
    ),
    ...(tereno
      ? [
          buildFrame(
            'deeds_with_legal_fact',
            'Deeds with Type akte (LegalFact)',
            'Deed',
            'deedId',
            deedsWithLegalFact,
            { section: 'deed_history', sectionLabel: 'Deed history' },
          ),
        ]
      : []),
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
      tereno ? 'id' : 'Id',
      deedDetails,
      { section: 'deed_history', sectionLabel: 'Deed history' },
    ),
    buildFrame(
      'history_parcels',
      'Parcels touched by history DeedDetail rows',
      tereno ? 'Parcel' : 'PerceelTb',
      tereno ? 'id' : 'PerceelNummer',
      parcels,
      { section: 'related_records', sectionLabel: 'Related records' },
    ),
    buildFrame(
      'history_subjects',
      'Subjects touched by history DeedDetail rows',
      'Subject',
      tereno ? 'id' : 'SubjectID',
      subjects,
      { section: 'related_records', sectionLabel: 'Related records' },
    ),
    buildFrame(
      'history_subject_groups',
      tereno ? 'SubjectGroup rows for touched subjects' : 'Subjectgroep rows for touched subjects',
      tereno ? 'SubjectGroup' : 'Subjectgroep',
      tereno ? 'id' : 'Subjectgroepkey',
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
      tereno ? 'Order deed links (OrderDeed)' : 'Order deed links (AgendaAkteGroup)',
      tereno ? 'OrderDeed' : 'AgendaAkteGroup',
      tereno ? 'id' : 'ID',
      orderDeedLinks,
      { section: 'orders', sectionLabel: 'Linked orders' },
    ),
    buildFrame(
      'history_order_products',
      'Order products for linked deeds',
      tereno ? 'OrderProduct' : 'Agenda_Opdracht',
      tereno ? 'id' : 'AgendaO_ID',
      orderProducts,
      { section: 'orders', sectionLabel: 'Linked orders' },
    ),
    buildFrame(
      'history_orders',
      tereno ? 'Orders for linked deeds' : 'Orders (Agenda) for linked deeds',
      tereno ? '[Order]' : 'Agenda',
      tereno ? 'id' : 'Agenda_ID',
      orders,
      { section: 'orders', sectionLabel: 'Linked orders' },
    ),
  ];

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
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
