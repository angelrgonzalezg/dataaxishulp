import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystem, querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import type { SystemDialect } from './systemDialect';

export interface NotaryOption {
  id: number;
  code: string | null;
  name: string | null;
  active: boolean | null;
}

export interface DeedNotaryState {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  deed_id: number;
  register: string | null;
  segment: number | null;
  number: number | null;
  notary_id: number | null;
  notary_code: string | null;
  notary_name: string | null;
}

export interface NotarySearchResult {
  query: string;
  candidates: NotaryOption[];
}

export interface ChangeDeedNotaryResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  deed_id: number;
  preview_only: boolean;
  register: string | null;
  segment: number | null;
  number: number | null;
  from_notary: NotaryOption | null;
  to_notary: NotaryOption;
}

function notaryCols(dialect: SystemDialect) {
  const tereno = isTerenoDialect(dialect);
  return {
    tereno,
    table: tereno ? 'Notary' : 'Notaris',
    idCol: tereno ? 'id' : 'NotariaID',
    nameCol: tereno ? 'name' : 'NotarisNaam',
    codeCol: tereno ? 'cribNumber' : 'Notaris_CribNr',
    activeCol: tereno ? 'active' : 'active',
    deedFk: tereno ? 'notaryId' : 'NotaryId',
    deedPk: tereno ? 'id' : 'Id',
    registerFk: tereno ? 'legalFactRegisterId' : 'DeedTypeId',
    updatedAt: tereno ? 'updatedAt' : 'UpdatedAt',
    updatedBy: tereno ? 'updatedBy' : 'UpdatedBy',
  };
}

function mapNotaryRow(row: Record<string, unknown>): NotaryOption {
  const id = getFieldNumber(row, 'id', 'NotariaID');
  if (id == null) {
    throw new ValidationError('Invalid Notary/Notaris row (missing id)');
  }
  const activeRaw = row.active ?? row.Active;
  let active: boolean | null = null;
  if (typeof activeRaw === 'boolean') active = activeRaw;
  else if (activeRaw === 0 || activeRaw === 1) active = activeRaw === 1;
  else if (activeRaw != null) active = Boolean(activeRaw);

  return {
    id,
    code: getFieldString(row, 'code', 'cribNumber', 'Notaris_CribNr'),
    name: getFieldString(row, 'name', 'NotarisNaam'),
    active,
  };
}

function formatTitle(register: string | null, segment: number | null, number: number | null): string | null {
  if (!register || segment == null || number == null) return null;
  return `${register} ${segment}-${number}`;
}

async function loadNotaryById(
  systemKey: string,
  dialect: SystemDialect,
  notaryId: number,
): Promise<NotaryOption | null> {
  const cols = notaryCols(dialect);
  const rows = await querySystem(
    systemKey,
    `SELECT TOP 1
        n.[${cols.idCol}] AS id,
        n.[${cols.nameCol}] AS name,
        n.[${cols.codeCol}] AS code,
        n.[${cols.activeCol}] AS active
     FROM [${cols.table}] n
     WHERE n.[${cols.idCol}] = @notaryId`,
    { notaryId },
  );
  if (rows.length === 0) return null;
  return mapNotaryRow(rows[0]);
}

export async function searchNotaries(
  queryInput: string,
  systemKeyInput?: string,
): Promise<NotarySearchResult> {
  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = notaryCols(dialect);

  const query = queryInput.trim();
  if (!query) {
    throw new ValidationError('Provide a notary search term (id, CRIB/code, or name).');
  }

  const idExact = /^\d+$/.test(query) ? Number(query) : null;
  const like = `%${query.replace(/[%_\[\]]/g, '')}%`;

  const rows = await querySystem(
    systemKey,
    `SELECT TOP 40
        n.[${cols.idCol}] AS id,
        n.[${cols.nameCol}] AS name,
        n.[${cols.codeCol}] AS code,
        n.[${cols.activeCol}] AS active
     FROM [${cols.table}] n
     WHERE (
       (@idExact IS NOT NULL AND n.[${cols.idCol}] = @idExact)
       OR n.[${cols.nameCol}] LIKE @like
       OR ISNULL(n.[${cols.codeCol}], '') LIKE @like
       OR CAST(n.[${cols.idCol}] AS NVARCHAR(30)) LIKE @like
     )
     ORDER BY n.[${cols.nameCol}], n.[${cols.idCol}]`,
    { idExact, like },
  );

  return {
    query,
    candidates: rows.map(mapNotaryRow),
  };
}

