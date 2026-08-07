import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystem, querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getField,
  resolveSupportSystem,
} from './support.frames';

export interface FrameCellChange {
  column: string;
  from: unknown;
  to: unknown;
}

export interface FrameRowChange {
  primary_key_value: string | number;
  cells: FrameCellChange[];
}

export interface UpdateFrameRowsResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  table_name: string;
  primary_key: string;
  preview_only: boolean;
  change_count: number;
  row_count: number;
  changes: FrameRowChange[];
  rows_affected: number;
}

type ColumnMeta = {
  name: string;
  dataType: string;
  isNullable: boolean;
  isIdentity: boolean;
};

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdent(name: string, label: string): string {
  const trimmed = name.trim();
  if (!IDENT_RE.test(trimmed)) {
    throw new ValidationError(`Invalid ${label}: ${name}`);
  }
  return trimmed;
}

function quoteIdent(name: string): string {
  return `[${assertIdent(name, 'identifier')}]`;
}

function normalizeEmpty(value: unknown): unknown {
  if (value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const a = normalizeEmpty(left);
  const b = normalizeEmpty(right);
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
      return na === nb;
    }
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return String(a) === String(b);
}

function coerceValue(raw: unknown, dataType: string, isNullable: boolean): unknown {
  const normalized = normalizeEmpty(raw);
  if (normalized == null) {
    if (!isNullable) {
      throw new ValidationError(`Column does not allow null (type ${dataType})`);
    }
    return null;
  }

  const type = dataType.toLowerCase();
  if (
    type.includes('int') ||
    type === 'decimal' ||
    type === 'numeric' ||
    type === 'money' ||
    type === 'smallmoney' ||
    type === 'float' ||
    type === 'real'
  ) {
    const num = typeof normalized === 'number' ? normalized : Number(String(normalized).trim());
    if (!Number.isFinite(num)) {
      throw new ValidationError(`Invalid numeric value for type ${dataType}: ${String(raw)}`);
    }
    return num;
  }

  if (type === 'bit') {
    if (typeof normalized === 'boolean') return normalized;
    const text = String(normalized).trim().toLowerCase();
    if (text === '1' || text === 'true' || text === 'yes') return true;
    if (text === '0' || text === 'false' || text === 'no') return false;
    throw new ValidationError(`Invalid bit value: ${String(raw)}`);
  }

  if (type.includes('date') || type.includes('time')) {
    return String(normalized);
  }

  return String(normalized);
}

async function loadTableColumns(
  systemKey: string,
  tableName: string,
): Promise<Map<string, ColumnMeta>> {
  const safeTable = assertIdent(tableName, 'table name');
  const rows = await querySystem(
    systemKey,
    `SELECT c.COLUMN_NAME AS columnName,
            c.DATA_TYPE AS dataType,
            c.IS_NULLABLE AS isNullable,
            COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity') AS isIdentity
     FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.TABLE_NAME = @tableName
     ORDER BY c.ORDINAL_POSITION`,
    { tableName: safeTable },
  );

  if (rows.length === 0) {
    throw new NotFoundError(`Table "${safeTable}" was not found in the connected database.`);
  }

  const map = new Map<string, ColumnMeta>();
  for (const row of rows) {
    const name = String(getField(row, 'columnName') ?? '');
    if (!name) continue;
    map.set(name.toLowerCase(), {
      name,
      dataType: String(getField(row, 'dataType') ?? 'nvarchar'),
      isNullable: String(getField(row, 'isNullable') ?? 'YES').toUpperCase() === 'YES',
      isIdentity: Number(getField(row, 'isIdentity') ?? 0) === 1,
    });
  }
  return map;
}

function resolvePkValue(row: Record<string, unknown>, primaryKey: string): string | number {
  const value = getField(row, primaryKey);
  if (value == null || value === '') {
    throw new ValidationError(`Missing primary key value for column ${primaryKey}`);
  }
  if (typeof value === 'number') return value;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && String(value).trim() !== '' && /^-?\d+(\.\d+)?$/.test(String(value).trim())) {
    return asNumber;
  }
  return String(value);
}

