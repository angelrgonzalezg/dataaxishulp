import { NotFoundError, ValidationError } from '../../utils/AppError';
import {
  asNumberIds,
  buildFrame,
  filterByIds,
  getField,
  getFieldNumber,
  getFieldString,
  queryByIds,
  querySafe,
  resolveSupportSystem,
} from './support.frames';
import { resolveParcelSplitInfo } from './support.parcel.split';
import { enrichDeedDetailRows } from './support.deeddetail.enrich';
import { enrichOrderProductsWithCatalog } from './support.order.tereno.service';
import type { ParcelSupportLookup, TableFrame } from './support.types';

/** Best-effort grouping aligned with Tereno legal-fact usage (may evolve). */
const TITLE_TYPE_IDS = [1, 34];
const SHARE_TYPE_IDS = [10, 11, 12];
const LIMITED_RIGHTS_TYPE_IDS = [2, 5];
const MORTGAGE_TYPE_IDS = [39, 41, 1047];
const SEIZURE_TYPE_IDS = [36];

const SECTIONS = {
  core: { section: 'parcel_core', sectionLabel: 'Parcel core' },
  split: { section: 'parcel_split', sectionLabel: 'Parcel split (splitsing)' },
  titles: { section: 'andere_details_titles', sectionLabel: 'Andere details - C Titels' },
  share: { section: 'andere_details_share', sectionLabel: 'Andere details - Share titles' },
  limited: {
    section: 'andere_details_limited_rights',
    sectionLabel: 'Andere details - Beperkte rechten',
  },
  mortgages: { section: 'andere_details_mortgages', sectionLabel: 'Andere details - Hypotheek' },
  seizures: { section: 'andere_details_seizures', sectionLabel: 'Andere details - Beslag' },
  orders: { section: 'order_links', sectionLabel: 'Linked orders' },
  all: { section: 'andere_details_all', sectionLabel: 'Andere details - Alles (source)' },
} as const;

function pushFrame(frames: TableFrame[], frame: TableFrame, keepEmptyKeys: string[] = []) {
  if (frame.rowCount > 0 || keepEmptyKeys.includes(frame.key)) {
    frames.push(frame);
  }
}

async function resolveTerenoParcelRows(
  systemKey: string,
  input: { parcelId?: number; meetBrief?: string },
): Promise<{ parcels: Record<string, unknown>[]; entry: ParcelSupportLookup['entry'] }> {
  if (input.parcelId) {
    const parcels = await querySafe(systemKey, 'SELECT * FROM Parcel WHERE id = @parcelId', {
      parcelId: input.parcelId,
    });
    return { parcels, entry: 'parcel_number' };
  }

  const meetBrief = input.meetBrief?.trim();
  if (!meetBrief) {
    throw new ValidationError('Provide parcelId or meetBrief');
  }

  let parcels = await querySafe(systemKey, 'SELECT * FROM Parcel WHERE esri = @meetBrief', {
    meetBrief,
  });

  if (parcels.length === 0) {
    parcels = await querySafe(
      systemKey,
      'SELECT * FROM Parcel WHERE esri LIKE @meetBriefLike ORDER BY id',
      { meetBriefLike: `%${meetBrief}%` },
    );
  }

  return { parcels, entry: 'meet_brief' };
}

/**
 * Parcel support lookup for Tereno / DLV Aruba schema:
 * Parcel.id  ↔  DeedDetail.plotId  (UI "parcel number" / plotId).
 */
