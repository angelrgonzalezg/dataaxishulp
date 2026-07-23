import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystem, querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoSupportSystem,
  resolveSupportSystem,
} from './support.frames';

export interface LegalFactOption {
  id: number;
  code: string | null;
  name_nl: string | null;
  name_en: string | null;
}

export interface DeedLegalFactState {
  system_key: string;
  system_name: string;
  is_production: boolean;
  deed_id: number;
  register: string | null;
  segment: number | null;
  number: number | null;
  legal_fact_id: number | null;
  legal_fact_code: string | null;
  legal_fact_name_nl: string | null;
  legal_fact_name_en: string | null;
}

function requireTerenoSystem(systemKey: string): void {
  if (!isTerenoSupportSystem(systemKey)) {
    throw new ValidationError(
      'Change Type akte is only available for DLV / Tereno system connections.',
    );
  }
}

function mapLegalFactRow(row: Record<string, unknown>): LegalFactOption {
  const id = getFieldNumber(row, 'id');
  if (id == null) {
    throw new ValidationError('Invalid LegalFact row (missing id)');
  }
  return {
    id,
    code: getFieldString(row, 'code'),
    name_nl: getFieldString(row, 'nameNl', 'name_nl'),
    name_en: getFieldString(row, 'nameEn', 'name_en'),
  };
}

export async function listLegalFacts(systemKeyInput?: string): Promise<LegalFactOption[]> {
  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  requireTerenoSystem(systemKey);
  await resolveSupportSystem(systemKey);

  const rows = await querySystem(
    systemKey,
    `SELECT id, code, nameNl, nameEn
     FROM LegalFact
     ORDER BY code, nameNl, id`,
  );

  return rows.map(mapLegalFactRow);
}

export async function getDeedLegalFact(
  deedId: number,
  systemKeyInput?: string,
): Promise<DeedLegalFactState> {
  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  requireTerenoSystem(systemKey);
  const system = await resolveSupportSystem(systemKey);

  const rows = await querySystem(
    systemKey,
    `SELECT d.id AS deedId,
            lfr.register AS register,
            d.[segment] AS segment,
            d.[number] AS number,
            d.legalFactId AS legalFactId,
            lf.code AS legalFactCode,
            lf.nameNl AS legalFactNameNl,
            lf.nameEn AS legalFactNameEn
     FROM Deed d
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.legalFactRegisterId
     LEFT JOIN LegalFact lf ON lf.id = d.legalFactId
     WHERE d.id = @deedId`,
    { deedId },
  );

  if (rows.length === 0) {
    throw new NotFoundError(`Deed ${deedId} not found in ${system.system_name}`);
  }

  const row = rows[0];
  return {
    system_key: system.system_key,
    system_name: system.system_name,
    is_production: system.is_production,
    deed_id: getFieldNumber(row, 'deedId') ?? deedId,
    register: getFieldString(row, 'register'),
    segment: getFieldNumber(row, 'segment'),
    number: getFieldNumber(row, 'number'),
    legal_fact_id: getFieldNumber(row, 'legalFactId'),
    legal_fact_code: getFieldString(row, 'legalFactCode'),
    legal_fact_name_nl: getFieldString(row, 'legalFactNameNl'),
    legal_fact_name_en: getFieldString(row, 'legalFactNameEn'),
  };
}

export async function updateDeedLegalFact(input: {
  deedId: number;
  systemKey?: string;
  legalFactId: number;
  confirm: boolean;
  updatedBy: string;
}): Promise<{
  deed_id: number;
  system_key: string;
  system_name: string;
  is_production: boolean;
  previous: LegalFactOption | null;
  next: LegalFactOption;
}> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  requireTerenoSystem(systemKey);
  const system = await resolveSupportSystem(systemKey);

  if (!input.confirm) {
    throw new ValidationError('Confirmation required. Set confirm=true to apply the change.');
  }

  if (!Number.isInteger(input.deedId) || input.deedId <= 0) {
    throw new ValidationError('Invalid deedId');
  }
  if (!Number.isInteger(input.legalFactId) || input.legalFactId <= 0) {
    throw new ValidationError('Invalid legalFactId');
  }

  const current = await getDeedLegalFact(input.deedId, systemKey);

  const targetRows = await querySystem(
    systemKey,
    `SELECT id, code, nameNl, nameEn FROM LegalFact WHERE id = @legalFactId`,
    { legalFactId: input.legalFactId },
  );
  if (targetRows.length === 0) {
    throw new NotFoundError(
      `LegalFact ${input.legalFactId} not found in ${system.system_name}`,
    );
  }
  const next = mapLegalFactRow(targetRows[0]);

  if (current.legal_fact_id === next.id) {
    throw new ValidationError('Selected LegalFact is already set on this deed.');
  }

  const updatedBy = input.updatedBy.trim().slice(0, 250) || 'dataaxis-hulp';

  const { rowsAffected } = await executeSystem(
    systemKey,
    `UPDATE Deed
     SET legalFactId = @legalFactId,
         updatedAt = SYSUTCDATETIME(),
         updatedBy = @updatedBy
     WHERE id = @deedId`,
    {
      legalFactId: input.legalFactId,
      updatedBy,
      deedId: input.deedId,
    },
  );

  if (rowsAffected < 1) {
    throw new NotFoundError(`Deed ${input.deedId} was not updated in ${system.system_name}`);
  }

  const previous: LegalFactOption | null =
    current.legal_fact_id != null
      ? {
          id: current.legal_fact_id,
          code: current.legal_fact_code,
          name_nl: current.legal_fact_name_nl,
          name_en: current.legal_fact_name_en,
        }
      : null;

  return {
    deed_id: input.deedId,
    system_key: system.system_key,
    system_name: system.system_name,
    is_production: system.is_production,
    previous,
    next,
  };
}
