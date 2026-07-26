import { NotFoundError } from '../../utils/AppError';
import {
  DEFAULT_SYSTEM_KEY,
  getField,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  querySafe,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import { resolveParcelSplitInfo } from './support.parcel.split';
import {
  buildSubjectName,
  deedRef,
  formatDate,
  formatDateTime,
  formatFraction,
  formatPrice,
  groupParties,
  simplifyFraction,
  toBool,
} from './inzage.helpers';
import type {
  InzageDeedRef,
  InzageEntry,
  InzageObjectReport,
  InzageObjectVariant,
  InzageParty,
  InzageSection,
} from './inzage.types';

const APPROVED = 3;

const OWNERSHIP_TYPES = [1];
const GROUNDLEASE_TYPES = [4, 8, 9];
const LIMITED_RIGHTS_TYPES = [2, 3, 5, 6, 7];
const ANNOTATION_TYPES = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];
const MORTGAGE_TYPES = [39, 41, 1047];
const SEIZURE_TYPES = [36, 38];

const TITLE_BY_VARIANT: Record<InzageObjectVariant, string> = {
  object: 'Kadastraal uittreksel (object)',
  object_beperkt: 'Kadastraal uittreksel (object beperkt)',
  her: 'Kadastraal uittreksel (HER)',
  na: 'Kadastraal uittreksel (NA)',
};

/** Base SELECT for deed + deed-detail rows filtered by legal-fact type ids (Kadaster). */
function deedDetailQuery(typeIds: number[]): { sql: string; typeParams: Record<string, number> } {
  const typeParams: Record<string, number> = {};
  const placeholders = typeIds.map((id, index) => {
    const key = `t${index}`;
    typeParams[key] = id;
    return `@${key}`;
  });

  const sql = `
    SELECT d.id AS deedId, lfr.register AS legalFactRegister, d.Segment AS segment, d.[Number] AS number,
           d.Value AS value, d.DeedDate AS deedDate, d.DeedSubmissionDate AS deedSubmissionDate,
           d.typeDescription AS deedTypeDescription,
           n.NotarisNaam AS notary, lf.legalFactNed AS legalFactNl, lf.legalFactEng AS legalFactEn,
           lf.code AS legalFactCode,
           dd.DeedTypeId AS legalFactTypeId, dt.[Description] AS legalFactTypeDescription,
           dd.SubjectId AS SubjectId, dd.ShareNumerator AS shareNum, dd.ShareDenominator AS shareDen,
           dd.Note AS note, dd.TransactionRoleId AS transactionRoleId,
           tr.nameNe AS roleNe, tr.sectionCode AS sectionCode,
           cur.Symbol AS currency,
           s.SubjectNaamVoor AS firstName, s.SubjectNaamTussen AS middleName, s.SubjectNaam AS lastName
    FROM Deed d
    INNER JOIN DeedDetail dd ON dd.DeedID = d.id
    LEFT JOIN LegalFactRegister lfr ON lfr.id = d.DeedTypeId
    LEFT JOIN LegalFact lf ON lf.id = d.MethodOfAcquisition
    LEFT JOIN Notaris n ON n.NotariaID = d.NotaryId
    LEFT JOIN DeedType dt ON dt.Id = dd.DeedTypeId
    LEFT JOIN TransactionRole tr ON tr.id = dd.TransactionRoleId
    LEFT JOIN Currency cur ON cur.Id = d.CurrencyId
    LEFT JOIN [Subject] s ON s.SubjectID = dd.SubjectId
    WHERE dd.DeedTypeId IN (${placeholders.join(', ')})
      AND dd.ApprovalId = @approved
      AND dd.IsRetired = 0
      AND dd.PlotId = @parcelId
      AND NOT EXISTS (
        SELECT 1 FROM DeedProcedure dp
        WHERE dp.Id = dd.DeedProcedureID AND dp.ProcedureEN = 'Termination'
      )
    ORDER BY d.Segment, d.[Number], d.id`;

  return { sql, typeParams };
}

/** Tereno / DLV Aruba deed-detail query (Parcel.id ↔ DeedDetail.plotId). */
function deedDetailQueryTereno(typeIds: number[]): { sql: string; typeParams: Record<string, number> } {
  const typeParams: Record<string, number> = {};
  const placeholders = typeIds.map((id, index) => {
    const key = `t${index}`;
    typeParams[key] = id;
    return `@${key}`;
  });

  const sql = `
    SELECT d.id AS deedId, lfr.register AS legalFactRegister, d.segment AS segment, d.number AS number,
           d.value AS value, d.deedDate AS deedDate, d.deedSubmissionDate AS deedSubmissionDate,
           d.typeDescription AS deedTypeDescription,
           n.name AS notary, lf.nameNl AS legalFactNl, lf.nameEn AS legalFactEn,
           lf.code AS legalFactCode,
           dd.legalFactTypeId AS legalFactTypeId, dt.description AS legalFactTypeDescription,
           dd.subjectId AS SubjectId, dd.shareNumerator AS shareNum, dd.shareDenominator AS shareDen,
           dd.note AS note, dd.transactionRoleId AS transactionRoleId,
           tr.nameNe AS roleNe, tr.sectionCode AS sectionCode,
           cur.symbol AS currency,
           s.firstName AS firstName, s.middleName AS middleName, s.lastName AS lastName
    FROM Deed d
    INNER JOIN DeedDetail dd ON dd.deedId = d.id
    LEFT JOIN LegalFactRegister lfr ON lfr.id = d.legalFactRegisterId
    LEFT JOIN LegalFact lf ON lf.id = d.legalFactId
    LEFT JOIN Notary n ON n.id = d.notaryId
    LEFT JOIN LegalFactType dt ON dt.id = dd.legalFactTypeId
    LEFT JOIN TransactionRole tr ON tr.id = dd.transactionRoleId
    LEFT JOIN Currency cur ON cur.id = d.currencyId
    LEFT JOIN [Subject] s ON s.id = dd.subjectId
    WHERE dd.legalFactTypeId IN (${placeholders.join(', ')})
      AND ISNULL(dd.isRetired, 0) = 0
      AND dd.plotId = @parcelId
      AND (dd.approvalId IS NULL OR dd.approvalId = @approved)
      AND NOT EXISTS (
        SELECT 1 FROM DeedProcedure dp
        WHERE dp.id = dd.deedProcedureId AND dp.procedureEN = 'Termination'
      )
    ORDER BY d.segment, d.number, d.id`;

  return { sql, typeParams };
}

