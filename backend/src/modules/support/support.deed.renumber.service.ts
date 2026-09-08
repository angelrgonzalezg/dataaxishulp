import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystem, querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getDialectProfile,
  getFieldNumber,
  getFieldString,
  querySafe,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import { parseRegisterTitle } from './support.service';
import {
  inferIslandFromSystemKey,
  isKadasterLikeDialect,
  isTerenoDialect,
  type IslandFamily,
  type SystemDialect,
} from './systemDialect';

export interface DeedTitleOccupancy {
  deed_id: number;
  register_title: string;
  register: string | null;
  segment: number | null;
  number: number | null;
  approval_id: number | null;
  is_retired: boolean;
  legal_fact_code: string | null;
  legal_fact_name: string | null;
  deed_detail_count: number;
  a_register_count: number;
  order_link_count: number;
  register_row_count: number;
  deed_document_count: number;
  extra_link_count: number;
  is_orphan: boolean;
  block_reasons: string[];
}

export interface CorrectRegisterTitleResult {
  system_key: string;
  system_name: string;
  dialect: string;
  island: IslandFamily;
  is_production: boolean;
  preview_only: boolean;
  can_apply: boolean;
  from_title: string;
  to_title: string;
  source: DeedTitleOccupancy;
  occupying: DeedTitleOccupancy | null;
  will_release_orphan: boolean;
  will_update_akte_links: number;
  will_update_register_rows: number;
  actions: string[];
  blockers: string[];
  island_notes: string[];
}

function dialectCols(dialect: SystemDialect) {
  const profile = getDialectProfile(dialect);
  const tereno = isTerenoDialect(dialect);
  return {
    tereno,
    registerFk: profile.deedRegisterId,
    approvalCol: tereno ? 'approvalId' : 'ApprovalId',
    retiredCol: tereno ? 'isRetired' : 'IsRetired',
    legalFactFk: profile.deedLegalFactId,
    legalFactName: tereno ? 'nameNl' : 'legalFactNed',
    legalFactCode: 'code',
    detailDeedFk: profile.deedDetailDeedId,
    linkTable: tereno ? 'OrderDeed' : 'AgendaAkteGroup',
    linkPk: tereno ? 'id' : 'ID',
    linkDeedFk: tereno ? 'deedId' : 'DeedId',
    linkAkteCol: tereno ? 'title' : 'Akte',
    updatedByCol: tereno ? 'updatedBy' : 'UpdatedBy',
    updatedAtCol: tereno ? 'updatedAt' : 'UpdatedAt',
  };
}

function islandRules(island: IslandFamily, dialect: SystemDialect) {
  const kadasterLike = isKadasterLikeDialect(dialect);
  const notes: string[] = [];

  if (island === 'statia') {
    notes.push('Statia: C-register + A 16-n. This tool does not change A-register numbers.');
  } else if (island === 'saba') {
    notes.push('Saba: same Kadaster schema as Statia, but A-register is A 13-n (not A 16-n). This tool does not change A-register numbers.');
  } else if (island === 'bonaire') {
    notes.push('Bonaire uses a reserved dialect. Schema is treated as Kadaster-like until verified — apply is blocked.');
  } else if (island === 'aruba') {
    notes.push('Aruba / Tereno: OrderDeed.title, no legacy Register table. Do not reuse Statia Agenda/Akte assumptions.');
  } else if (island === 'atl') {
    notes.push('ATL: Kadaster-like migration database. Confirm the title on that island before applying.');
  } else {
    notes.push('Unknown island for this system key. Apply is blocked until the connection is classified.');
  }

  return {
    hasLegacyRegister: kadasterLike && island !== 'bonaire',
    approvedApprovalId: island === 'statia' || island === 'saba' || island === 'atl' ? 3 : null,
    allowApply: island === 'statia' || island === 'saba' || island === 'aruba' || island === 'atl',
    notes,
  };
}

function formatTitle(register: string, segment: number, number: number): string {
  return `${register} ${segment}-${number}`;
}

async function countRows(
  systemKey: string,
  sql: string,
  params: Record<string, unknown>,
  required = false,
): Promise<number> {
  const rows = required
    ? await querySystem(systemKey, sql, params)
    : await querySafe(systemKey, sql, params);
  if (rows.length === 0) return 0;
  return getFieldNumber(rows[0], 'cnt', 'count') ?? 0;
}

