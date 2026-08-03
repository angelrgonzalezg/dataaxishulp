import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystem, querySystem, serializeRow } from '../../utils/externalDb';
import {
  addFractions,
  buildSubjectName,
  formatFraction,
  simplifyFraction,
} from './inzage.helpers';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import { parseRegisterTitle } from './support.service';
import type { SystemDialect } from './systemDialect';

export interface RetireSubjectCandidate {
  deed_detail_id: number;
  deed_id: number;
  register_title: string;
  parcel_id: number;
  parcel_esri: string | null;
  subject_id: number;
  subject_name: string;
  share_numerator: number | null;
  share_denominator: number | null;
  is_retired: boolean;
  legal_fact_type_id: number | null;
}

export interface OwnershipShareValidation {
  is_valid: boolean;
  active_count: number;
  total_numerator: number | null;
  total_denominator: number | null;
  total_display: string | null;
  total_decimal: number | null;
  expected_display: '1/1';
  incomplete_share_count: number;
  message: string;
}

export interface RetireSubjectLookupResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  register_title: string;
  parcel_esri: string;
  deed_ids: number[];
  parcel_ids: number[];
  candidates: RetireSubjectCandidate[];
  share_validation: OwnershipShareValidation;
}

export interface RetireSubjectChange {
  deed_detail_id: number;
  deed_id: number;
  register_title: string | null;
  parcel_id: number | null;
  parcel_esri: string | null;
  subject_id: number;
  subject_name: string;
  from_is_retired: boolean;
  to_is_retired: true;
  raw: Record<string, unknown>;
}

export interface RetireSubjectResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  preview_only: boolean;
  change_count: number;
  changes: RetireSubjectChange[];
  share_validation: OwnershipShareValidation;
  remaining_active: RetireSubjectCandidate[];
}

export interface CorrectOwnershipShareResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  preview_only: boolean;
  deed_detail_id: number;
  subject_id: number;
  subject_name: string;
  from_share_numerator: number | null;
  from_share_denominator: number | null;
  to_share_numerator: number;
  to_share_denominator: number;
  share_validation: OwnershipShareValidation;
}

function dialectColumns(dialect: SystemDialect) {
  const tereno = isTerenoDialect(dialect);
  return {
    tereno,
    deedDetailId: tereno ? 'id' : 'Id',
    deedId: tereno ? 'deedId' : 'DeedID',
    subjectId: tereno ? 'subjectId' : 'SubjectId',
    plotId: tereno ? 'plotId' : 'PlotId',
    isRetired: tereno ? 'isRetired' : 'IsRetired',
    typeId: tereno ? 'legalFactTypeId' : 'DeedTypeId',
    shareNum: tereno ? 'shareNumerator' : 'ShareNumerator',
    shareDen: tereno ? 'shareDenominator' : 'ShareDenominator',
    registerFk: tereno ? 'legalFactRegisterId' : 'DeedTypeId',
    subjectPk: tereno ? 'id' : 'SubjectID',
    parcelTable: tereno ? 'Parcel' : 'PerceelTb',
    parcelPk: tereno ? 'id' : 'PerceelNummer',
    parcelEsri: tereno ? 'esri' : 'MeetbriefInf',
  };
}

async function resolveDeedsByTitle(
  systemKey: string,
  dialect: SystemDialect,
  registerTitle: string,
): Promise<{ deeds: Record<string, unknown>[]; title: string }> {
  const parsed = parseRegisterTitle(registerTitle);
  if (!parsed) {
    throw new ValidationError(
      'Invalid Register-Deel-Nummer. Use format like "C 240-6" or "C-240-6".',
    );
  }

  const cols = dialectColumns(dialect);
  const deeds = await querySystem(
    systemKey,
    `SELECT d.*
     FROM Deed d
     INNER JOIN LegalFactRegister lfr ON lfr.id = d.${cols.registerFk}
     WHERE UPPER(LTRIM(RTRIM(lfr.register))) = @registerCode
       AND d.[segment] = @deedSegment
       AND d.[number] = @deedNumber`,
    {
      registerCode: parsed.register,
      deedSegment: parsed.segment,
      deedNumber: parsed.number,
    },
  );

  if (deeds.length === 0) {
    throw new NotFoundError(`Deed "${registerTitle}" not found`);
  }

  return {
    deeds,
    title: `${parsed.register} ${parsed.segment}-${parsed.number}`,
  };
}

