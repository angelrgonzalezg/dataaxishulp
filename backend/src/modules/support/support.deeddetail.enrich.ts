import { buildSubjectName } from './inzage.helpers';
import {
  asNumberIds,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  queryByIds,
  resolveSystemDialect,
} from './support.frames';

function pickDescription(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  return (
    getFieldString(
      row,
      'nameNl',
      'nameNe',
      'legalFactNed',
      'nameEn',
      'legalFactEng',
      'description',
      'Description',
      'name',
      'Name',
      'code',
      'Code',
    ) ?? null
  );
}

function pickRoleDescription(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const name =
    getFieldString(row, 'nameNe', 'nameNl', 'nameEn', 'name', 'Name', 'description', 'Description') ??
    null;
  const section = getFieldString(row, 'sectionCode', 'SectionCode');
  if (name && section) return `${name} (${section})`;
  return name;
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
      for (const [name, value] of entries) {
        next[name] = value;
      }
      inserted = true;
    }
  }

  if (!inserted) {
    for (const [name, value] of entries) {
      next[name] = value;
    }
  }

  return next;
}

/**
 * Adds readable description columns next to FK ids on DeedDetail rows.
 * Note: despite the column name legalFactTypeId / DeedTypeId, the description
 * is resolved from LegalFact (legacy Tereno/Kadaster naming).
 */
export async function enrichDeedDetailRows(
  systemKey: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;

  const dialect = await resolveSystemDialect(systemKey);
  const tereno = isTerenoDialect(dialect);
  const legalFactIds = asNumberIds(rows, tereno ? 'legalFactTypeId' : 'DeedTypeId');
  const subjectIds = asNumberIds(rows, tereno ? 'subjectId' : 'SubjectId');
  const roleIds = asNumberIds(rows, tereno ? 'transactionRoleId' : 'TransactionRoleId');

  const [legalFactRows, subjectRows, roleRows] = await Promise.all([
    queryByIds(systemKey, 'LegalFact', 'id', legalFactIds),
    queryByIds(systemKey, 'Subject', tereno ? 'id' : 'SubjectID', subjectIds),
    queryByIds(systemKey, 'TransactionRole', 'id', roleIds),
  ]);

  const legalFactById = new Map<number, string>();
  for (const row of legalFactRows) {
    const id = getFieldNumber(row, 'id', 'Id');
    const description = pickDescription(row);
    if (id != null && description) legalFactById.set(id, description);
  }

  const subjectById = new Map<number, string>();
  for (const row of subjectRows) {
    const id = getFieldNumber(row, 'id', 'Id', 'SubjectID', 'SubjectId');
    if (id != null) subjectById.set(id, buildSubjectName(row));
  }

  const roleById = new Map<number, string>();
  for (const row of roleRows) {
    const id = getFieldNumber(row, 'id', 'Id');
    const description = pickRoleDescription(row);
    if (id != null && description) roleById.set(id, description);
  }

  return rows.map((row) => {
    const legalFactId = getFieldNumber(row, tereno ? 'legalFactTypeId' : 'DeedTypeId');
    const subjectId = getFieldNumber(row, tereno ? 'subjectId' : 'SubjectId');
    const roleId = getFieldNumber(row, tereno ? 'transactionRoleId' : 'TransactionRoleId');

    let enriched = { ...row };

    enriched = insertAfter(
      enriched,
      tereno ? ['legalFactTypeId'] : ['DeedTypeId'],
      [
        [
          'legalFactDescription',
          legalFactId != null ? (legalFactById.get(legalFactId) ?? null) : null,
        ],
      ],
    );

    enriched = insertAfter(
      enriched,
      tereno ? ['subjectId'] : ['SubjectId'],
      [['subjectDescription', subjectId != null ? (subjectById.get(subjectId) ?? null) : null]],
    );

    enriched = insertAfter(
      enriched,
      tereno ? ['transactionRoleId'] : ['TransactionRoleId'],
      [['roleDescription', roleId != null ? (roleById.get(roleId) ?? null) : null]],
    );

    return enriched;
  });
}
