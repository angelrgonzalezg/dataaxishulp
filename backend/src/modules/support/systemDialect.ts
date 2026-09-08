/**
 * Schema dialect profiles for land-registry system connections.
 *
 * - kadaster: Statia / Saba (PerceelTb, Agenda, SubjectID, …)
 * - tereno:   DLV Aruba (Parcel, Order, Subject.id, …)
 * - bonaire:  labeled separately; currently uses kadaster-like SQL until verified
 */

export const SYSTEM_DIALECTS = ['kadaster', 'tereno', 'bonaire'] as const;

export type SystemDialect = (typeof SYSTEM_DIALECTS)[number];

export function isSystemDialect(value: unknown): value is SystemDialect {
  return typeof value === 'string' && (SYSTEM_DIALECTS as readonly string[]).includes(value);
}

/** Infer dialect from systemKey when DB column is missing/unset. */
export function inferDialectFromSystemKey(systemKey: string): SystemDialect {
  const key = systemKey.toLowerCase();
  if (key.startsWith('dlv_') || key.includes('tereno') || key.includes('aruba')) {
    return 'tereno';
  }
  if (key.includes('bonaire')) {
    return 'bonaire';
  }
  return 'kadaster';
}

export function normalizeDialect(value: string | null | undefined, systemKey?: string): SystemDialect {
  if (isSystemDialect(value)) return value;
  if (systemKey) return inferDialectFromSystemKey(systemKey);
  return 'kadaster';
}

export function isTerenoDialect(dialect: SystemDialect): boolean {
  return dialect === 'tereno';
}

/** Statia/Saba and (for now) Bonaire share the Kadaster-style schema. */
export function isKadasterLikeDialect(dialect: SystemDialect): boolean {
  return dialect === 'kadaster' || dialect === 'bonaire';
}

/** Concrete island/family. Dialect is the schema family; this is the place. */
export const ISLAND_FAMILIES = ['statia', 'saba', 'bonaire', 'aruba', 'atl', 'unknown'] as const;
export type IslandFamily = (typeof ISLAND_FAMILIES)[number];

export function inferIslandFromSystemKey(systemKey: string): IslandFamily {
  const key = systemKey.toLowerCase();
  if (key.includes('statia')) return 'statia';
  if (key.includes('saba')) return 'saba';
  if (key.includes('bonaire')) return 'bonaire';
  if (key.includes('aruba') || key.includes('dlv') || key.includes('tereno')) return 'aruba';
  if (key.includes('atl')) return 'atl';
  return 'unknown';
}

export type DialectTableProfile = {
  parcelTable: string;
  parcelIdColumn: string;
  subjectTable: string;
  subjectIdColumn: string;
  orderTable: string;
  orderIdColumn: string;
  deedDetailDeedId: string;
  deedDetailSubjectId: string;
  deedDetailParcelId: string;
  deedDetailTypeId: string;
  deedLegalFactId: string;
  deedRegisterId: string;
};

const KADASTER_PROFILE: DialectTableProfile = {
  parcelTable: 'PerceelTb',
  parcelIdColumn: 'PerceelNummer',
  subjectTable: 'Subject',
  subjectIdColumn: 'SubjectID',
  orderTable: 'Agenda',
  orderIdColumn: 'Agenda_ID',
  deedDetailDeedId: 'DeedID',
  deedDetailSubjectId: 'SubjectId',
  deedDetailParcelId: 'PlotId',
  deedDetailTypeId: 'DeedTypeId',
  deedLegalFactId: 'MethodOfAcquisition',
  deedRegisterId: 'DeedTypeId',
};

const TERENO_PROFILE: DialectTableProfile = {
  parcelTable: 'Parcel',
  parcelIdColumn: 'id',
  subjectTable: 'Subject',
  subjectIdColumn: 'id',
  orderTable: '[Order]',
  orderIdColumn: 'id',
  deedDetailDeedId: 'deedId',
  deedDetailSubjectId: 'subjectId',
  deedDetailParcelId: 'plotId',
  deedDetailTypeId: 'legalFactTypeId',
  deedLegalFactId: 'legalFactId',
  deedRegisterId: 'legalFactRegisterId',
};

export function getDialectProfile(dialect: SystemDialect): DialectTableProfile {
  if (dialect === 'tereno') return TERENO_PROFILE;
  // bonaire: kadaster-like until island-specific diffs are confirmed
  return KADASTER_PROFILE;
}
