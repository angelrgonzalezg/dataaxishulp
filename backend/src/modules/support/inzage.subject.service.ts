import { NotFoundError } from '../../utils/AppError';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
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

export async function buildSubjectInzage(input: {
  subjectId: number;
  systemKey?: string;
  variant?: InzageSubjectVariant;
}): Promise<InzageSubjectReport> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);

  const subjects = await querySafe(systemKey, 'SELECT * FROM [Subject] WHERE SubjectID = @subjectId', {
    subjectId: input.subjectId,
  });
  if (subjects.length === 0) {
    throw new NotFoundError(`Subject ${input.subjectId} not found in ${system.system_name}`);
  }
  const subject = subjects[0];
  const isNaturalPerson = String(getFieldString(subject, 'SubjectType') ?? '') === '1';

  const genderCode = getFieldString(subject, 'SubjectGeslacht');
  const gender = genderCode === '1' ? 'Man' : genderCode === '2' ? 'Vrouw' : null;

  const street = getFieldString(subject, 'SubjectStraatID') ?? '';
  const houseNumber = getFieldString(subject, 'SubjectHuisNummer') ?? '';
  const country = getFieldString(subject, 'SubjectLand') ?? '';
  const address = [street, houseNumber, country].filter(Boolean).join(' ').trim() || null;

  const person = {
    subject_id: input.subjectId,
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

  const now = formatDateTime(new Date());

  if (input.variant === 'negatief') {
    const today = formatDate(new Date());
    return {
      kind: 'subject',
      variant: 'negatief',
      system_key: system.system_key,
      system_name: system.system_name,
      is_production: system.is_production,
      title: 'Verklaring niets op naam',
      generated_at: now,
      person,
      rights: [],
      declaration: `Van bovenstaande ${
        isNaturalPerson ? 'persoon' : 'rechtspersoon'
      } zijn op ${today} geen zakelijke rechten op objecten geregistreerd.`,
    };
  }

  const rightsRows = await querySafe(
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
    { subjectId: input.subjectId, approved: APPROVED },
  );

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

    rights.push({
      index,
      parcel_id: getFieldNumber(row, 'parcelId'),
      esri: getFieldString(row, 'esri'),
      size: getFieldString(row, 'size'),
      description: getFieldString(row, 'description'),
      location: getFieldString(row, 'location'),
      sheet: getFieldString(row, 'sheet'),
      diamond_letter: getFieldString(row, 'diamondLetter'),
      share: share && getFieldString(row, 'legalFactTypeDescription')
        ? `${share} ${getFieldString(row, 'legalFactTypeDescription')}`
        : share,
      legal_fact_type: getFieldString(row, 'legalFactTypeDescription'),
      obtained_at:
        registerText != null
          ? `${registerText} ${segment ?? '—'} / ${number ?? '—'}`
          : null,
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
    is_production: system.is_production,
    title: 'Kadastraal uittreksel (subject)',
    generated_at: now,
    person,
    rights,
    declaration: null,
  };
}
