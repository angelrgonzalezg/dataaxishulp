import { NotFoundError } from '../../utils/AppError';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  querySafe,
  resolveSupportSystem,
} from './support.frames';
import {
  buildSubjectName,
  formatDate,
  formatDateTime,
  formatFraction,
  formatPrice,
  simplifyFraction,
} from './inzage.helpers';
import type {
  InzageSubjectReport,
  InzageSubjectRight,
  InzageSubjectVariant,
} from './inzage.types';

const APPROVED = 3;
/** Legal-fact ids shown on the subject extract (ownership / ground lease). */
const SUBJECT_DISPLAY_LEGAL_FACTS = new Set([1, 4, 8, 34]);

function mapPerson(subject: Record<string, unknown>, subjectId: number, tereno: boolean) {
  if (tereno) {
    const type = (getFieldString(subject, 'type') ?? '').toLowerCase();
    const isNaturalPerson =
      type === '1' ||
      type.includes('natuur') ||
      type.includes('natural') ||
      type.includes('person');

    const genderCode = getFieldNumber(subject, 'gender');
    const gender = genderCode === 1 ? 'Man' : genderCode === 2 ? 'Vrouw' : null;

    const street = getFieldString(subject, 'street') ?? '';
    const houseNumber = getFieldString(subject, 'houseNumber') ?? '';
    const houseLetter = getFieldString(subject, 'houseLetter') ?? '';
    const country = getFieldString(subject, 'country') ?? '';
    const address =
      [street, `${houseNumber}${houseLetter}`.trim(), country].filter(Boolean).join(' ').trim() ||
      getFieldString(subject, 'location');

    return {
      subject_id: subjectId,
      is_natural_person: isNaturalPerson,
      name: buildSubjectName(subject),
      gender,
      occupation: getFieldString(subject, 'occupation'),
      date_of_birth: formatDate(subject.dateOfBirth),
      place_of_birth: getFieldString(subject, 'placeOfBirth'),
      country: country || null,
      organizational_structure: getFieldString(subject, 'organizationalStructure'),
      address,
    };
  }

  const isNaturalPerson = String(getFieldString(subject, 'SubjectType') ?? '') === '1';
  const genderCode = getFieldString(subject, 'SubjectGeslacht');
  const gender = genderCode === '1' ? 'Man' : genderCode === '2' ? 'Vrouw' : null;

  const street = getFieldString(subject, 'SubjectStraatID') ?? '';
  const houseNumber = getFieldString(subject, 'SubjectHuisNummer') ?? '';
  const country = getFieldString(subject, 'SubjectLand') ?? '';
  const address = [street, houseNumber, country].filter(Boolean).join(' ').trim() || null;

  return {
    subject_id: subjectId,
    is_natural_person: isNaturalPerson,
    name: buildSubjectName(subject),
    gender,
    occupation: getFieldString(subject, 'SubjectBeroepID'),
    date_of_birth: formatDate(subject.SubjectDatumGeboorte),
    place_of_birth: getFieldString(subject, 'SubjectNaamGeboorte'),
    country: country || null,
    organizational_structure: getFieldString(subject, 'SubjectAard'),
    address,
  };
}

async function fetchSubjectRights(
  systemKey: string,
  subjectId: number,
  tereno: boolean,
): Promise<Record<string, unknown>[]> {
  if (tereno) {
    return querySafe(
      systemKey,
      `SELECT p.id AS parcelId, p.esri AS esri, p.size AS size,
              p.description AS [description], p.sheet AS sheet,
              p.location AS location,
              ISNULL(lfType.description, lf.nameNl) AS legalFactTypeDescription,
              dd.shareNumerator AS shareNum, dd.shareDenominator AS shareDen,
              lfr.register AS register, d.segment AS segment, d.[number] AS number,
              d.value AS value, cur.symbol AS currencySymbol,
              d.deedDate AS deedDate, d.deedSubmissionDate AS deedSubmissionDate,
              lf.id AS legalFactId, lf.nameNl AS legalFactNl, lf.nameEn AS legalFactEn,
              n.name AS notary
       FROM DeedDetail dd
       LEFT JOIN Parcel p ON p.id = dd.plotId
       LEFT JOIN LegalFactType lfType ON lfType.id = dd.legalFactTypeId
       LEFT JOIN Deed d ON d.id = dd.deedId
       LEFT JOIN LegalFactRegister lfr ON lfr.id = d.legalFactRegisterId
       LEFT JOIN LegalFact lf ON lf.id = d.legalFactId
       LEFT JOIN Currency cur ON cur.id = d.currencyId
       LEFT JOIN Notary n ON n.id = d.notaryId
       WHERE dd.subjectId = @subjectId
         AND ISNULL(dd.isRetired, 0) = 0
         AND (dd.approvalId IS NULL OR dd.approvalId = @approved)
         AND NOT EXISTS (
           SELECT 1 FROM DeedProcedure dp
           WHERE dp.id = dd.deedProcedureId AND dp.procedureEN = 'Termination'
         )
       ORDER BY p.id`,
      { subjectId, approved: APPROVED },
    );
  }

  return querySafe(
    systemKey,
    `SELECT p.PerceelNummer AS parcelId, p.PerceelESRI AS esri, p.PerceelOppervlakteHA AS size,
            p.PerceelOmschrijving AS [description], p.PerceelBlad AS sheet,
            p.PerceelRuitLetter AS diamondLetter, p.PerceelPlaatselijke AS location,
            dt.[Description] AS legalFactTypeDescription,
            dd.ShareNumerator AS shareNum, dd.ShareDenominator AS shareDen,
            lfr.register AS register, d.Segment AS segment, d.[Number] AS number,
            d.Value AS value, cur.Symbol AS currencySymbol,
            d.DeedDate AS deedDate, d.DeedSubmissionDate AS deedSubmissionDate,
            lf.id AS legalFactId, lf.legalFactNed AS legalFactNl, lf.legalFactEng AS legalFactEn,
            n.NotarisNaam AS notary
     FROM DeedDetail dd
     LEFT JOIN PerceelTb p ON p.PerceelNummer = dd.PlotId
     LEFT JOIN DeedType dt ON dt.Id = dd.DeedTypeId
     LEFT JOIN Deed d ON d.id = dd.DeedID
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.DeedTypeId
     LEFT JOIN LegalFact lf ON lf.id = d.MethodOfAcquisition
     LEFT JOIN Currency cur ON cur.Id = d.CurrencyId
     LEFT JOIN Notaris n ON n.NotariaID = d.NotaryId
     WHERE dd.SubjectId = @subjectId AND dd.ApprovalId = @approved AND dd.IsRetired = 0
     ORDER BY p.PerceelNummer`,
    { subjectId, approved: APPROVED },
  );
}

