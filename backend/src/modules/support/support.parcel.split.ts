import {
  getField,
  getFieldNumber,
  getFieldString,
  querySafe,
} from './support.frames';

export type ParcelSplitRole = 'source' | 'result' | 'none';

export interface ParcelSplitInfo {
  role: ParcelSplitRole;
  split_flag: boolean;
  /** New parcels created from this parcel (this id is ParcelHistoryLink.parcelId). */
  child_esris: string[];
  child_parcel_ids: number[];
  /** Source parcel that was split to create this one (this esri is in ParcelHistoryLink.esri). */
  parent_parcel_id: number | null;
  parent_esri: string | null;
  history_link_rows: Record<string, unknown>[];
  child_parcel_rows: Record<string, unknown>[];
  parent_parcel_rows: Record<string, unknown>[];
  /** Enriched history rows for UI frames. */
  split_from_rows: Record<string, unknown>[];
  split_into_rows: Record<string, unknown>[];
}

/**
 * Detect parcel splits using the same convention as usp_SplitParcel_CopyFromOldParcel:
 * - ParcelHistoryLink.parcelId = OLD (source) parcel id
 * - ParcelHistoryLink.esri     = NEW parcel ESRI
 * - Optional: Parcel.splitFlag = 1 on the deactivated source
 */
export async function resolveParcelSplitInfo(
  systemKey: string,
  parcelId: number,
  parcelEsri: string | null,
  splitFlagRaw: unknown,
): Promise<ParcelSplitInfo> {
  const splitFlag =
    splitFlagRaw === true ||
    splitFlagRaw === 1 ||
    String(splitFlagRaw).toLowerCase() === 'true';

  const historyLinkRows = await querySafe(
    systemKey,
    `SELECT phl.*
     FROM ParcelHistoryLink phl
     WHERE phl.parcelId = @parcelId
     ORDER BY phl.id`,
    { parcelId },
  );

  const normalizedEsri = (parcelEsri ?? '').trim().replace(/\s+/g, '').toUpperCase();

  const parentLinkRows =
    normalizedEsri.length > 0
      ? await querySafe(
          systemKey,
          `SELECT phl.*, parent.id AS parentParcelId, parent.esri AS parentEsri,
                  parent.status AS parentStatus, parent.splitFlag AS parentSplitFlag,
                  parent.size AS parentSize, parent.description AS parentDescription
           FROM ParcelHistoryLink phl
           INNER JOIN Parcel parent ON parent.id = phl.parcelId
           WHERE UPPER(REPLACE(RTRIM(LTRIM(phl.esri)), ' ', '')) = @normalizedEsri
           ORDER BY phl.id`,
          { normalizedEsri },
        )
      : [];

  const childParcelRows =
    historyLinkRows.length > 0
      ? await querySafe(
          systemKey,
          `SELECT child.id, child.esri, child.department, child.section, child.number,
                  child.size, child.status, child.formedDate, child.description,
                  phl.id AS historyLinkId, phl.parcelId AS sourceParcelId
           FROM ParcelHistoryLink phl
           INNER JOIN Parcel child
             ON UPPER(REPLACE(RTRIM(LTRIM(child.esri)), ' ', '')) =
                UPPER(REPLACE(RTRIM(LTRIM(phl.esri)), ' ', ''))
           WHERE phl.parcelId = @parcelId
           ORDER BY child.id`,
          { parcelId },
        )
      : [];

  const childEsris = [
    ...new Set(
      historyLinkRows
        .map((row) => getFieldString(row, 'esri'))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const childParcelIds = [
    ...new Set(
      childParcelRows
        .map((row) => getFieldNumber(row, 'id'))
        .filter((value): value is number => value != null && value > 0),
    ),
  ];

  const firstParent = parentLinkRows[0];
  const parentParcelId = firstParent
    ? getFieldNumber(firstParent, 'parentParcelId', 'parcelId')
    : null;
  const parentEsri = firstParent
    ? getFieldString(firstParent, 'parentEsri')
    : null;

  const parentParcelRows =
    parentParcelId != null
      ? await querySafe(systemKey, 'SELECT * FROM Parcel WHERE id = @parentParcelId', {
          parentParcelId,
        })
      : [];

  const isSource = historyLinkRows.length > 0 || splitFlag;
  const isResult = parentLinkRows.length > 0;
  const role: ParcelSplitRole = isSource ? 'source' : isResult ? 'result' : 'none';

  const splitIntoRows = historyLinkRows.map((link) => {
    const linkEsri = getFieldString(link, 'esri');
    const child = childParcelRows.find(
      (row) =>
        (getFieldString(row, 'esri') ?? '').replace(/\s+/g, '').toUpperCase() ===
        (linkEsri ?? '').replace(/\s+/g, '').toUpperCase(),
    );
    return {
      relation: 'SPLIT_INTO',
      sourceParcelId: parcelId,
      sourceEsri: parcelEsri,
      newEsri: linkEsri,
      newParcelId: child ? getFieldNumber(child, 'id') : null,
      newStatus: child ? getFieldString(child, 'status') : null,
      newSize: child ? getFieldString(child, 'size') : null,
      historyLinkId: getFieldNumber(link, 'id'),
      note: child
        ? 'New parcel exists (created by split procedure)'
        : 'History link exists; new Parcel row not found yet',
    };
  });

  const splitFromRows = parentLinkRows.map((link) => ({
    relation: 'SPLIT_FROM',
    resultParcelId: parcelId,
    resultEsri: parcelEsri,
    sourceParcelId: getFieldNumber(link, 'parentParcelId', 'parcelId'),
    sourceEsri: getFieldString(link, 'parentEsri'),
    sourceStatus: getFieldString(link, 'parentStatus'),
    sourceSplitFlag: getField(link, 'parentSplitFlag'),
    historyLinkId: getFieldNumber(link, 'id'),
    note: 'This parcel was created from a split of the source parcel',
  }));

  return {
    role,
    split_flag: splitFlag,
    child_esris: childEsris,
    child_parcel_ids: childParcelIds,
    parent_parcel_id: parentParcelId,
    parent_esri: parentEsri,
    history_link_rows: historyLinkRows,
    child_parcel_rows: childParcelRows,
    parent_parcel_rows: parentParcelRows,
    split_from_rows: splitFromRows,
    split_into_rows: splitIntoRows,
  };
}