async function fetchDeedDetails(
  systemKey: string,
  parcelId: number,
  typeIds: number[],
): Promise<Record<string, unknown>[]> {
  const dialect = await resolveSystemDialect(systemKey);
  const { sql, typeParams } = isTerenoDialect(dialect)
    ? deedDetailQueryTereno(typeIds)
    : deedDetailQuery(typeIds);
  return querySafe(systemKey, sql, { parcelId, approved: APPROVED, ...typeParams });
}

function groupByDeed(rows: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(getFieldNumber(row, 'deedId') ?? `${getFieldString(row, 'legalFactRegister')}-${getFieldNumber(row, 'segment')}-${getFieldNumber(row, 'number')}`);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function emptyEntry(): InzageEntry {
  return {
    parties: [],
    legalFact: null,
    obtainedLabel: null,
    typeDescription: null,
    deedDate: null,
    submissionDate: null,
    notary: null,
    note: null,
    amount: null,
    deed: { register: null, segment: null, number: null },
    extraLines: [],
    sourceDeeds: [],
  };
}

function baseEntry(rows: Record<string, unknown>[]): InzageEntry {
  const head = rows[0];
  return {
    parties: [],
    legalFact: getFieldString(head, 'legalFactNl', 'legalFactEn'),
    obtainedLabel: null,
    typeDescription: null,
    deedDate: formatDate(head.deedDate),
    submissionDate: formatDate(head.deedSubmissionDate),
    notary: getFieldString(head, 'notary'),
    note: getFieldString(head, 'note'),
    amount: null,
    deed: deedRef(head),
    extraLines: [],
    sourceDeeds: [],
  };
}

function ownerStyleSection(
  key: string,
  heading: string,
  rows: Record<string, unknown>[],
  obtainedLabel: string,
): InzageSection {
  const entries: InzageEntry[] = [];
  for (const group of groupByDeed(rows).values()) {
    const entry = baseEntry(group);
    entry.obtainedLabel = obtainedLabel;
    entry.parties = groupParties(group);
    entries.push(entry);
  }
  return { key, heading, emptyText: null, entries };
}

function limitedRightLabel(typeId: number | null): string {
  if (typeId === 2 || typeId === 5) return 'Recht van Opstal';
  if (typeId === 3 || typeId === 6) return 'Recht van Vruchtgebruik';
  if (typeId === 7) return 'Recht van gebruik en bewoning';
  return 'Beperkt recht';
}

function mortgageTypeLabel(row: Record<string, unknown>): string {
  const code = getFieldString(row, 'legalFactCode');
  const description = getFieldString(row, 'legalFactTypeDescription');
  if (code === 'MO_AR') return 'Wijziging recht van hypotheek';
  if (code === 'ND_AS') return 'Cessie / Subrogatie';
  return description ?? 'Recht van hypotheek';
}

/** Cessie/Subrogatie/Wijziging label for a mortgage amendment row. */
function amendmentTypeLabel(row: Record<string, unknown>): string {
  const code = getFieldString(row, 'legalFactCode');
  const procedureId = getFieldNumber(row, 'deedProcedureId');
  if (code === 'MO_AR') return 'Wijziging';
  if (code === 'ND_AS') {
    if (procedureId === 1092) return 'Cessie';
    if (procedureId === 1093) return 'Subrogatie';
  }
  return getFieldString(row, 'legalFactTypeDescription') ?? 'Wijziging';
}

const MANDELIG_DEED_SELECT = `
  d.id AS deedId, lfr.register AS legalFactRegister, d.Segment AS segment, d.[Number] AS number,
  d.DeedDate AS deedDate, d.DeedSubmissionDate AS deedSubmissionDate, n.NotarisNaam AS notary,
  lf.legalFactNed AS legalFactNl, lf.legalFactEng AS legalFactEn`;

async function fetchMandeligDeeds(
  systemKey: string,
  parcelId: number,
  role: 'main' | 'share',
): Promise<Record<string, unknown>[]> {
  if (isTerenoDialect(await resolveSystemDialect(systemKey))) {
    const column = role === 'main' ? 'mainParcelId' : 'shareParcelId';
    return querySafe(
      systemKey,
      `SELECT d.id AS deedId, lfr.register AS legalFactRegister, d.segment AS segment, d.number AS number,
              d.deedDate AS deedDate, d.deedSubmissionDate AS deedSubmissionDate, n.name AS notary,
              lf.nameNl AS legalFactNl, lf.nameEn AS legalFactEn
       FROM Deed d
       INNER JOIN DeedDetail dd ON dd.deedId = d.id
       INNER JOIN ShareGroup mg ON mg.deedDetailId = dd.id
       LEFT JOIN LegalFactRegister lfr ON lfr.id = d.legalFactRegisterId
       LEFT JOIN LegalFact lf ON lf.id = d.legalFactId
       LEFT JOIN Notary n ON n.id = d.notaryId
       WHERE mg.${column} = @parcelId
         AND ISNULL(mg.isRetired, 0) = 0
         AND (mg.approvalId IS NULL OR mg.approvalId = @approved)
       ORDER BY d.number, d.id`,
      { parcelId, approved: APPROVED },
    );
  }

  const column = role === 'main' ? 'parcel' : 'mandelig_parcel';
  return querySafe(
    systemKey,
    `SELECT ${MANDELIG_DEED_SELECT}
     FROM Deed d
     INNER JOIN DeedDetail dd ON dd.DeedID = d.id
     INNER JOIN MandeligGroep mg ON mg.DeedDetailID = dd.Id
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.DeedTypeId
     LEFT JOIN LegalFact lf ON lf.id = d.MethodOfAcquisition
     LEFT JOIN Notaris n ON n.NotariaID = d.NotaryId
     WHERE mg.${column} = @parcelId AND mg.ApprovalId = @approved AND mg.IsRetired = 0
     ORDER BY d.[Number], d.id`,
    { parcelId, approved: APPROVED },
  );
}

async function fetchMandeligMembers(
  systemKey: string,
  parcelId: number,
  role: 'main' | 'share',
): Promise<string[]> {
  if (isTerenoDialect(await resolveSystemDialect(systemKey))) {
    const filterColumn = role === 'main' ? 'mainParcelId' : 'shareParcelId';
    const joinColumn = role === 'main' ? 'shareParcelId' : 'mainParcelId';
    const rows = await querySafe(
      systemKey,
      `SELECT mg.shareNumerator AS shareNum, mg.shareDenominator AS shareDen,
              p.department AS department, p.section AS section, p.number AS number, p.esri AS esri
       FROM ShareGroup mg
       INNER JOIN Parcel p ON p.id = mg.${joinColumn}
       WHERE mg.${filterColumn} = @parcelId
         AND ISNULL(mg.isRetired, 0) = 0
         AND (mg.approvalId IS NULL OR mg.approvalId = @approved)`,
      { parcelId, approved: APPROVED },
    );

    return rows.map((row) => {
      const num = getFieldNumber(row, 'shareNum');
      const den = getFieldNumber(row, 'shareDen');
      const share =
        num != null && den != null && den !== 0
          ? formatFraction(simplifyFraction(num, den))
          : null;
      const parts = [
        `esri: ${getFieldString(row, 'esri') ?? '—'}`,
        `afdeling: ${getFieldString(row, 'department') ?? '—'}`,
        `sectie: ${getFieldString(row, 'section') ?? '—'}`,
        `nummer: ${getFieldString(row, 'number') ?? '—'}`,
      ];
      if (share) parts.push(`Aandeel: ${share}`);
      return `Kadastrale aanduiding: ${parts.join(', ')}`;
    });
  }

  const filterColumn = role === 'main' ? 'parcel' : 'mandelig_parcel';
  const joinColumn = role === 'main' ? 'mandelig_parcel' : 'parcel';
  const rows = await querySafe(
    systemKey,
    `SELECT mg.ShareNumerator AS shareNum, mg.ShareDenominator AS shareDen,
            p.PerceelAfdeling AS department, p.PerceelSectie AS section, p.PerCeelNummerID AS number
     FROM MandeligGroep mg
     INNER JOIN PerceelTb p ON p.PerceelNummer = mg.${joinColumn}
     WHERE mg.${filterColumn} = @parcelId AND mg.ApprovalId = @approved AND mg.IsRetired = 0`,
    { parcelId, approved: APPROVED },
  );

  return rows.map((row) => {
    const num = getFieldNumber(row, 'shareNum');
    const den = getFieldNumber(row, 'shareDen');
    const share = num != null && den != null && den !== 0 ? formatFraction(simplifyFraction(num, den)) : null;
    const parts = [
      `afdeling: ${getFieldString(row, 'department') ?? '—'}`,
      `sectie: ${getFieldString(row, 'section') ?? '—'}`,
      `nummer: ${getFieldString(row, 'number') ?? '—'}`,
    ];
    if (share) parts.push(`Aandeel: ${share}`);
    return `Kadastrale aanduiding: ${parts.join(', ')}`;
  });
}

async function fetchSplitsing(
  systemKey: string,
  parcelId: number,
): Promise<Record<string, unknown>[]> {
  return querySafe(
    systemKey,
    `SELECT d.id AS deedId, dd.Note AS note, lfr.register AS legalFactRegister,
            d.Segment AS segment, d.[Number] AS number, d.DeedDate AS deedDate,
            d.DeedSubmissionDate AS deedSubmissionDate, n.NotarisNaam AS notary,
            lf.legalFactNed AS legalFactNl, lf.legalFactEng AS legalFactEn
     FROM Deed d
     INNER JOIN DeedDetail dd ON dd.DeedID = d.id
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.DeedTypeId
     LEFT JOIN LegalFact lf ON lf.id = d.MethodOfAcquisition
     LEFT JOIN Notaris n ON n.NotariaID = d.NotaryId
     WHERE dd.DeedTypeId = 13 AND dd.ApprovalId = @approved AND dd.IsRetired = 0
       AND NOT EXISTS (SELECT 1 FROM DeedProcedure dp WHERE dp.Id = dd.DeedProcedureID AND dp.ProcedureEN = 'Termination')
       AND EXISTS (
         SELECT 1 FROM DeedDetailAantekeningPerceel a
         WHERE a.deeddetailid = dd.Id AND a.approvalId = @approved AND a.isretired = 0 AND a.plotid = @parcelId
       )
     ORDER BY d.Segment, d.[Number], d.id`,
    { parcelId, approved: APPROVED },
  );
}

interface OldAnnotationRow {
  notes: string | null;
  deedDate: string | null;
  submissionDate: string | null;
  notary: string | null;
  register: string | null;
  segment: number | null;
  number: number | null;
  interestedParties: string[];
  sufferers: string[];
}

async function fetchOldAnnotations(
  systemKey: string,
  parcelId: number,
): Promise<OldAnnotationRow[]> {
  const registers = await querySafe(
    systemKey,
    `SELECT r.RegisterBijzonderheden AS notes, r.RegisterAkteTypeID AS register,
            r.RegisterDatumIn AS deedDate, r.RegisterDatumInlevering AS submissionDate,
            n.NotarisNaam AS notary, r.RegisterDeel AS segment, r.RegisterNummer AS number,
            r.RegisterSubjectGroepID0 AS grp0, r.RegisterSubjectGroepID1 AS grp1
     FROM Register r
     LEFT JOIN Notaris n ON n.NotariaID = r.RegisterNotarisID
     WHERE r.RegisterStatus = 'g'
       AND (r.DeedId = 0 OR r.DeedId IS NULL)
       AND (r.RegisterAkteTypeID IS NULL OR r.RegisterAkteTypeID NOT IN ('D', 'Bd', 'Dd', 'B', 'C'))
       AND r.RegisterPerceelGroepID IN (
         SELECT Perceelgroepkey FROM PerceelGroep WHERE PerceelGroepPerceelID = @parcelId
       )`,
    { parcelId },
  );

  const result: OldAnnotationRow[] = [];
  for (const register of registers) {
    const grp0 = getFieldNumber(register, 'grp0');
    const grp1 = getFieldNumber(register, 'grp1');
    const groupIds = [grp0, grp1].filter((id): id is number => id != null && id > 0);

    const interestedParties: string[] = [];
    const sufferers: string[] = [];
    if (groupIds.length > 0) {
      const params: Record<string, unknown> = {};
      const placeholders = groupIds.map((id, index) => {
        params[`g${index}`] = id;
        return `@g${index}`;
      });
      const subjectRows = await querySafe(
        systemKey,
        `SELECT sg.SubjectGroepID AS groupId, s.SubjectNaamVoor AS firstName,
                s.SubjectNaamTussen AS middleName, s.SubjectNaam AS lastName
         FROM Subjectgroep sg
         LEFT JOIN [Subject] s ON s.SubjectID = sg.SubjectID
         WHERE sg.SubjectGroepID IN (${placeholders.join(', ')})`,
        params,
      );
      for (const subjectRow of subjectRows) {
        const name = buildSubjectName(subjectRow);
        if (getFieldNumber(subjectRow, 'groupId') === grp0) interestedParties.push(name);
        else sufferers.push(name);
      }
    }

    result.push({
      notes: getFieldString(register, 'notes'),
      deedDate: formatDate(register.deedDate),
      submissionDate: formatDate(register.submissionDate),
      notary: getFieldString(register, 'notary'),
      register: getFieldString(register, 'register'),
      segment: getFieldNumber(register, 'segment'),
      number: getFieldNumber(register, 'number'),
      interestedParties,
      sufferers,
    });
  }
  return result;
}

/** Ownership share per subject on a parcel, used to enrich Beslag debtors. */
async function fetchOwnershipShareMap(
  systemKey: string,
  parcelId: number,
): Promise<Map<number, string>> {
  const rows = isTerenoDialect(await resolveSystemDialect(systemKey))
    ? await querySafe(
        systemKey,
        `SELECT dd.legalFactTypeId AS legalFactTypeId, dd.subjectId AS SubjectId,
                dd.shareNumerator AS shareNum, dd.shareDenominator AS shareDen
         FROM DeedDetail dd
         WHERE dd.plotId = @parcelId AND dd.legalFactTypeId IN (1, 4, 8, 9)
           AND ISNULL(dd.isRetired, 0) = 0
           AND (dd.approvalId IS NULL OR dd.approvalId = @approved)
           AND NOT EXISTS (
             SELECT 1 FROM DeedProcedure dp
             WHERE dp.id = dd.deedProcedureId AND dp.procedureEN = 'Termination'
           )`,
        { parcelId, approved: APPROVED },
      )
    : await querySafe(
        systemKey,
        `SELECT dd.DeedTypeId AS legalFactTypeId, dd.SubjectId AS SubjectId,
                dd.ShareNumerator AS shareNum, dd.ShareDenominator AS shareDen
         FROM DeedDetail dd
         WHERE dd.PlotId = @parcelId AND dd.DeedTypeId IN (1, 4, 8, 9)
           AND dd.ApprovalId = @approved AND dd.IsRetired = 0
           AND NOT EXISTS (SELECT 1 FROM DeedProcedure dp WHERE dp.Id = dd.DeedProcedureID AND dp.ProcedureEN = 'Termination')`,
        { parcelId, approved: APPROVED },
      );

  const hasGroundLease = rows.some((row) => {
    const type = getFieldNumber(row, 'legalFactTypeId');
    return type === 4 || type === 8 || type === 9;
  });
  const preferred = rows.filter((row) => {
    const type = getFieldNumber(row, 'legalFactTypeId');
    return hasGroundLease ? type === 4 || type === 8 || type === 9 : type === 1;
  });

  const map = new Map<number, string>();
  const bySubject = new Map<number, { num: number; den: number } | null>();
  for (const row of preferred) {
    const subjectId = getFieldNumber(row, 'SubjectId');
    if (subjectId == null) continue;
    const num = getFieldNumber(row, 'shareNum');
    const den = getFieldNumber(row, 'shareDen');
    if (num == null || den == null || den === 0) {
      if (!bySubject.has(subjectId)) bySubject.set(subjectId, null);
      continue;
    }
    const current = bySubject.get(subjectId);
    const simplified = simplifyFraction(num, den);
    if (current) {
      const combinedNum = current.num * simplified.den + simplified.num * current.den;
      const combinedDen = current.den * simplified.den;
      bySubject.set(subjectId, simplifyFraction(combinedNum, combinedDen));
    } else {
      bySubject.set(subjectId, simplified);
    }
  }
  for (const [subjectId, fraction] of bySubject.entries()) {
    const text = fraction ? formatFraction(fraction) : null;
    if (text) map.set(subjectId, text);
  }
  return map;
}

async function fetchMortgageAmendments(
  systemKey: string,
  baseDeedIds: number[],
): Promise<Record<string, unknown>[]> {
  if (baseDeedIds.length === 0) return [];
  const params: Record<string, unknown> = { approved: APPROVED };
  const placeholders = baseDeedIds.map((id, index) => {
    params[`b${index}`] = id;
    return `@b${index}`;
  });
  return querySafe(
    systemKey,
    `SELECT d.id AS deedId, dd.amendedDeedId AS amendedDeedId, dd.DeedProcedureID AS deedProcedureId,
            lfr.register AS legalFactRegister, d.Segment AS segment, d.[Number] AS number,
            d.DeedDate AS deedDate, d.DeedSubmissionDate AS deedSubmissionDate, n.NotarisNaam AS notary,
            cur.Symbol AS currency, d.Value AS value, lf.code AS legalFactCode,
            dt.[Description] AS legalFactTypeDescription,
            dd.SubjectId AS SubjectId, dd.ShareNumerator AS shareNum, dd.ShareDenominator AS shareDen,
            tr.nameNe AS roleNe,
            s.SubjectNaamVoor AS firstName, s.SubjectNaamTussen AS middleName, s.SubjectNaam AS lastName
     FROM Deed d
     INNER JOIN DeedDetail dd ON dd.DeedID = d.id
     LEFT JOIN LegalFact lf ON lf.id = d.MethodOfAcquisition
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.DeedTypeId
     LEFT JOIN DeedType dt ON dt.Id = dd.DeedTypeId
     LEFT JOIN Notaris n ON n.NotariaID = d.NotaryId
     LEFT JOIN Currency cur ON cur.Id = d.CurrencyId
     LEFT JOIN TransactionRole tr ON tr.id = dd.TransactionRoleId
     LEFT JOIN [Subject] s ON s.SubjectID = dd.SubjectId
     WHERE lf.code IN ('MO_AR', 'ND_AS') AND dd.amendedDeedId IN (${placeholders.join(', ')})
       AND dd.ApprovalId = @approved AND dd.IsRetired = 0
     ORDER BY d.Segment, d.[Number], d.id`,
    params,
  );
}

export async function buildObjectInzage(input: {
  parcelId: number;
  systemKey?: string;
  variant?: InzageObjectVariant;
}): Promise<InzageObjectReport> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const variant = input.variant ?? 'object';
  const system = await resolveSupportSystem(systemKey);
  const tereno = isTerenoDialect(system.dialect);

  const parcels = tereno
    ? await querySafe(systemKey, 'SELECT * FROM Parcel WHERE id = @parcelId', {
        parcelId: input.parcelId,
      })
    : await querySafe(
        systemKey,
        'SELECT * FROM PerceelTb WHERE PerceelNummer = @parcelId',
        { parcelId: input.parcelId },
      );
  if (parcels.length === 0) {
    throw new NotFoundError(`Parcel ${input.parcelId} not found in ${system.system_name}`);
  }
  const parcel = parcels[0];

  const terenoSplit = tereno
    ? await resolveParcelSplitInfo(
        systemKey,
        input.parcelId,
        getFieldString(parcel, 'esri'),
        getField(parcel, 'splitFlag'),
      )
    : null;

  const splitFlag = tereno
    ? Boolean(terenoSplit && terenoSplit.role !== 'none')
    : toBool(getField(parcel, 'VoorgenomenSplitsingIndicatie'));

  const [
    ownership,
    groundlease,
    limited,
    annotations,
    mortgages,
    seizures,
    mandeligMainDeeds,
    mandeligMainMembers,
    mandeligShareDeeds,
    mandeligShareMembers,
    splitsing,
    oldAnnotations,
    ownershipShares,
  ] = await Promise.all([
    fetchDeedDetails(systemKey, input.parcelId, OWNERSHIP_TYPES),
    fetchDeedDetails(systemKey, input.parcelId, GROUNDLEASE_TYPES),
    fetchDeedDetails(systemKey, input.parcelId, LIMITED_RIGHTS_TYPES),
    fetchDeedDetails(systemKey, input.parcelId, ANNOTATION_TYPES),
    fetchDeedDetails(systemKey, input.parcelId, MORTGAGE_TYPES),
    fetchDeedDetails(systemKey, input.parcelId, SEIZURE_TYPES),
    fetchMandeligDeeds(systemKey, input.parcelId, 'main'),
    fetchMandeligMembers(systemKey, input.parcelId, 'main'),
    fetchMandeligDeeds(systemKey, input.parcelId, 'share'),
    fetchMandeligMembers(systemKey, input.parcelId, 'share'),
    !tereno && splitFlag ? fetchSplitsing(systemKey, input.parcelId) : Promise.resolve([]),
    tereno ? Promise.resolve([]) : fetchOldAnnotations(systemKey, input.parcelId),
    fetchOwnershipShareMap(systemKey, input.parcelId),
  ]);

  const sections: InzageSection[] = [];

  if (terenoSplit && terenoSplit.role !== 'none') {
    const extraLines: string[] = [];
    if (terenoSplit.role === 'source') {
      extraLines.push('Deze parcel is gesplitst (bronperceel).');
      if (terenoSplit.child_esris.length > 0) {
        extraLines.push(`Nieuwe percelen: ${terenoSplit.child_esris.join(', ')}`);
      }
      if (terenoSplit.split_flag) {
        extraLines.push('Parcel.splitFlag = 1');
      }
    } else if (terenoSplit.role === 'result') {
      extraLines.push('Deze parcel is ontstaan uit een splitsing.');
      if (terenoSplit.parent_esri) {
        extraLines.push(
          `Bronperceel: ${terenoSplit.parent_esri}` +
            (terenoSplit.parent_parcel_id != null
              ? ` (id ${terenoSplit.parent_parcel_id})`
              : ''),
        );
      }
    }

    sections.push({
      key: 'splitsing',
      heading: 'Splitsing',
      emptyText: null,
      entries: [
        {
          parties: [],
          legalFact: null,
          obtainedLabel: null,
          typeDescription:
            terenoSplit.role === 'source' ? 'Bronperceel gesplitst' : 'Ontstaan uit splitsing',
          deedDate: null,
          submissionDate: null,
          notary: null,
          note: null,
          amount: null,
          deed: { register: null, segment: null, number: null },
          extraLines,
          sourceDeeds: [],
        },
      ],
    });
  }

  // Recht van Eigendom
  if (ownership.length > 0) {
    sections.push(ownerStyleSection('ownership', 'Recht van Eigendom', ownership, 'Verkregen bij'));
  }

  // Recht van Erfpacht
  if (groundlease.length > 0) {
    sections.push(
      ownerStyleSection('groundlease', 'Recht van Erfpacht', groundlease, 'Verkregen bij'),
    );
  }

  // Mandeligheid
  const mandeligEntries: InzageEntry[] = [];
  const mandeligMainGroups = [...groupByDeed(mandeligMainDeeds).values()];
  mandeligMainGroups.forEach((group, index) => {
    const entry = baseEntry(group);
    entry.obtainedLabel = index === 0 ? 'Tot Mandeligheid bestemd bij' : 'Mandeligheid gewijzigd bij';
    if (index === 0 && mandeligMainMembers.length > 0) {
      entry.extraLines = ['Hoofdperceel van mandelig perceel(en):', ...mandeligMainMembers];
    }
    mandeligEntries.push(entry);
  });
  if (mandeligMainGroups.length === 0 && mandeligMainMembers.length > 0) {
    mandeligEntries.push({
      ...emptyEntry(),
      extraLines: ['Hoofdperceel van mandelig perceel(en):', ...mandeligMainMembers],
    });
  }
  for (const group of groupByDeed(mandeligShareDeeds).values()) {
    const entry = baseEntry(group);
    entry.obtainedLabel = 'Tot Mandeligheid bestemd bij';
    if (mandeligShareMembers.length > 0) {
      entry.extraLines = ['Mandelig perceel; hoofdperceel:', ...mandeligShareMembers];
    }
    mandeligEntries.push(entry);
  }
  if (mandeligEntries.length > 0) {
    sections.push({ key: 'mandeligheid', heading: 'Mandeligheid', emptyText: null, entries: mandeligEntries });
  }

  // Voorgenomen Splitsing in Appartementsrechten
  if (splitsing.length > 0) {
    const entries: InzageEntry[] = [];
    for (const group of groupByDeed(splitsing).values()) {
      const entry = baseEntry(group);
      entry.obtainedLabel = 'Aangetekend bij';
      entries.push(entry);
    }
    sections.push({
      key: 'voorgenomen_splitsing',
      heading: 'Er is sprake van een Voorgenomen Splitsing in Appartementsrechten',
      emptyText: null,
      entries,
    });
  }

  // Beperkte rechten
  if (limited.length > 0) {
    const entries: InzageEntry[] = [];
    for (const group of groupByDeed(limited).values()) {
      const entry = baseEntry(group);
      entry.obtainedLabel = 'Verkregen bij';
      entry.typeDescription = limitedRightLabel(getFieldNumber(group[0], 'legalFactTypeId'));
      entry.parties = groupParties(group).map((party) => ({ ...party, role: 'Ten name van' }));
      entries.push(entry);
    }
    sections.push({ key: 'limited_rights', heading: 'Beperkte rechten', emptyText: null, entries });
  }

  // Aantekeningen
  if (annotations.length > 0) {
    const entries: InzageEntry[] = [];
    for (const group of groupByDeed(annotations).values()) {
      const entry = baseEntry(group);
      entry.obtainedLabel = 'Gevestigd bij';
      entry.parties = groupParties(group);
      entries.push(entry);
    }
    sections.push({ key: 'annotations', heading: 'Aantekeningen', emptyText: null, entries });
  }

  // Aantekeningen (legacy / old system)
  if (oldAnnotations.length > 0) {
    const entries: InzageEntry[] = oldAnnotations.map((row) => {
      const entry = emptyEntry();
      entry.note = row.notes;
      entry.deedDate = row.deedDate;
      entry.submissionDate = row.submissionDate;
      entry.notary = row.notary;
      entry.deed = { register: row.register, segment: row.segment, number: row.number };
      entry.parties = [
        ...row.interestedParties.map((name) => ({ name, share: null, role: 'Belanghebbende' })),
        ...row.sufferers.map((name) => ({ name, share: null, role: 'Lijder' })),
      ];
      return entry;
    });
    sections.push({
      key: 'old_annotations',
      heading: 'Aantekeningen (oud systeem)',
      emptyText: null,
      entries,
    });
  }

  // Hypotheek (empty -> "Vrij van hypotheek")
  const deedRefById = new Map<number, InzageDeedRef>();
  for (const row of mortgages) {
    const deedId = getFieldNumber(row, 'deedId');
    if (deedId != null && !deedRefById.has(deedId)) deedRefById.set(deedId, deedRef(row));
  }

  const mortgageEntries: InzageEntry[] = [];
  const baseDeedIds: number[] = [];
  for (const group of groupByDeed(mortgages).values()) {
    const code = getFieldString(group[0], 'legalFactCode');
    if (code === 'MO_AR' || code === 'ND_AS') continue; // handled as amendments below
    const deedId = getFieldNumber(group[0], 'deedId');
    if (deedId != null) baseDeedIds.push(deedId);

    const entry = baseEntry(group);
    entry.legalFact = null;
    entry.typeDescription = mortgageTypeLabel(group[0]);
    entry.amount = formatPrice(getFieldNumber(group[0], 'value'), getFieldString(group[0], 'currency'));
    const beneficiaries: Record<string, unknown>[] = [];
    const benefactors: Record<string, unknown>[] = [];
    for (const row of group) {
      const roleNe = (getFieldString(row, 'roleNe') ?? '').toLowerCase();
      if (roleNe.includes('kredietgever') || roleNe.includes('hypotheeknemer')) beneficiaries.push(row);
      else benefactors.push(row);
    }
    entry.parties = [
      ...groupParties(beneficiaries).map((party) => ({ ...party, role: 'Ten behoeve van' })),
      ...groupParties(benefactors).map((party) => ({ ...party, role: 'Ten laste van' })),
    ];
    mortgageEntries.push(entry);
  }

  // Mortgage amendments (Wijziging / Cessie / Subrogatie).
  const amendments = await fetchMortgageAmendments(systemKey, baseDeedIds);
  for (const group of groupByDeed(amendments).values()) {
    const entry = baseEntry(group);
    entry.legalFact = null;
    entry.typeDescription = amendmentTypeLabel(group[0]);
    // Amount suppressed for amendments, matching the extract.
    entry.amount = null;
    const beneficiaries: Record<string, unknown>[] = [];
    const benefactors: Record<string, unknown>[] = [];
    for (const row of group) {
      const roleNe = (getFieldString(row, 'roleNe') ?? '').toLowerCase();
      if (roleNe.includes('kredietgever') || roleNe.includes('hypotheeknemer')) beneficiaries.push(row);
      else benefactors.push(row);
    }
    entry.parties = [
      ...groupParties(beneficiaries).map((party) => ({ ...party, role: 'Ten behoeve van' })),
      ...groupParties(benefactors).map((party) => ({ ...party, role: 'Ten laste van' })),
    ];
    const amendedDeedId = getFieldNumber(group[0], 'amendedDeedId');
    const source = amendedDeedId != null ? deedRefById.get(amendedDeedId) : undefined;
    if (source) entry.sourceDeeds = [source];
    mortgageEntries.push(entry);
  }

  sections.push({
    key: 'mortgages',
    heading: 'Hypotheek',
    emptyText: mortgageEntries.length === 0 ? 'Vrij van hypotheek' : null,
    entries: mortgageEntries,
  });

  // Beslag (empty -> "Vrij van beslag")
  const seizureEntries: InzageEntry[] = [];
  for (const group of groupByDeed(seizures).values()) {
    const entry = baseEntry(group);
    entry.legalFact = null;
    entry.typeDescription = getFieldString(group[0], 'deedTypeDescription') ?? 'Beslag';
    entry.amount = formatPrice(getFieldNumber(group[0], 'value'), getFieldString(group[0], 'currency'));

    const creditors = group.filter((row) => getFieldString(row, 'sectionCode') === 'SEG');
    const debtorRows = group.filter((row) => getFieldString(row, 'sectionCode') === 'SNG');

    // Enrich debtors with their ownership share on the parcel.
    const debtorParties: InzageParty[] = [];
    const seenDebtors = new Set<number>();
    for (const row of debtorRows) {
      const subjectId = getFieldNumber(row, 'SubjectId');
      if (subjectId == null || seenDebtors.has(subjectId)) continue;
      seenDebtors.add(subjectId);
      debtorParties.push({
        name: buildSubjectName(row),
        share: ownershipShares.get(subjectId) ?? null,
        role: 'Ten laste van',
      });
    }

    entry.parties = [
      ...groupParties(creditors).map((party) => ({ ...party, role: 'Ten behoeve van' })),
      ...debtorParties,
    ];
    seizureEntries.push(entry);
  }
  sections.push({
    key: 'seizures',
    heading: 'Beslag',
    emptyText: seizureEntries.length === 0 ? 'Vrij van beslag' : null,
    entries: seizureEntries,
  });

  // Opmerking (particulars)
  const showParticulars = tereno
    ? Boolean(getFieldString(parcel, 'particulars', 'description'))
    : toBool(getField(parcel, 'PerceelBz'));
  const particulars = tereno
    ? getFieldString(parcel, 'particulars', 'description')
    : getFieldString(parcel, 'PerceelBijzonderheiden');
  if (showParticulars && particulars) {
    sections.push({
      key: 'particulars',
      heading: 'Opmerking',
      emptyText: null,
      entries: [
        {
          parties: [],
          legalFact: null,
          obtainedLabel: null,
          typeDescription: null,
          deedDate: null,
          submissionDate: null,
          notary: null,
          note: particulars,
          amount: null,
          deed: { register: null, segment: null, number: null },
          extraLines: [],
          sourceDeeds: [],
        },
      ],
    });
  }

  // Linked subjects for drill-down (from ownership + limited rights).
  const linkedSubjects = new Map<number, string>();
  for (const row of [...ownership, ...groundlease, ...limited]) {
    const subjectId = getFieldNumber(row, 'SubjectId');
    if (subjectId != null && !linkedSubjects.has(subjectId)) {
      linkedSubjects.set(subjectId, buildSubjectName(row));
    }
  }

  return {
    kind: 'object',
    variant,
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    title: TITLE_BY_VARIANT[variant],
    generated_at: formatDateTime(new Date()),
    header: tereno
      ? {
          parcel_id: input.parcelId,
          esri: getFieldString(parcel, 'esri'),
          description: getFieldString(parcel, 'description'),
          size: getFieldString(parcel, 'size'),
          sheet: getFieldString(parcel, 'sheet'),
          diamond_letter: getFieldString(parcel, 'diamondLetter'),
          location: getFieldString(parcel, 'location'),
          status: getFieldString(parcel, 'status'),
          particulars: showParticulars ? particulars : null,
          split_flag: Boolean(terenoSplit?.split_flag || (terenoSplit && terenoSplit.role !== 'none')),
          is_reviewed: toBool(getField(parcel, 'isReviewed')),
          split_role: terenoSplit?.role ?? 'none',
          split_child_esris: terenoSplit?.child_esris ?? [],
          split_parent_esri: terenoSplit?.parent_esri ?? null,
          split_parent_parcel_id: terenoSplit?.parent_parcel_id ?? null,
        }
      : {
          parcel_id: input.parcelId,
          esri: getFieldString(parcel, 'PerceelESRI'),
          description: getFieldString(parcel, 'PerceelOmschrijving'),
          size: getFieldString(parcel, 'PerceelOppervlakteHA'),
          sheet: getFieldString(parcel, 'PerceelBlad'),
          diamond_letter: getFieldString(parcel, 'PerceelRuitLetter'),
          location: getFieldString(parcel, 'PerceelPlaatselijke'),
          status: getFieldString(parcel, 'PerceelStatus'),
          particulars: showParticulars ? particulars : null,
          split_flag: toBool(getField(parcel, 'VoorgenomenSplitsingIndicatie')),
          is_reviewed: toBool(getField(parcel, 'isReviewed')),
        },
    sections,
    linked_subjects: [...linkedSubjects.entries()].map(([subject_id, name]) => ({
      subject_id,
      name,
    })),
  };
}