async function resolveParcelsByEsri(
  systemKey: string,
  dialect: SystemDialect,
  parcelEsri: string,
): Promise<Record<string, unknown>[]> {
  const esri = parcelEsri.trim();
  if (!esri) {
    throw new ValidationError('Parcel ESRI / meet brief is required');
  }

  const cols = dialectColumns(dialect);
  let parcels: Record<string, unknown>[] = [];

  if (cols.tereno) {
    parcels = await querySystem(
      systemKey,
      `SELECT * FROM Parcel WHERE esri = @esri`,
      { esri },
    );
    if (parcels.length === 0) {
      parcels = await querySystem(
        systemKey,
        `SELECT * FROM Parcel WHERE esri LIKE @esriLike ORDER BY id`,
        { esriLike: `%${esri}%` },
      );
    }
  } else {
    // Kadaster: meet brief and ESRI can live in different columns depending on island/schema.
    parcels = await querySystem(
      systemKey,
      `SELECT * FROM PerceelTb
       WHERE MeetbriefInf = @esri
          OR PerceelESRI = @esri
       ORDER BY PerceelNummer`,
      { esri },
    );
    if (parcels.length === 0) {
      parcels = await querySystem(
        systemKey,
        `SELECT * FROM PerceelTb
         WHERE MeetbriefInf LIKE @esriLike
            OR PerceelESRI LIKE @esriLike
         ORDER BY PerceelNummer`,
        { esriLike: `%${esri}%` },
      );
    }
  }

  if (parcels.length === 0) {
    throw new NotFoundError(`Parcel "${esri}" not found`);
  }

  return parcels;
}

function buildInClause(ids: number[], prefix: string): { clause: string; params: Record<string, number> } {
  const params: Record<string, number> = {};
  const clause = ids
    .map((id, index) => {
      const key = `${prefix}${index}`;
      params[key] = id;
      return `@${key}`;
    })
    .join(', ');
  return { clause, params };
}

function isRetiredFlag(row: {
  is_retired?: boolean;
  share_numerator?: number | null;
  share_denominator?: number | null;
}): boolean {
  return Boolean(row.is_retired);
}

export function validateOwnershipShares(
  candidates: Array<{
    deed_detail_id: number;
    is_retired: boolean;
    share_numerator: number | null;
    share_denominator: number | null;
  }>,
  options?: { treatAsRetiredIds?: number[] },
): OwnershipShareValidation {
  const treatAsRetired = new Set(options?.treatAsRetiredIds ?? []);
  const active = candidates.filter(
    (row) => !isRetiredFlag(row) && !treatAsRetired.has(row.deed_detail_id),
  );

  let incomplete = 0;
  let total: { num: number; den: number } | null = null;

  for (const row of active) {
    const num = row.share_numerator;
    const den = row.share_denominator;
    if (num == null || den == null || den === 0) {
      incomplete += 1;
      continue;
    }
    const share = simplifyFraction(num, den);
    total = total ? addFractions(total, share) : share;
  }

  const totalDisplay = total ? formatFraction(total) : null;
  const totalDecimal =
    total && total.den !== 0 ? Number((total.num / total.den).toFixed(6)) : null;
  const isValid =
    incomplete === 0 &&
    total != null &&
    total.num === total.den &&
    total.den > 0;

  let message: string;
  if (active.length === 0) {
    message = 'No active ownership rows remain.';
  } else if (incomplete > 0) {
    message = `${incomplete} active row(s) have missing or invalid share values.`;
  } else if (isValid) {
    message = 'Active ownership shares total 1.0 (100%).';
  } else {
    message = `Active ownership shares total ${totalDisplay ?? '—'} (${totalDecimal ?? '—'}), expected 1/1.`;
  }

  return {
    is_valid: isValid,
    active_count: active.length,
    total_numerator: total?.num ?? null,
    total_denominator: total?.den ?? null,
    total_display: totalDisplay,
    total_decimal: totalDecimal,
    expected_display: '1/1',
    incomplete_share_count: incomplete,
    message,
  };
}