async function loadLegalFactRegisterId(
  systemKey: string,
  registerCode: string,
): Promise<number> {
  const rows = await querySystem(
    systemKey,
    `SELECT id, register
     FROM LegalFactRegister
     WHERE UPPER(LTRIM(RTRIM(register))) = @registerCode
     ORDER BY id`,
    { registerCode },
  );
  const id = rows.length > 0 ? getFieldNumber(rows[0], 'id', 'Id') : null;
  if (id == null) {
    throw new NotFoundError(`LegalFactRegister "${registerCode}" not found`);
  }
  return id;
}

async function loadDeedsByTitle(
  systemKey: string,
  dialect: SystemDialect,
  titleInput: string,
): Promise<Array<Record<string, unknown>>> {
  const parsed = parseRegisterTitle(titleInput);
  if (!parsed) {
    throw new ValidationError(
      'Invalid Register-Deel-Nummer. Use format like "C 35-84" or "C-35-84".',
    );
  }
  const cols = dialectCols(dialect);
  return querySystem(
    systemKey,
    `SELECT d.id, lfr.register, d.[segment], d.[number],
            d.${cols.approvalCol} AS approvalId, d.${cols.retiredCol} AS isRetired,
            d.${cols.registerFk} AS registerFk, d.${cols.legalFactFk} AS legalFactId,
            lf.${cols.legalFactCode} AS legalFactCode, lf.${cols.legalFactName} AS legalFactName
     FROM Deed d
     INNER JOIN LegalFactRegister lfr ON lfr.id = d.${cols.registerFk}
     LEFT JOIN LegalFact lf ON lf.id = d.${cols.legalFactFk}
     WHERE UPPER(LTRIM(RTRIM(lfr.register))) = @registerCode
       AND d.[segment] = @deedSegment
       AND d.[number] = @deedNumber
     ORDER BY d.id`,
    {
      registerCode: parsed.register,
      deedSegment: parsed.segment,
      deedNumber: parsed.number,
    },
  );
}

