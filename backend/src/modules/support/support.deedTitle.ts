import { querySystem } from '../../utils/externalDb';
import {
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  type SystemDialect,
} from './support.frames';

function formatTitle(register: string, segment: number, number: number): string {
  return `${register} ${segment}-${number}`;
}

function insertAfter(
  target: Record<string, unknown>,
  afterKeyCandidates: string[],
  entries: Array<[string, unknown]>,
): Record<string, unknown> {
  const keys = Object.keys(target);
  const afterKey = keys.find((key) =>
    afterKeyCandidates.some((candidate) => candidate.toLowerCase() === key.toLowerCase()),
  );

  const next: Record<string, unknown> = {};
  let inserted = false;
  for (const key of keys) {
    next[key] = target[key];
    if (!inserted && afterKey && key === afterKey) {
      for (const [name, value] of entries) next[name] = value;
      inserted = true;
    }
  }
  if (!inserted) {
    for (const [name, value] of entries) next[name] = value;
  }
  return next;
}

/** Load Register-Deel-Nummer titles for deed ids (Tereno + Kadaster). */
export async function mapDeedTitlesById(
  systemKey: string,
  dialect: SystemDialect,
  deedIds: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(deedIds.filter((id) => Number.isInteger(id) && id > 0))];
  const titles = new Map<number, string>();
  if (unique.length === 0) return titles;

  const registerFk = isTerenoDialect(dialect) ? 'legalFactRegisterId' : 'DeedTypeId';
  const params: Record<string, number> = {};
  const placeholders = unique.map((id, index) => {
    const key = `d${index}`;
    params[key] = id;
    return `@${key}`;
  });

  const rows = await querySystem(
    systemKey,
    `SELECT d.id AS deedId, d.[segment] AS segment, d.[number] AS number, lfr.register AS register
     FROM Deed d
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.${registerFk}
     WHERE d.id IN (${placeholders.join(', ')})`,
    params,
  );

  for (const row of rows) {
    const deedId = getFieldNumber(row, 'deedId', 'id', 'Id');
    if (deedId == null) continue;
    const register = getFieldString(row, 'register');
    const segment = getFieldNumber(row, 'segment', 'Segment');
    const number = getFieldNumber(row, 'number', 'Number');
    if (!register || segment == null || number == null) continue;
    titles.set(deedId, formatTitle(register, segment, number));
  }

  return titles;
}

/**
 * Adds a computed `title` column next to deedId (OrderDeed / AgendaAkteGroup / Deed rows).
 * Prefers already-present Akte / title when the map has no entry.
 */
export function attachDeedTitleColumn(
  rows: Record<string, unknown>[],
  titlesByDeedId: Map<number, string>,
  deedIdColumns: string[] = ['deedId', 'DeedId', 'id', 'Id'],
): Record<string, unknown>[] {
  if (rows.length === 0) return rows;

  return rows.map((row) => {
    const existing =
      getFieldString(row, 'title', 'Title', 'Akte', 'akte') ?? null;
    const deedId = getFieldNumber(row, ...deedIdColumns);
    const mapped = deedId != null ? titlesByDeedId.get(deedId) ?? null : null;
    const title = mapped ?? existing;
    if (title == null && Object.keys(row).some((k) => k.toLowerCase() === 'title')) {
      return row;
    }
    return insertAfter(row, deedIdColumns, [['title', title]]);
  });
}
