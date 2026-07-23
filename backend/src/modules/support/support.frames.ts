import { prisma } from '../../config/db';
import { AppError, NotFoundError } from '../../utils/AppError';
import { isConnectionError, querySystem, serializeRow } from '../../utils/externalDb';
import type { TableFrame } from './support.types';

export const DEFAULT_SYSTEM_KEY = 'kadaster_statia';

export function isProductionSystem(systemKey: string, envVarName?: string | null): boolean {
  const key = systemKey.toLowerCase();
  const env = (envVarName ?? '').toUpperCase();
  return key.includes('_prod') || env.includes('_PROD');
}

/** Tereno / DLV Aruba uses Parcel + DeedDetail.plotId (not Kadaster PerceelTb). */
export function isTerenoSupportSystem(systemKey: string): boolean {
  const key = systemKey.toLowerCase();
  return key.startsWith('dlv_') || key.includes('tereno') || key.includes('aruba');
}

export async function resolveSupportSystem(systemKey: string): Promise<{
  system_key: string;
  system_name: string;
  is_production: boolean;
  env_var_name: string;
}> {
  const system = await prisma.systemConnection.findUnique({
    where: { systemKey },
  });
  if (!system || !system.isActive) {
    throw new NotFoundError(`System connection "${systemKey}" not found or inactive`);
  }

  return {
    system_key: system.systemKey,
    system_name: system.name,
    is_production: isProductionSystem(system.systemKey, system.envVarName),
    env_var_name: system.envVarName,
  };
}

export function buildFrame(
  key: string,
  label: string,
  tableName: string,
  primaryKey: string,
  rows: Record<string, unknown>[],
  options?: { editable?: boolean; section?: string; sectionLabel?: string },
): TableFrame {
  const serialized = rows.map(serializeRow);
  const columnNames = serialized.length > 0 ? Object.keys(serialized[0]) : [];
  const editable = options?.editable ?? false;

  return {
    key,
    label,
    tableName,
    primaryKey,
    editable,
    section: options?.section,
    sectionLabel: options?.sectionLabel,
    columns: columnNames.map((name) => ({
      name,
      isPrimaryKey: name === primaryKey,
      editable: editable && name !== primaryKey,
    })),
    rows: serialized,
    rowCount: serialized.length,
  };
}

/** ODBC/msnodesqlv8 may return different column casing than Prisma maps. */
export function getField(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (found != null && row[found] !== undefined) {
      return row[found];
    }
  }
  return undefined;
}

export function getFieldString(
  row: Record<string, unknown>,
  ...candidates: string[]
): string | null {
  const value = getField(row, ...candidates);
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function getFieldNumber(
  row: Record<string, unknown>,
  ...candidates: string[]
): number | null {
  const value = getField(row, ...candidates);
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function asNumberIds(rows: Record<string, unknown>[], column: string): number[] {
  return [
    ...new Set(
      rows
        .map((row) => getFieldNumber(row, column))
        .filter((value): value is number => value != null && value > 0),
    ),
  ];
}

export async function queryByIds(
  systemKey: string,
  tableSql: string,
  idColumn: string,
  ids: Array<string | number>,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];

  const params: Record<string, unknown> = {};
  const placeholders = ids.map((id, index) => {
    const key = `id${index}`;
    params[key] = id;
    return `@${key}`;
  });

  try {
    return await querySystem(
      systemKey,
      `SELECT * FROM ${tableSql} WHERE ${idColumn} IN (${placeholders.join(', ')})`,
      params,
    );
  } catch (error) {
    // Connection problems must surface; only skip missing/optional tables.
    if (error instanceof AppError || isConnectionError(error)) throw error;
    console.warn(`Support lookup skipped ${tableSql}:`, error);
    return [];
  }
}

export async function querySafe(
  systemKey: string,
  queryText: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  try {
    return await querySystem(systemKey, queryText, params);
  } catch (error) {
    if (error instanceof AppError || isConnectionError(error)) throw error;
    console.warn('Support lookup query failed:', error);
    return [];
  }
}

export function filterByIds(
  rows: Record<string, unknown>[],
  column: string,
  ids: number[],
): Record<string, unknown>[] {
  const set = new Set(ids);
  return rows.filter((row) => {
    const value = getFieldNumber(row, column);
    return value != null && set.has(value);
  });
}