async function inspectDeed(
  systemKey: string,
  dialect: SystemDialect,
  row: Record<string, unknown>,
  title: string,
  approvedApprovalId: number | null,
): Promise<DeedTitleOccupancy> {
  const cols = dialectCols(dialect);
  const deedId = getFieldNumber(row, 'id', 'Id');
  if (deedId == null) {
    throw new ValidationError('Deed row is missing id');
  }

  const [
    deedDetailCount,
    aRegisterCount,
    orderLinkCount,
    registerRowCount,
    deedDocumentCount,
    calculatedValueCount,
    internalRequestCount,
  ] = await Promise.all([
    countRows(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM DeedDetail WHERE ${cols.detailDeedFk} = @deedId`,
      { deedId },
      true,
    ),
    countRows(systemKey, `SELECT COUNT(*) AS cnt FROM ARegister WHERE deedId = @deedId`, {
      deedId,
    }),
    countRows(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM ${cols.linkTable} WHERE ${cols.linkDeedFk} = @deedId`,
      { deedId },
      true,
    ),
    countRows(systemKey, `SELECT COUNT(*) AS cnt FROM Register WHERE DeedId = @deedId`, {
      deedId,
    }),
    countRows(systemKey, `SELECT COUNT(*) AS cnt FROM DeedDocument WHERE deedId = @deedId`, {
      deedId,
    }),
    countRows(systemKey, `SELECT COUNT(*) AS cnt FROM CalculatedValue WHERE deedId = @deedId`, {
      deedId,
    }),
    countRows(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM InternalRequestRegister WHERE deedId = @deedId`,
      { deedId },
    ),
  ]);

  const extraLinkCount = calculatedValueCount + internalRequestCount;
  const approvalId = getFieldNumber(row, 'approvalId', 'ApprovalId');
  const isRetired = Boolean(getFieldNumber(row, 'isRetired', 'IsRetired') ?? 0);
  const blockReasons: string[] = [];
  if (deedDetailCount > 0) blockReasons.push(`DeedDetail rows: ${deedDetailCount}`);
  if (aRegisterCount > 0) blockReasons.push(`ARegister rows: ${aRegisterCount}`);
  if (orderLinkCount > 0) blockReasons.push(`Order deed links: ${orderLinkCount}`);
  if (registerRowCount > 0) blockReasons.push(`Legacy Register rows: ${registerRowCount}`);
  if (deedDocumentCount > 0) blockReasons.push(`DeedDocument rows: ${deedDocumentCount}`);
  if (extraLinkCount > 0) blockReasons.push(`Other linked rows: ${extraLinkCount}`);
  if (approvedApprovalId != null && approvalId === approvedApprovalId) {
    blockReasons.push(`Deed is approved (ApprovalId = ${approvedApprovalId})`);
  }

  return {
    deed_id: deedId,
    register_title: title,
    register: getFieldString(row, 'register'),
    segment: getFieldNumber(row, 'segment', 'Segment'),
    number: getFieldNumber(row, 'number', 'Number'),
    approval_id: approvalId,
    is_retired: isRetired,
    legal_fact_code: getFieldString(row, 'legalFactCode'),
    legal_fact_name: getFieldString(row, 'legalFactName'),
    deed_detail_count: deedDetailCount,
    a_register_count: aRegisterCount,
    order_link_count: orderLinkCount,
    register_row_count: registerRowCount,
    deed_document_count: deedDocumentCount,
    extra_link_count: extraLinkCount,
    is_orphan: blockReasons.length === 0,
    block_reasons: blockReasons,
  };
}

async function pickDeedRow(
  rows: Array<Record<string, unknown>>,
  title: string,
  preferredDeedId?: number,
): Promise<Record<string, unknown>> {
  if (rows.length === 0) {
    throw new NotFoundError(`Deed "${title}" not found`);
  }
  if (preferredDeedId != null && preferredDeedId > 0) {
    const match = rows.find((row) => getFieldNumber(row, 'id', 'Id') === preferredDeedId);
    if (!match) {
      throw new NotFoundError(`Deed ${preferredDeedId} is not "${title}"`);
    }
    return match;
  }
  if (rows.length > 1) {
    throw new ValidationError(
      `Multiple deeds match "${title}". Provide fromDeedId to choose one.`,
    );
  }
  return rows[0];
}

export async function correctRegisterTitle(input: {
  systemKey?: string;
  fromTitle: string;
  toTitle: string;
  fromDeedId?: number;
  previewOnly: boolean;
  confirm?: boolean;
  updatedBy?: string;
}): Promise<CorrectRegisterTitleResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const island = inferIslandFromSystemKey(system.system_key);
  const rules = islandRules(island, dialect);
  const cols = dialectCols(dialect);

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to correct the Register-Deel-Nummer.',
    );
  }

  const fromParsed = parseRegisterTitle(input.fromTitle);
  const toParsed = parseRegisterTitle(input.toTitle);
  if (!fromParsed || !toParsed) {
    throw new ValidationError(
      'Invalid Register-Deel-Nummer. Use format like "C 35-84" or "C-35-84".',
    );
  }

  const fromTitle = formatTitle(fromParsed.register, fromParsed.segment, fromParsed.number);
  const toTitle = formatTitle(toParsed.register, toParsed.segment, toParsed.number);
  if (fromTitle === toTitle) {
    throw new ValidationError('Current and new Register-Deel-Nummer are the same');
  }

  const sourceRows = await loadDeedsByTitle(systemKey, dialect, fromTitle);
  const sourceRow = await pickDeedRow(sourceRows, fromTitle, input.fromDeedId);
  const source = await inspectDeed(
    systemKey,
    dialect,
    sourceRow,
    fromTitle,
    rules.approvedApprovalId,
  );

  const occupyingRows = await loadDeedsByTitle(systemKey, dialect, toTitle);
  const occupyingRow =
    occupyingRows.length === 0
      ? null
      : occupyingRows.length === 1
        ? occupyingRows[0]
        : occupyingRows.find((row) => getFieldNumber(row, 'id', 'Id') !== source.deed_id) ??
          occupyingRows[0];
  const occupying =
    occupyingRow != null
      ? await inspectDeed(
          systemKey,
          dialect,
          occupyingRow,
          toTitle,
          rules.approvedApprovalId,
        )
      : null;

  const blockers: string[] = [];
  let willReleaseOrphan = false;

  if (occupying && occupying.deed_id === source.deed_id) {
    blockers.push('Source deed already uses the destination title');
  } else if (occupying && occupying.is_orphan) {
    willReleaseOrphan = true;
  } else if (occupying) {
    blockers.push(
      `Destination "${toTitle}" is occupied by deed #${occupying.deed_id} and is not an unused leftover`,
    );
    blockers.push(...occupying.block_reasons.map((reason) => `Occupying deed: ${reason}`));
  }

  const actions: string[] = [];
  if (willReleaseOrphan && occupying) {
    actions.push(`Delete unused leftover deed #${occupying.deed_id} (${toTitle})`);
  }
  actions.push(`Renumber deed #${source.deed_id} from ${fromTitle} to ${toTitle}`);
  if (source.order_link_count > 0) {
    actions.push(`Update Akte / title text on ${source.order_link_count} order link(s)`);
  }
  if (rules.hasLegacyRegister && source.register_row_count > 0) {
    actions.push(`Update legacy Register number on ${source.register_row_count} row(s)`);
  }

  if (!rules.allowApply) {
    blockers.push(
      island === 'bonaire'
        ? 'Bonaire writes are blocked until that dialect is verified'
        : `Apply is not enabled for island "${island}"`,
    );
  }

  const result: CorrectRegisterTitleResult = {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    island,
    is_production: system.is_production,
    preview_only: input.previewOnly,
    can_apply: blockers.length === 0,
    from_title: fromTitle,
    to_title: toTitle,
    source,
    occupying,
    will_release_orphan: willReleaseOrphan,
    will_update_akte_links: source.order_link_count,
    will_update_register_rows: rules.hasLegacyRegister ? source.register_row_count : 0,
    actions,
    blockers,
    island_notes: rules.notes,
  };

  if (input.previewOnly) {
    return result;
  }
  if (blockers.length > 0) {
    throw new ValidationError(blockers.join(' · '));
  }

  const updatedBy = (input.updatedBy ?? 'dataaxis-hulp').trim().slice(0, 250);
  const nextRegisterFk =
    fromParsed.register === toParsed.register
      ? getFieldNumber(sourceRow, 'registerFk')
      : await loadLegalFactRegisterId(systemKey, toParsed.register);
  if (nextRegisterFk == null) {
    throw new ValidationError('Could not resolve destination LegalFactRegister');
  }

  if (willReleaseOrphan && occupying) {
    const fresh = await inspectDeed(
      systemKey,
      dialect,
      occupyingRow!,
      toTitle,
      rules.approvedApprovalId,
    );
    if (!fresh.is_orphan) {
      throw new ValidationError(
        `Cannot release leftover "${toTitle}": it is no longer unused (${fresh.block_reasons.join(', ')})`,
      );
    }
    await executeSystem(systemKey, `DELETE FROM Deed WHERE id = @deedId`, {
      deedId: occupying.deed_id,
    });
  }

  try {
    await executeSystem(
      systemKey,
      `UPDATE Deed
       SET ${cols.registerFk} = @registerFk,
           [segment] = @segment,
           [number] = @number,
           ${cols.updatedAtCol} = SYSUTCDATETIME(),
           ${cols.updatedByCol} = @updatedBy
       WHERE id = @deedId`,
      {
        registerFk: nextRegisterFk,
        segment: toParsed.segment,
        number: toParsed.number,
        updatedBy,
        deedId: source.deed_id,
      },
    );
  } catch {
    await executeSystem(
      systemKey,
      `UPDATE Deed
       SET ${cols.registerFk} = @registerFk,
           [segment] = @segment,
           [number] = @number
       WHERE id = @deedId`,
      {
        registerFk: nextRegisterFk,
        segment: toParsed.segment,
        number: toParsed.number,
        deedId: source.deed_id,
      },
    );
  }

  if (source.order_link_count > 0) {
    await executeSystem(
      systemKey,
      `UPDATE ${cols.linkTable}
       SET ${cols.linkAkteCol} = @toTitle
       WHERE ${cols.linkDeedFk} = @deedId`,
      { toTitle, deedId: source.deed_id },
    );
  }

  if (rules.hasLegacyRegister && source.register_row_count > 0) {
    await executeSystem(
      systemKey,
      `UPDATE Register
       SET RegisterAkteTypeID = @registerCode,
           RegisterDeel = @segment,
           RegisterNummer = @number
       WHERE DeedId = @deedId`,
      {
        registerCode: toParsed.register,
        segment: toParsed.segment,
        number: toParsed.number,
        deedId: source.deed_id,
      },
    );
  }

  return {
    ...result,
    preview_only: false,
  };
}