export async function getDeedNotary(
  deedId: number,
  systemKeyInput?: string,
): Promise<DeedNotaryState> {
  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = notaryCols(dialect);

  if (!Number.isInteger(deedId) || deedId <= 0) {
    throw new ValidationError('Invalid deedId');
  }

  const rows = await querySystem(
    systemKey,
    `SELECT TOP 1
        d.[${cols.deedPk}] AS deedId,
        lfr.register AS register,
        d.[segment] AS segment,
        d.[number] AS number,
        d.[${cols.deedFk}] AS notaryId,
        n.[${cols.codeCol}] AS notaryCode,
        n.[${cols.nameCol}] AS notaryName
     FROM Deed d
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.[${cols.registerFk}]
     LEFT JOIN [${cols.table}] n ON n.[${cols.idCol}] = d.[${cols.deedFk}]
     WHERE d.[${cols.deedPk}] = @deedId`,
    { deedId },
  );

  if (rows.length === 0) {
    throw new NotFoundError(`Deed ${deedId} not found in ${system.system_name}`);
  }

  const row = rows[0];
  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    deed_id: getFieldNumber(row, 'deedId') ?? deedId,
    register: getFieldString(row, 'register'),
    segment: getFieldNumber(row, 'segment'),
    number: getFieldNumber(row, 'number'),
    notary_id: getFieldNumber(row, 'notaryId'),
    notary_code: getFieldString(row, 'notaryCode'),
    notary_name: getFieldString(row, 'notaryName'),
  };
}

export async function changeDeedNotary(input: {
  deedId: number;
  systemKey?: string;
  notaryId: number;
  previewOnly: boolean;
  confirm?: boolean;
  updatedBy: string;
}): Promise<ChangeDeedNotaryResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = notaryCols(dialect);

  if (!input.previewOnly && input.confirm !== true) {
    throw new ValidationError('Confirmation required. Set confirm=true to apply the change.');
  }

  if (!Number.isInteger(input.deedId) || input.deedId <= 0) {
    throw new ValidationError('Invalid deedId');
  }
  if (!Number.isInteger(input.notaryId) || input.notaryId <= 0) {
    throw new ValidationError('Invalid notaryId');
  }

  const current = await getDeedNotary(input.deedId, systemKey);
  const toNotary = await loadNotaryById(systemKey, dialect, input.notaryId);
  if (!toNotary) {
    throw new NotFoundError(
      `Notary ${input.notaryId} not found in ${system.system_name}`,
    );
  }

  if (current.notary_id === toNotary.id) {
    throw new ValidationError('Selected notary is already set on this deed.');
  }

  const fromNotary: NotaryOption | null =
    current.notary_id != null
      ? {
          id: current.notary_id,
          code: current.notary_code,
          name: current.notary_name,
          active: null,
        }
      : null;

  const result: ChangeDeedNotaryResult = {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    deed_id: input.deedId,
    preview_only: input.previewOnly,
    register: current.register,
    segment: current.segment,
    number: current.number,
    from_notary: fromNotary,
    to_notary: toNotary,
  };

  if (input.previewOnly) {
    return result;
  }

  const updatedBy = input.updatedBy.trim().slice(0, 250) || 'dataaxis-hulp';
  const { rowsAffected } = await executeSystem(
    systemKey,
    `UPDATE Deed
     SET [${cols.deedFk}] = @notaryId,
         [${cols.updatedAt}] = SYSUTCDATETIME(),
         [${cols.updatedBy}] = @updatedBy
     WHERE [${cols.deedPk}] = @deedId`,
    {
      notaryId: input.notaryId,
      updatedBy,
      deedId: input.deedId,
    },
  );

  if (rowsAffected < 1) {
    throw new NotFoundError(`Deed ${input.deedId} was not updated in ${system.system_name}`);
  }

  return { ...result, preview_only: false };
}

export function formatNotaryLabel(option: NotaryOption | null | undefined): string {
  if (!option) return '—';
  const code = option.code?.trim() || String(option.id);
  const name = option.name?.trim() || '—';
  return `#${option.id} · ${code} · ${name}`;
}

export function formatDeedTitleFromState(state: {
  register: string | null;
  segment: number | null;
  number: number | null;
}): string | null {
  return formatTitle(state.register, state.segment, state.number);
}