export async function buildSubjectInzage(input: {
  subjectId: number;
  systemKey?: string;
  variant?: InzageSubjectVariant;
}): Promise<InzageSubjectReport> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const tereno = isTerenoDialect(system.dialect);

  const subjects = await querySafe(
    systemKey,
    tereno
      ? 'SELECT * FROM [Subject] WHERE id = @subjectId'
      : 'SELECT * FROM [Subject] WHERE SubjectID = @subjectId',
    { subjectId: input.subjectId },
  );
  if (subjects.length === 0) {
    throw new NotFoundError(`Subject ${input.subjectId} not found in ${system.system_name}`);
  }

  const subject = subjects[0];
  const person = mapPerson(subject, input.subjectId, tereno);
  const now = formatDateTime(new Date());

  if (input.variant === 'negatief') {
    const today = formatDate(new Date());
    return {
      kind: 'subject',
      variant: 'negatief',
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      title: 'Verklaring niets op naam',
      generated_at: now,
      person,
      rights: [],
      declaration: `Van bovenstaande ${
        person.is_natural_person ? 'persoon' : 'rechtspersoon'
      } zijn op ${today} geen zakelijke rechten op objecten geregistreerd.`,
    };
  }

  const rightsRows = await fetchSubjectRights(systemKey, input.subjectId, tereno);

  const rights: InzageSubjectRight[] = [];
  let index = 0;
  for (const row of rightsRows) {
    const register = (getFieldString(row, 'register') ?? '').toLowerCase();
    const legalFactId = getFieldNumber(row, 'legalFactId');
    if (register !== 'c' || legalFactId == null || !SUBJECT_DISPLAY_LEGAL_FACTS.has(legalFactId)) {
      continue;
    }
    index += 1;

    const num = getFieldNumber(row, 'shareNum');
    const den = getFieldNumber(row, 'shareDen');
    const share =
      num != null && den != null && den !== 0 ? formatFraction(simplifyFraction(num, den)) : null;

    const segment = getFieldNumber(row, 'segment');
    const number = getFieldNumber(row, 'number');
    const registerText = getFieldString(row, 'register');
    const typeDescription = getFieldString(row, 'legalFactTypeDescription');

    rights.push({
      index,
      parcel_id: getFieldNumber(row, 'parcelId'),
      esri: getFieldString(row, 'esri'),
      size: getFieldString(row, 'size'),
      description: getFieldString(row, 'description'),
      location: getFieldString(row, 'location'),
      sheet: getFieldString(row, 'sheet'),
      diamond_letter: getFieldString(row, 'diamondLetter'),
      share: share && typeDescription ? `${share} ${typeDescription}` : share,
      legal_fact_type: typeDescription,
      obtained_at:
        registerText != null ? `${registerText} ${segment ?? '—'} / ${number ?? '—'}` : null,
      akte: getFieldString(row, 'legalFactNl', 'legalFactEn'),
      price: formatPrice(getFieldNumber(row, 'value'), getFieldString(row, 'currencySymbol')),
      submission_date: formatDate(row.deedSubmissionDate),
      deed_date: formatDate(row.deedDate),
      notary: getFieldString(row, 'notary'),
    });
  }

  return {
    kind: 'subject',
    variant: 'subject',
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    title: 'Kadastraal uittreksel (subject)',
    generated_at: now,
    person,
    rights,
    declaration: null,
  };
}