function projectRemainingActive(
  candidates: RetireSubjectCandidate[],
  retireIds: number[],
): RetireSubjectCandidate[] {
  const retiring = new Set(retireIds);
  return candidates.filter((row) => !row.is_retired && !retiring.has(row.deed_detail_id));
}

export async function lookupRetireSubjectCandidates(input: {
  systemKey?: string;
  registerTitle: string;
  parcelEsri: string;
}): Promise<RetireSubjectLookupResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectColumns(dialect);

  const { deeds, title } = await resolveDeedsByTitle(systemKey, dialect, input.registerTitle);
  const parcels = await resolveParcelsByEsri(systemKey, dialect, input.parcelEsri);

  const deedIds = [
    ...new Set(
      deeds
        .map((deed) => getFieldNumber(deed, 'id', 'Id'))
        .filter((id): id is number => id != null && id > 0),
    ),
  ];
  const parcelIds = [
    ...new Set(
      parcels
        .map((parcel) => getFieldNumber(parcel, cols.parcelPk, 'id', 'Id', 'PerceelNummer'))
        .filter((id): id is number => id != null && id > 0),
    ),
  ];

  const deedIn = buildInClause(deedIds, 'deed');
  const plotIn = buildInClause(parcelIds, 'plot');

  const details = await querySystem(
    systemKey,
    `SELECT dd.*
     FROM DeedDetail dd
     WHERE dd.${cols.deedId} IN (${deedIn.clause})
       AND dd.${cols.plotId} IN (${plotIn.clause})
     ORDER BY dd.${cols.deedDetailId}`,
    { ...deedIn.params, ...plotIn.params },
  );

  const subjectIds = [
    ...new Set(
      details
        .map((row) => getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId'))
        .filter((id): id is number => id != null && id > 0),
    ),
  ];

  const subjectsById = new Map<number, Record<string, unknown>>();
  if (subjectIds.length > 0) {
    const subjectIn = buildInClause(subjectIds, 'sub');
    const subjects = await querySystem(
      systemKey,
      `SELECT * FROM [Subject] WHERE ${cols.subjectPk} IN (${subjectIn.clause})`,
      subjectIn.params,
    );
    for (const subject of subjects) {
      const id = getFieldNumber(subject, cols.subjectPk, 'id', 'Id', 'SubjectID');
      if (id != null) subjectsById.set(id, subject);
    }
  }

  const parcelEsriById = new Map<number, string | null>();
  for (const parcel of parcels) {
    const id = getFieldNumber(parcel, cols.parcelPk, 'id', 'Id', 'PerceelNummer');
    if (id == null) continue;
    parcelEsriById.set(
      id,
      getFieldString(parcel, cols.parcelEsri, 'esri', 'MeetbriefInf', 'PerceelESRI'),
    );
  }

  const candidates = details.flatMap((row): RetireSubjectCandidate[] => {
    const deedDetailId = getFieldNumber(row, cols.deedDetailId, 'id', 'Id');
    const deedId = getFieldNumber(row, cols.deedId, 'deedId', 'DeedID');
    const parcelId = getFieldNumber(row, cols.plotId, 'plotId', 'PlotId');
    const subjectId = getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId');
    if (
      deedDetailId == null ||
      deedId == null ||
      parcelId == null ||
      subjectId == null
    ) {
      return [];
    }

    const subject = subjectsById.get(subjectId);
    const retiredRaw = getFieldNumber(row, cols.isRetired, 'isRetired', 'IsRetired');
    const retiredFlag =
      retiredRaw === 1 ||
      String(getFieldString(row, cols.isRetired, 'isRetired', 'IsRetired') ?? '')
        .toLowerCase()
        .trim() === 'true';

    return [
      {
        deed_detail_id: deedDetailId,
        deed_id: deedId,
        register_title: title,
        parcel_id: parcelId,
        parcel_esri: parcelEsriById.get(parcelId) ?? input.parcelEsri.trim(),
        subject_id: subjectId,
        subject_name: subject ? buildSubjectName(subject) : `Subject #${subjectId}`,
        share_numerator: getFieldNumber(row, cols.shareNum, 'shareNumerator', 'ShareNumerator'),
        share_denominator: getFieldNumber(
          row,
          cols.shareDen,
          'shareDenominator',
          'ShareDenominator',
        ),
        is_retired: retiredFlag,
        legal_fact_type_id: getFieldNumber(row, cols.typeId, 'legalFactTypeId', 'DeedTypeId'),
      },
    ];
  });

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    register_title: title,
    parcel_esri: input.parcelEsri.trim(),
    deed_ids: deedIds,
    parcel_ids: parcelIds,
    candidates,
    share_validation: validateOwnershipShares(candidates),
  };
}