export function diffFrameRows(input: {
  primaryKey: string;
  originalRows: Record<string, unknown>[];
  draftRows: Record<string, unknown>[];
}): FrameRowChange[] {
  const pk = assertIdent(input.primaryKey, 'primary key');
  if (input.originalRows.length !== input.draftRows.length) {
    throw new ValidationError('Draft row count does not match the loaded frame.');
  }

  const changes: FrameRowChange[] = [];
  for (let index = 0; index < input.originalRows.length; index += 1) {
    const original = input.originalRows[index];
    const draft = input.draftRows[index];
    const pkValue = resolvePkValue(original, pk);
    const draftPk = resolvePkValue(draft, pk);
    if (String(pkValue) !== String(draftPk)) {
      throw new ValidationError('Primary key values cannot be changed.');
    }

    const cells: FrameCellChange[] = [];
    const keys = new Set([...Object.keys(original), ...Object.keys(draft)]);
    for (const key of keys) {
      if (key.toLowerCase() === pk.toLowerCase()) continue;
      const from = getField(original, key);
      const to = getField(draft, key);
      // Prefer draft key casing when present
      const column = Object.keys(draft).find((k) => k.toLowerCase() === key.toLowerCase()) ?? key;
      if (!valuesEqual(from, to)) {
        cells.push({
          column,
          from: normalizeEmpty(from) ?? null,
          to: normalizeEmpty(to) ?? null,
        });
      }
    }

    if (cells.length > 0) {
      changes.push({ primary_key_value: pkValue, cells });
    }
  }

  return changes;
}

export async function updateFrameRows(input: {
  systemKey?: string;
  tableName: string;
  primaryKey: string;
  changes: FrameRowChange[];
  previewOnly: boolean;
  confirm?: boolean;
}): Promise<UpdateFrameRowsResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);

  if (!input.previewOnly && input.confirm !== true) {
    throw new ValidationError('Confirmation required. Set confirm=true to apply column updates.');
  }

  const tableName = assertIdent(input.tableName, 'table name');
  const primaryKey = assertIdent(input.primaryKey, 'primary key');
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    throw new ValidationError('No column changes to apply.');
  }

  const columns = await loadTableColumns(systemKey, tableName);
  const pkMeta = columns.get(primaryKey.toLowerCase());
  if (!pkMeta) {
    throw new ValidationError(`Primary key column "${primaryKey}" not found on ${tableName}.`);
  }

  // Normalize/validate each change against schema
  const normalized: FrameRowChange[] = input.changes.map((rowChange) => {
    if (rowChange.cells.length === 0) {
      throw new ValidationError('Each changed row must include at least one cell.');
    }
    const cells = rowChange.cells.map((cell) => {
      const meta = columns.get(cell.column.toLowerCase());
      if (!meta) {
        throw new ValidationError(`Unknown column "${cell.column}" on ${tableName}.`);
      }
      if (meta.name.toLowerCase() === pkMeta.name.toLowerCase()) {
        throw new ValidationError('Primary key columns cannot be updated.');
      }
      if (meta.isIdentity) {
        throw new ValidationError(`Identity column "${meta.name}" cannot be updated.`);
      }
      return {
        column: meta.name,
        from: cell.from,
        to: coerceValue(cell.to, meta.dataType, meta.isNullable),
      };
    });
    return {
      primary_key_value: rowChange.primary_key_value,
      cells,
    };
  });

  const changeCount = normalized.reduce((sum, row) => sum + row.cells.length, 0);
  const resultBase: UpdateFrameRowsResult = {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    table_name: tableName,
    primary_key: pkMeta.name,
    preview_only: input.previewOnly,
    change_count: changeCount,
    row_count: normalized.length,
    changes: normalized,
    rows_affected: 0,
  };

  if (input.previewOnly) {
    return resultBase;
  }

  let rowsAffected = 0;
  for (const rowChange of normalized) {
    const setParts: string[] = [];
    const params: Record<string, unknown> = {
      pkValue: rowChange.primary_key_value,
    };

    rowChange.cells.forEach((cell, cellIndex) => {
      const paramName = `v${cellIndex}`;
      setParts.push(`${quoteIdent(cell.column)} = @${paramName}`);
      params[paramName] = cell.to;
    });

    const { rowsAffected: affected } = await executeSystem(
      systemKey,
      `UPDATE ${quoteIdent(tableName)}
       SET ${setParts.join(', ')}
       WHERE ${quoteIdent(pkMeta.name)} = @pkValue`,
      params,
    );
    rowsAffected += affected;
  }

  if (rowsAffected < 1) {
    throw new NotFoundError(
      `No rows were updated in ${tableName}. Check that the primary key values still exist.`,
    );
  }

  return {
    ...resultBase,
    preview_only: false,
    rows_affected: rowsAffected,
  };
}