export async function lookupParcelTereno(input: {
  parcelId?: number;
  meetBrief?: string;
  systemKey: string;
}): Promise<ParcelSupportLookup> {
  const systemKey = input.systemKey;
  const system = await resolveSupportSystem(systemKey);
  const { parcels, entry } = await resolveTerenoParcelRows(systemKey, input);

  if (parcels.length === 0) {
    const label = input.parcelId
      ? `Parcel / plotId ${input.parcelId}`
      : `ESRI / meet brief "${input.meetBrief}"`;
    throw new NotFoundError(`${label} not found in ${system.system_name}`);
  }

  const candidates = parcels.map((parcel) => ({
    parcel_id: getFieldNumber(parcel, 'id') ?? 0,
    meet_brief: getFieldString(parcel, 'esri'),
    location: getFieldString(parcel, 'location'),
    status: getFieldString(parcel, 'status'),
  }));

  if (entry === 'meet_brief' && parcels.length > 1 && !input.parcelId) {
    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      entry,
      parcel_id: 0,
      meet_brief: input.meetBrief?.trim() ?? null,
      found: true,
      candidates,
      summary: null,
      frames: [
        buildFrame(
          'parcel_candidates',
          'Matching parcels — select a parcel id to continue',
          'Parcel',
          'id',
          parcels,
          SECTIONS.core,
        ),
      ],
    };
  }

  const parcel = parcels[0];
  const parcelId = getFieldNumber(parcel, 'id');
  if (!parcelId) {
    throw new NotFoundError('Parcel id missing on matched row');
  }

  const esri = getFieldString(parcel, 'esri');
  const frames: TableFrame[] = [];

  pushFrame(
    frames,
    buildFrame('parcel', 'Parcel', 'Parcel', 'id', [parcel], SECTIONS.core),
    ['parcel'],
  );

  const splitInfo = await resolveParcelSplitInfo(
    systemKey,
    parcelId,
    esri,
    getField(parcel, 'splitFlag'),
  );

  pushFrame(
    frames,
    buildFrame(
      'parcel_history',
      'Parcel history links (source → new ESRI)',
      'ParcelHistoryLink',
      'id',
      splitInfo.history_link_rows,
      SECTIONS.split,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'split_into',
      'Split into (new parcels from this source)',
      'ParcelHistoryLink',
      'historyLinkId',
      splitInfo.split_into_rows,
      SECTIONS.split,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'split_children',
      'Child parcels created by split',
      'Parcel',
      'id',
      splitInfo.child_parcel_rows,
      SECTIONS.split,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'split_from',
      'Split from (source parcel of this result)',
      'ParcelHistoryLink',
      'historyLinkId',
      splitInfo.split_from_rows,
      SECTIONS.split,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'split_parent',
      'Parent / source parcel',
      'Parcel',
      'id',
      splitInfo.parent_parcel_rows,
      SECTIONS.split,
    ),
  );

  const certificates = await querySafe(
    systemKey,
    'SELECT * FROM CertificateOfAdmeasurement WHERE parcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'certificate',
      'Certificate of admeasurement',
      'CertificateOfAdmeasurement',
      'id',
      certificates,
      SECTIONS.core,
    ),
  );

  const allDeedDetailsRaw = await querySafe(
    systemKey,
    'SELECT * FROM DeedDetail WHERE plotId = @parcelId',
    { parcelId },
  );
  const allDeedDetails = await enrichDeedDetailRows(systemKey, allDeedDetailsRaw);
  pushFrame(
    frames,
    buildFrame(
      'deed_details_all',
      'All deed details for parcel (plotId)',
      'DeedDetail',
      'id',
      allDeedDetails,
      SECTIONS.all,
    ),
  );

  const titleDetails = filterByIds(allDeedDetails, 'legalFactTypeId', TITLE_TYPE_IDS);
  const shareDetails = filterByIds(allDeedDetails, 'legalFactTypeId', SHARE_TYPE_IDS);
  const limitedDetails = filterByIds(allDeedDetails, 'legalFactTypeId', LIMITED_RIGHTS_TYPE_IDS);
  const mortgageDetails = filterByIds(allDeedDetails, 'legalFactTypeId', MORTGAGE_TYPE_IDS);
  const seizureDetails = filterByIds(allDeedDetails, 'legalFactTypeId', SEIZURE_TYPE_IDS);

  pushFrame(
    frames,
    buildFrame(
      'deed_details_titles',
      'C Titels / Ownership deed details',
      'DeedDetail',
      'id',
      titleDetails,
      SECTIONS.titles,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_share',
      'Share title deed details',
      'DeedDetail',
      'id',
      shareDetails,
      SECTIONS.share,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_limited_rights',
      'Limited rights deed details',
      'DeedDetail',
      'id',
      limitedDetails,
      SECTIONS.limited,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_mortgages',
      'Hypotheek deed details',
      'DeedDetail',
      'id',
      mortgageDetails,
      SECTIONS.mortgages,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_seizures',
      'Beslag deed details',
      'DeedDetail',
      'id',
      seizureDetails,
      SECTIONS.seizures,
    ),
  );

  const deedIds = asNumberIds(allDeedDetails, 'deedId');
  const subjectIds = asNumberIds(allDeedDetails, 'subjectId');
  const legalFactTypeIds = asNumberIds(allDeedDetails, 'legalFactTypeId');
  const deedProcedureIds = asNumberIds(allDeedDetails, 'deedProcedureId');
  const transactionRoleIds = asNumberIds(allDeedDetails, 'transactionRoleId');

  const deeds = await queryByIds(systemKey, 'Deed', 'id', deedIds);
  pushFrame(
    frames,
    buildFrame('deeds', 'Deeds', 'Deed', 'id', deeds, SECTIONS.all),
  );

  // Compact deed + Type akte rows for the Change Type akte resolution tool.
  if (deedIds.length > 0) {
    const deedIn = deedIds
      .map((id, index) => {
        return { key: `did${index}`, id };
      });
    const params: Record<string, unknown> = {};
    const placeholders = deedIn.map(({ key, id }) => {
      params[key] = id;
      return `@${key}`;
    });
    const deedsWithLegalFact = await querySafe(
      systemKey,
      `SELECT d.id AS deedId,
              lfr.register AS register,
              d.[segment] AS segment,
              d.[number] AS number,
              d.legalFactId AS legalFactId,
              lf.code AS legalFactCode,
              lf.nameNl AS legalFactNameNl,
              CONCAT(
                ISNULL(lfr.register, ''),
                ' ',
                CAST(d.[segment] AS varchar(20)),
                '-',
                CAST(d.[number] AS varchar(20))
              ) AS title
       FROM Deed d
       LEFT JOIN LegalFactRegister lfr ON lfr.id = d.legalFactRegisterId
       LEFT JOIN LegalFact lf ON lf.id = d.legalFactId
       WHERE d.id IN (${placeholders.join(', ')})
       ORDER BY lfr.register, d.[segment], d.[number], d.id`,
      params,
    );
    pushFrame(
      frames,
      buildFrame(
        'deeds_with_legal_fact',
        'Deeds with Type akte (LegalFact)',
        'Deed',
        'deedId',
        deedsWithLegalFact,
        SECTIONS.core,
      ),
    );
  }

  const subjects = await queryByIds(systemKey, 'Subject', 'id', subjectIds);
  pushFrame(
    frames,
    buildFrame('subjects', 'Subjects', 'Subject', 'id', subjects, SECTIONS.all),
  );

  const legalFactTypes = await queryByIds(systemKey, 'LegalFactType', 'id', legalFactTypeIds);
  pushFrame(
    frames,
    buildFrame(
      'legal_fact_types',
      'Legal fact types',
      'LegalFactType',
      'id',
      legalFactTypes,
      SECTIONS.all,
    ),
  );

  const deedProcedures = await queryByIds(systemKey, 'DeedProcedure', 'id', deedProcedureIds);
  pushFrame(
    frames,
    buildFrame('deed_procedures', 'Deed procedures', 'DeedProcedure', 'id', deedProcedures, SECTIONS.all),
  );

  const transactionRoles = await queryByIds(systemKey, 'TransactionRole', 'id', transactionRoleIds);
  pushFrame(
    frames,
    buildFrame(
      'transaction_roles',
      'Transaction roles',
      'TransactionRole',
      'id',
      transactionRoles,
      SECTIONS.all,
    ),
  );

  const notaryIds = asNumberIds(deeds, 'notaryId');
  const notaries = await queryByIds(systemKey, 'Notary', 'id', notaryIds);
  pushFrame(
    frames,
    buildFrame('notaries', 'Notaries', 'Notary', 'id', notaries, SECTIONS.all),
  );

  const registerIds = asNumberIds(deeds, 'legalFactRegisterId');
  const legalFactRegisters = await queryByIds(systemKey, 'LegalFactRegister', 'id', registerIds);
  pushFrame(
    frames,
    buildFrame(
      'legal_fact_registers',
      'Legal fact registers',
      'LegalFactRegister',
      'id',
      legalFactRegisters,
      SECTIONS.all,
    ),
  );

  const deedDetailSubjects = await querySafe(
    systemKey,
    'SELECT * FROM DeedDetailSubject WHERE parcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_detail_subjects',
      'Deed detail subjects',
      'DeedDetailSubject',
      'id',
      deedDetailSubjects,
      SECTIONS.all,
    ),
  );

  const annotations = await querySafe(
    systemKey,
    'SELECT * FROM DeedDetailAnnotation WHERE plotId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_detail_annotations',
      'Deed detail annotations',
      'DeedDetailAnnotation',
      'id',
      annotations,
      SECTIONS.limited,
    ),
  );

  const shareGroups = await querySafe(
    systemKey,
    `SELECT * FROM ShareGroup
     WHERE mainParcelId = @parcelId OR shareParcelId = @parcelId`,
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('share_groups', 'Share groups', 'ShareGroup', 'id', shareGroups, SECTIONS.share),
  );

  const mortgages = await querySafe(
    systemKey,
    'SELECT * FROM Mortgage WHERE parcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('mortgages', 'Mortgages', 'Mortgage', 'id', mortgages, SECTIONS.mortgages),
  );

  const seizures = await querySafe(
    systemKey,
    'SELECT * FROM Seizure WHERE parcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('seizures', 'Seizures', 'Seizure', 'id', seizures, SECTIONS.seizures),
  );

  const parcelGroups = await querySafe(
    systemKey,
    'SELECT * FROM ParcelGroup WHERE parcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('parcel_groups', 'Parcel groups', 'ParcelGroup', 'id', parcelGroups, SECTIONS.all),
  );

  const orderParcels = await querySafe(
    systemKey,
    'SELECT * FROM OrderParcel WHERE parcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'order_parcels',
      'Order parcel links',
      'OrderParcel',
      'id',
      orderParcels,
      SECTIONS.orders,
    ),
  );

  const orderProductIds = asNumberIds(orderParcels, 'orderProductId');
  const orderProductsRaw =
    orderProductIds.length > 0
      ? await (async () => {
          const params: Record<string, unknown> = {};
          const placeholders = orderProductIds.map((id, index) => {
            const key = `opid${index}`;
            params[key] = id;
            return `@${key}`;
          });
          return querySafe(
            systemKey,
            `SELECT op.*,
                    p.code AS code,
                    p.nameNl AS nameNl,
                    p.nameEn AS nameEn
             FROM OrderProduct op
             LEFT JOIN Product p ON p.id = op.productId
             WHERE op.id IN (${placeholders.join(', ')})`,
            params,
          );
        })()
      : [];
  const orderProducts = await enrichOrderProductsWithCatalog(systemKey, orderProductsRaw);
  pushFrame(
    frames,
    buildFrame('order_products', 'Order products', 'OrderProduct', 'id', orderProducts, SECTIONS.orders),
  );

  const orderIds = asNumberIds(orderProducts, 'orderId');
  // SQL Server: Order is a reserved keyword — must quote as [Order].
  const orders = await queryByIds(systemKey, '[Order]', 'id', orderIds);
  pushFrame(
    frames,
    buildFrame('orders', 'Orders', 'Order', 'id', orders, SECTIONS.orders),
  );

  const productCountByOrder = new Map<number, number>();
  for (const row of orderProducts) {
    const oid = getFieldNumber(row, 'orderId');
    if (oid == null) continue;
    productCountByOrder.set(oid, (productCountByOrder.get(oid) ?? 0) + 1);
  }

  const orderById = new Map<number, Record<string, unknown>>();
  for (const order of orders) {
    const id = getFieldNumber(order, 'id');
    if (id != null) orderById.set(id, order);
  }

  const linkedOrders = orderIds
    .map((orderId) => {
      const order = orderById.get(orderId);
      return {
        order_id: orderId,
        transaction_id: order ? getFieldString(order, 'transactionId') : null,
        notary_code: order ? getFieldString(order, 'notaryCode') : null,
        requester: order ? getFieldString(order, 'requester') : null,
        register_date: order
          ? order.registerDate instanceof Date
            ? order.registerDate.toISOString()
            : getFieldString(order, 'registerDate')
          : null,
        product_count: productCountByOrder.get(orderId) ?? 0,
      };
    })
    .filter((item) => item.order_id > 0)
    .sort((a, b) => b.order_id - a.order_id);

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    entry,
    parcel_id: parcelId,
    meet_brief: esri,
    found: true,
    candidates: candidates.length > 1 ? candidates : undefined,
    summary: {
      meet_brief: esri,
      description: getFieldString(parcel, 'description'),
      location: getFieldString(parcel, 'location'),
      sheet: getFieldString(parcel, 'sheet'),
      size: getFieldString(parcel, 'size'),
      property_type: getFieldString(parcel, 'propertyType'),
      status: getFieldString(parcel, 'status'),
      title_details: titleDetails.length,
      mortgage_details: mortgageDetails.length + mortgages.length,
      seizure_details: seizureDetails.length + seizures.length,
      limited_rights_details: limitedDetails.length,
      share_details: shareDetails.length + shareGroups.length,
      order_links: orderParcels.length,
      linked_orders: linkedOrders,
      split_role: splitInfo.role,
      split_flag: splitInfo.split_flag,
      split_child_count: splitInfo.child_esris.length,
      split_child_esris: splitInfo.child_esris,
      split_parent_parcel_id: splitInfo.parent_parcel_id,
      split_parent_esri: splitInfo.parent_esri,
    },
    frames,
  };
}