export async function retireSubjectFromDeed(input: {
  systemKey?: string;
  deedDetailIds: number[];
  previewOnly: boolean;
  confirm?: boolean;
  updatedBy?: string;
}): Promise<RetireSubjectResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectColumns(dialect);

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to retire the selected subject row(s).',
    );
  }

  const deedDetailIds = [
    ...new Set(
      (input.deedDetailIds ?? []).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (deedDetailIds.length === 0) {
    throw new ValidationError('Select at least one DeedDetail row to retire');
  }

  const detailIn = buildInClause(deedDetailIds, 'dd');
  const details = await querySystem(
    systemKey,
    `SELECT dd.* FROM DeedDetail dd WHERE dd.${cols.deedDetailId} IN (${detailIn.clause})`,
    detailIn.params,
  );
  if (details.length === 0) {
    throw new NotFoundError('No DeedDetail rows found for the selected ids');
  }

  const subjectIds = [
    ...new Set(
      details
        .map((row) => getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId'))
        .filter((id): id is number => id != null && id > 0),
    ),
  ];
  const subjectsById = new Map<number, Record<string, unknown>>();
  if (subjectIds.length > 0) {
    const subjectIn = buildInClause(subjectIds, 'sub');
    const subjects = await querySystem(
      systemKey,
      `SELECT * FROM [Subject] WHERE ${cols.subjectPk} IN (${subjectIn.clause})`,
      subjectIn.params,
    );
    for (const subject of subjects) {
      const id = getFieldNumber(subject, cols.subjectPk, 'id', 'Id', 'SubjectID');
      if (id != null) subjectsById.set(id, subject);
    }
  }

  const changes: RetireSubjectChange[] = details.map((row) => {
    const deedDetailId = getFieldNumber(row, cols.deedDetailId, 'id', 'Id') ?? 0;
    const subjectId = getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId') ?? 0;
    const subject = subjectsById.get(subjectId);
    const retiredRaw = getFieldNumber(row, cols.isRetired, 'isRetired', 'IsRetired');
    const fromRetired =
      retiredRaw === 1 ||
      String(getFieldString(row, cols.isRetired, 'isRetired', 'IsRetired') ?? '')
        .toLowerCase()
        .trim() === 'true';

    return {
      deed_detail_id: deedDetailId,
      deed_id: getFieldNumber(row, cols.deedId, 'deedId', 'DeedID') ?? 0,
      register_title: null,
      parcel_id: getFieldNumber(row, cols.plotId, 'plotId', 'PlotId'),
      parcel_esri: null,
      subject_id: subjectId,
      subject_name: subject ? buildSubjectName(subject) : `Subject #${subjectId}`,
      from_is_retired: fromRetired,
      to_is_retired: true,
      raw: serializeRow(row),
    };
  });

  const toUpdate = changes.filter((change) => !change.from_is_retired);
  if (toUpdate.length === 0) {
    throw new ValidationError('Selected DeedDetail row(s) are already retired');
  }

  // Rebuild ownership context for the same deed+plot pairs so share totals stay meaningful.
  const contextDeedIds = [
    ...new Set(toUpdate.map((change) => change.deed_id).filter((id) => id > 0)),
  ];
  const contextPlotIds = [
    ...new Set(
      toUpdate
        .map((change) => change.parcel_id)
        .filter((id): id is number => id != null && id > 0),
    ),
  ];

  let contextCandidates: RetireSubjectCandidate[] = [];
  if (contextDeedIds.length > 0 && contextPlotIds.length > 0) {
    const deedIn = buildInClause(contextDeedIds, 'cdeed');
    const plotIn = buildInClause(contextPlotIds, 'cplot');
    const contextRows = await querySystem(
      systemKey,
      `SELECT dd.*
       FROM DeedDetail dd
       WHERE dd.${cols.deedId} IN (${deedIn.clause})
         AND dd.${cols.plotId} IN (${plotIn.clause})
       ORDER BY dd.${cols.deedDetailId}`,
      { ...deedIn.params, ...plotIn.params },
    );

    const contextSubjectIds = [
      ...new Set(
        contextRows
          .map((row) => getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId'))
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
    const contextSubjects = new Map<number, Record<string, unknown>>();
    if (contextSubjectIds.length > 0) {
      const subjectIn = buildInClause(contextSubjectIds, 'csub');
      const subjects = await querySystem(
        systemKey,
        `SELECT * FROM [Subject] WHERE ${cols.subjectPk} IN (${subjectIn.clause})`,
        subjectIn.params,
      );
      for (const subject of subjects) {
        const id = getFieldNumber(subject, cols.subjectPk, 'id', 'Id', 'SubjectID');
        if (id != null) contextSubjects.set(id, subject);
      }
    }

    contextCandidates = contextRows.flatMap((row): RetireSubjectCandidate[] => {
      const deedDetailId = getFieldNumber(row, cols.deedDetailId, 'id', 'Id');
      const deedId = getFieldNumber(row, cols.deedId, 'deedId', 'DeedID');
      const parcelId = getFieldNumber(row, cols.plotId, 'plotId', 'PlotId');
      const subjectId = getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId');
      if (
        deedDetailId == null ||
        deedId == null ||
        parcelId == null ||
        subjectId == null
      ) {
        return [];
      }
      const subject = contextSubjects.get(subjectId);
      const retiredRaw = getFieldNumber(row, cols.isRetired, 'isRetired', 'IsRetired');
      const retiredFlag =
        retiredRaw === 1 ||
        String(getFieldString(row, cols.isRetired, 'isRetired', 'IsRetired') ?? '')
          .toLowerCase()
          .trim() === 'true';
      return [
        {
          deed_detail_id: deedDetailId,
          deed_id: deedId,
          register_title: '',
          parcel_id: parcelId,
          parcel_esri: null,
          subject_id: subjectId,
          subject_name: subject ? buildSubjectName(subject) : `Subject #${subjectId}`,
          share_numerator: getFieldNumber(row, cols.shareNum, 'shareNumerator', 'ShareNumerator'),
          share_denominator: getFieldNumber(
            row,
            cols.shareDen,
            'shareDenominator',
            'ShareDenominator',
          ),
          is_retired: retiredFlag,
          legal_fact_type_id: getFieldNumber(row, cols.typeId, 'legalFactTypeId', 'DeedTypeId'),
        },
      ];
    });
  }

  const retireIds = toUpdate.map((change) => change.deed_detail_id);
  const projectedValidation = validateOwnershipShares(contextCandidates, {
    treatAsRetiredIds: retireIds,
  });
  const remainingActive = projectRemainingActive(contextCandidates, retireIds);

  if (input.previewOnly) {
    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      preview_only: true,
      change_count: toUpdate.length,
      changes: toUpdate,
      share_validation: projectedValidation,
      remaining_active: remainingActive,
    };
  }

  const updateIds = toUpdate.map((change) => change.deed_detail_id);
  const updateIn = buildInClause(updateIds, 'upd');
  const updatedBy = (input.updatedBy ?? 'dataaxis-hulp').trim().slice(0, 250);

  // Prefer audit columns when present (Tereno); Kadaster may only have IsRetired.
  try {
    await executeSystem(
      systemKey,
      `UPDATE DeedDetail
       SET ${cols.isRetired} = 1,
           updatedAt = SYSUTCDATETIME(),
           updatedBy = @updatedBy
       WHERE ${cols.deedDetailId} IN (${updateIn.clause})
         AND ISNULL(${cols.isRetired}, 0) = 0`,
      { ...updateIn.params, updatedBy },
    );
  } catch {
    await executeSystem(
      systemKey,
      `UPDATE DeedDetail
       SET ${cols.isRetired} = 1
       WHERE ${cols.deedDetailId} IN (${updateIn.clause})
         AND ISNULL(${cols.isRetired}, 0) = 0`,
      updateIn.params,
    );
  }

  const afterCandidates = contextCandidates.map((row) =>
    retireIds.includes(row.deed_detail_id) ? { ...row, is_retired: true } : row,
  );

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    preview_only: false,
    change_count: toUpdate.length,
    changes: toUpdate,
    share_validation: validateOwnershipShares(afterCandidates),
    remaining_active: afterCandidates.filter((row) => !row.is_retired),
  };
}

export async function correctOwnershipShare(input: {
  systemKey?: string;
  deedDetailId: number;
  shareNumerator: number;
  shareDenominator: number;
  previewOnly: boolean;
  confirm?: boolean;
  updatedBy?: string;
  /** Optional context to recompute totals after the edit. */
  contextCandidates?: RetireSubjectCandidate[];
}): Promise<CorrectOwnershipShareResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectColumns(dialect);

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to update the ownership share.',
    );
  }

  if (
    !Number.isInteger(input.shareNumerator) ||
    input.shareNumerator < 0 ||
    !Number.isInteger(input.shareDenominator) ||
    input.shareDenominator <= 0
  ) {
    throw new ValidationError('Share must use a non-negative numerator and a positive denominator');
  }

  const rows = await querySystem(
    systemKey,
    `SELECT dd.* FROM DeedDetail dd WHERE dd.${cols.deedDetailId} = @deedDetailId`,
    { deedDetailId: input.deedDetailId },
  );
  if (rows.length === 0) {
    throw new NotFoundError(`DeedDetail ${input.deedDetailId} not found`);
  }

  const row = rows[0];
  const subjectId = getFieldNumber(row, cols.subjectId, 'subjectId', 'SubjectId') ?? 0;
  let subjectName = `Subject #${subjectId}`;
  if (subjectId > 0) {
    const subjects = await querySystem(
      systemKey,
      `SELECT * FROM [Subject] WHERE ${cols.subjectPk} = @subjectId`,
      { subjectId },
    );
    if (subjects[0]) subjectName = buildSubjectName(subjects[0]);
  }

  const fromNum = getFieldNumber(row, cols.shareNum, 'shareNumerator', 'ShareNumerator');
  const fromDen = getFieldNumber(row, cols.shareDen, 'shareDenominator', 'ShareDenominator');
  const simplified = simplifyFraction(input.shareNumerator, input.shareDenominator);

  const context = (input.contextCandidates ?? []).map((candidate) =>
    candidate.deed_detail_id === input.deedDetailId
      ? {
          ...candidate,
          share_numerator: simplified.num,
          share_denominator: simplified.den,
        }
      : candidate,
  );
  const shareValidation =
    context.length > 0
      ? validateOwnershipShares(context)
      : validateOwnershipShares([
          {
            deed_detail_id: input.deedDetailId,
            is_retired: false,
            share_numerator: simplified.num,
            share_denominator: simplified.den,
          },
        ]);

  if (input.previewOnly) {
    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      preview_only: true,
      deed_detail_id: input.deedDetailId,
      subject_id: subjectId,
      subject_name: subjectName,
      from_share_numerator: fromNum,
      from_share_denominator: fromDen,
      to_share_numerator: simplified.num,
      to_share_denominator: simplified.den,
      share_validation: shareValidation,
    };
  }

  const updatedBy = (input.updatedBy ?? 'dataaxis-hulp').trim().slice(0, 250);
  try {
    await executeSystem(
      systemKey,
      `UPDATE DeedDetail
       SET ${cols.shareNum} = @shareNumerator,
           ${cols.shareDen} = @shareDenominator,
           updatedAt = SYSUTCDATETIME(),
           updatedBy = @updatedBy
       WHERE ${cols.deedDetailId} = @deedDetailId`,
      {
        shareNumerator: simplified.num,
        shareDenominator: simplified.den,
        updatedBy,
        deedDetailId: input.deedDetailId,
      },
    );
  } catch {
    await executeSystem(
      systemKey,
      `UPDATE DeedDetail
       SET ${cols.shareNum} = @shareNumerator,
           ${cols.shareDen} = @shareDenominator
       WHERE ${cols.deedDetailId} = @deedDetailId`,
      {
        shareNumerator: simplified.num,
        shareDenominator: simplified.den,
        deedDetailId: input.deedDetailId,
      },
    );
  }

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    preview_only: false,
    deed_detail_id: input.deedDetailId,
    subject_id: subjectId,
    subject_name: subjectName,
    from_share_numerator: fromNum,
    from_share_denominator: fromDen,
    to_share_numerator: simplified.num,
    to_share_denominator: simplified.den,
    share_validation: shareValidation,
  };
}
