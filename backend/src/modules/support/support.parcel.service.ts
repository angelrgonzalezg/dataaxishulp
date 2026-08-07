import { NotFoundError, ValidationError } from '../../utils/AppError';
import {
  DEFAULT_SYSTEM_KEY,
  asNumberIds,
  buildFrame,
  filterByIds,
  getFieldNumber,
  getFieldString,
  queryByIds,
  querySafe,
  resolveSupportSystem,
} from './support.frames';
import { lookupParcelTereno } from './support.parcel.tereno.service';
import { isTerenoDialect } from './systemDialect';
import { enrichDeedDetailRows } from './support.deeddetail.enrich';
import type { ParcelSupportLookup, TableFrame } from './support.types';

/** Same legalFactTypeId groups used by Kadaster parcels Andere details (Alles). */
const TITLE_TYPE_IDS = [1, 34];
const SHARE_TYPE_IDS = [10, 11, 12];
const LIMITED_RIGHTS_TYPE_IDS = [2, 5];
const MORTGAGE_TYPE_IDS = [39, 41, 1047];
const SEIZURE_TYPE_IDS = [36];

const ANDERE = {
  titles: { section: 'andere_details_titles', sectionLabel: 'Andere details - C Titels' },
  share: { section: 'andere_details_share', sectionLabel: 'Andere details - Share titles' },
  limited: {
    section: 'andere_details_limited_rights',
    sectionLabel: 'Andere details - Beperkte rechten',
  },
  mortgages: { section: 'andere_details_mortgages', sectionLabel: 'Andere details - Hypotheek' },
  seizures: { section: 'andere_details_seizures', sectionLabel: 'Andere details - Beslag' },
  core: { section: 'parcel_core', sectionLabel: 'Parcel core' },
  orders: { section: 'order_links', sectionLabel: 'Linked orders' },
} as const;

function pushFrame(frames: TableFrame[], frame: TableFrame, keepEmptyKeys: string[] = []) {
  if (frame.rowCount > 0 || keepEmptyKeys.includes(frame.key)) {
    frames.push(frame);
  }
}

async function resolveParcelRows(
  systemKey: string,
  input: {
    parcelId?: number;
    meetBrief?: string;
  },
): Promise<{ parcels: Record<string, unknown>[]; entry: ParcelSupportLookup['entry'] }> {
  if (input.parcelId) {
    const parcels = await querySafe(
      systemKey,
      'SELECT * FROM PerceelTb WHERE PerceelNummer = @parcelId',
      { parcelId: input.parcelId },
    );
    return { parcels, entry: 'parcel_number' };
  }

  const meetBrief = input.meetBrief?.trim();
  if (!meetBrief) {
    throw new ValidationError('Provide parcelId or meetBrief');
  }

  // Exact match first (e.g. 0/1949), then contains fallback
  let parcels = await querySafe(
    systemKey,
    'SELECT * FROM PerceelTb WHERE MeetbriefInf = @meetBrief',
    { meetBrief },
  );

  if (parcels.length === 0) {
    parcels = await querySafe(
      systemKey,
      'SELECT * FROM PerceelTb WHERE MeetbriefInf LIKE @meetBriefLike ORDER BY PerceelNummer',
      { meetBriefLike: `%${meetBrief}%` },
    );
  }

  return { parcels, entry: 'meet_brief' };
}

export async function lookupParcel(input: {
  parcelId?: number;
  meetBrief?: string;
  systemKey?: string;
}): Promise<ParcelSupportLookup> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);

  if (isTerenoDialect(system.dialect)) {
    return lookupParcelTereno({
      parcelId: input.parcelId,
      meetBrief: input.meetBrief,
      systemKey,
    });
  }

  const { parcels, entry } = await resolveParcelRows(systemKey, input);

  if (parcels.length === 0) {
    const label = input.parcelId
      ? `Parcel ${input.parcelId}`
      : `Meet brief "${input.meetBrief}"`;
    throw new NotFoundError(`${label} not found in ${system.system_name}`);
  }

  const candidates = parcels.map((parcel) => ({
    parcel_id: getFieldNumber(parcel, 'PerceelNummer') ?? 0,
    meet_brief: getFieldString(parcel, 'MeetbriefInf', 'Meetbriefinf'),
    location: getFieldString(parcel, 'PerceelPlaatselijke'),
    status: getFieldString(parcel, 'PerceelStatus'),
  }));

  // If meet brief matches multiple parcels, return candidates only
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
          'Matching parcels — select a parcel number to continue',
          'PerceelTb',
          'PerceelNummer',
          parcels,
          ANDERE.core,
        ),
      ],
    };
  }

  const parcel = parcels[0];
  const parcelId = getFieldNumber(parcel, 'PerceelNummer');
  if (!parcelId) {
    throw new NotFoundError('Parcel id missing on matched row');
  }
  const meetBrief = getFieldString(parcel, 'MeetbriefInf', 'Meetbriefinf');
  const frames: TableFrame[] = [];

  pushFrame(
    frames,
    buildFrame('parcel', 'Parcel (PerceelTb)', 'PerceelTb', 'PerceelNummer', [parcel], ANDERE.core),
    ['parcel'],
  );

  const historyByParcel = await querySafe(
    systemKey,
    'SELECT * FROM VeranderOude WHERE VeranderOudeOudePerceelNummer = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'parcel_history_by_id',
      'Parcel history links (by parcel id)',
      'VeranderOude',
      'VeranderOudeID',
      historyByParcel,
      ANDERE.core,
    ),
  );

  if (meetBrief) {
    const historyByMeetBrief = await querySafe(
      systemKey,
      'SELECT * FROM VeranderOude WHERE PerceelEsri = @meetBrief',
      { meetBrief },
    );
    pushFrame(
      frames,
      buildFrame(
        'parcel_history_by_meetbrief',
        'Parcel history links (by meet brief)',
        'VeranderOude',
        'VeranderOudeID',
        historyByMeetBrief,
        ANDERE.core,
      ),
    );

    const relatedHistoryMeetBriefs = asNumberIds(
      historyByMeetBrief,
      'VeranderOudeOudePerceelNummer',
    );
    const historyMeetBriefs = [
      ...new Set(
        [...historyByParcel, ...historyByMeetBrief]
          .map((row) => getFieldString(row, 'PerceelEsri'))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (historyMeetBriefs.length > 0) {
      const params: Record<string, unknown> = {};
      const placeholders = historyMeetBriefs.map((value, index) => {
        const key = `mb${index}`;
        params[key] = value;
        return `@${key}`;
      });
      const relatedParcels = await querySafe(
        systemKey,
        `SELECT * FROM PerceelTb WHERE MeetbriefInf IN (${placeholders.join(', ')})`,
        params,
      );
      pushFrame(
        frames,
        buildFrame(
          'related_history_parcels',
          'Related history parcels',
          'PerceelTb',
          'PerceelNummer',
          relatedParcels,
          ANDERE.core,
        ),
      );
    }

    if (relatedHistoryMeetBriefs.length > 0) {
      const relatedById = await queryByIds(systemKey, 'PerceelTb', 'PerceelNummer', relatedHistoryMeetBriefs);
      pushFrame(
        frames,
        buildFrame(
          'related_history_parcels_by_id',
          'Related history parcels (by id)',
          'PerceelTb',
          'PerceelNummer',
          relatedById,
          ANDERE.core,
        ),
      );
    }
  }

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
      ANDERE.core,
    ),
  );

  // --- Andere details: all DeedDetail for this parcel (source of Titels / Hypotheek / Beslag) ---
  const allDeedDetailsRaw = await querySafe(systemKey, 'SELECT * FROM DeedDetail WHERE PlotId = @parcelId', {
    parcelId,
  });
  const allDeedDetails = await enrichDeedDetailRows(systemKey, allDeedDetailsRaw);
  pushFrame(
    frames,
    buildFrame(
      'deed_details_all',
      'All deed details for parcel (Alles source)',
      'DeedDetail',
      'Id',
      allDeedDetails,
      { section: 'andere_details_all', sectionLabel: 'Andere details - Alles (source)' },
    ),
  );

  const titleDetails = filterByIds(allDeedDetails, 'DeedTypeId', TITLE_TYPE_IDS);
  const shareDetails = filterByIds(allDeedDetails, 'DeedTypeId', SHARE_TYPE_IDS);
  const limitedDetails = filterByIds(allDeedDetails, 'DeedTypeId', LIMITED_RIGHTS_TYPE_IDS);
  const mortgageDetails = filterByIds(allDeedDetails, 'DeedTypeId', MORTGAGE_TYPE_IDS);
  const seizureDetails = filterByIds(allDeedDetails, 'DeedTypeId', SEIZURE_TYPE_IDS);
  // Include any other deed-detail types under limited/other for support visibility
  const knownTypeIds = new Set([
    ...TITLE_TYPE_IDS,
    ...SHARE_TYPE_IDS,
    ...LIMITED_RIGHTS_TYPE_IDS,
    ...MORTGAGE_TYPE_IDS,
    ...SEIZURE_TYPE_IDS,
  ]);
  const otherDetails = allDeedDetails.filter((row) => {
    const typeId = getFieldNumber(row, 'DeedTypeId');
    return typeId != null && !knownTypeIds.has(typeId);
  });
  pushFrame(
    frames,
    buildFrame(
      'deed_details_other_types',
      'Other deed detail types',
      'DeedDetail',
      'Id',
      otherDetails,
      { section: 'andere_details_all', sectionLabel: 'Andere details - Other types' },
    ),
  );

  pushFrame(
    frames,
    buildFrame(
      'deed_details_titles',
      'C Titels / Ownership deed details',
      'DeedDetail',
      'Id',
      titleDetails,
      ANDERE.titles,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_share',
      'Share title deed details',
      'DeedDetail',
      'Id',
      shareDetails,
      ANDERE.share,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_limited_rights',
      'Limited rights deed details',
      'DeedDetail',
      'Id',
      limitedDetails,
      ANDERE.limited,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_mortgages',
      'Hypotheek deed details',
      'DeedDetail',
      'Id',
      mortgageDetails,
      ANDERE.mortgages,
    ),
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_details_seizures',
      'Beslag deed details',
      'DeedDetail',
      'Id',
      seizureDetails,
      ANDERE.seizures,
    ),
  );

  const deedIds = asNumberIds(allDeedDetails, 'DeedID');
  const subjectIds = asNumberIds(allDeedDetails, 'SubjectId');
  const legalFactTypeIds = asNumberIds(allDeedDetails, 'DeedTypeId');
  const deedProcedureIds = asNumberIds(allDeedDetails, 'deedProcedureId');
  const transactionRoleIds = asNumberIds(allDeedDetails, 'TransactionRoleId');

  const deeds = await queryByIds(systemKey, 'Deed', 'id', deedIds);
  pushFrame(
    frames,
    buildFrame('deeds', 'Deeds', 'Deed', 'id', deeds, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Deeds',
    }),
  );

  const subjects = await queryByIds(systemKey, 'Subject', 'SubjectID', subjectIds);
  pushFrame(
    frames,
    buildFrame('subjects', 'Subjects', 'Subject', 'SubjectID', subjects, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Subjects',
    }),
  );

  const legalFactTypes = await queryByIds(systemKey, 'DeedType', 'Id', legalFactTypeIds);
  pushFrame(
    frames,
    buildFrame('legal_fact_types', 'Legal fact types (DeedType)', 'DeedType', 'Id', legalFactTypes, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Legal fact types',
    }),
  );

  const deedProcedures = await queryByIds(systemKey, 'DeedProcedure', 'Id', deedProcedureIds);
  pushFrame(
    frames,
    buildFrame('deed_procedures', 'Deed procedures', 'DeedProcedure', 'Id', deedProcedures, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Procedures',
    }),
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
      { section: 'andere_details_all', sectionLabel: 'Andere details - Roles' },
    ),
  );

  const notaryIds = asNumberIds(deeds, 'NotaryId');
  const notaries = await queryByIds(systemKey, 'Notaris', 'NotariaID', notaryIds);
  pushFrame(
    frames,
    buildFrame('notaries', 'Notaries', 'Notaris', 'NotariaID', notaries, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Notaries',
    }),
  );

  const legalFactIds = asNumberIds(deeds, 'MethodOfAcquisition');
  const legalFacts = await queryByIds(systemKey, 'LegalFact', 'id', legalFactIds);
  pushFrame(
    frames,
    buildFrame('legal_facts', 'Legal facts', 'LegalFact', 'id', legalFacts, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Legal facts',
    }),
  );

  const registerIds = asNumberIds(deeds, 'DeedTypeId');
  const legalFactRegisters = await queryByIds(systemKey, 'LegalFactRegister', 'id', registerIds);
  pushFrame(
    frames,
    buildFrame(
      'legal_fact_registers',
      'Legal fact registers',
      'LegalFactRegister',
      'id',
      legalFactRegisters,
      { section: 'andere_details_all', sectionLabel: 'Andere details - Registers' },
    ),
  );

  const deedDetailSubjects = await querySafe(
    systemKey,
    'SELECT * FROM DeedDetailSubjects WHERE ParcelId = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_detail_subjects',
      'Deed detail subjects',
      'DeedDetailSubjects',
      'Id',
      deedDetailSubjects,
      { section: 'andere_details_all', sectionLabel: 'Andere details - Deed detail subjects' },
    ),
  );

  const annotations = await querySafe(
    systemKey,
    'SELECT * FROM DeedDetailAantekeningPerceel WHERE plotid = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'deed_detail_annotations',
      'Deed detail annotations (notes)',
      'DeedDetailAantekeningPerceel',
      'id',
      annotations,
      ANDERE.limited,
    ),
  );

  const shareGroups = await querySafe(
    systemKey,
    `SELECT * FROM MandeligGroep
     WHERE parcel = @parcelId OR mandelig_parcel = @parcelId`,
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('share_groups', 'Share groups (MandeligGroep)', 'MandeligGroep', 'id', shareGroups, ANDERE.share),
  );

  // Legacy Hypotheek / Beslag tables (also shown in Andere details context)
  const mortgagesLegacy = await querySafe(
    systemKey,
    'SELECT * FROM Hypotheken WHERE HypothekenPerceelID = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('mortgages_legacy', 'Hypotheken (legacy)', 'Hypotheken', 'HypotheekID', mortgagesLegacy, ANDERE.mortgages),
  );

  const seizuresLegacy = await querySafe(
    systemKey,
    'SELECT * FROM Beslagen WHERE Perceelnummer = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('seizures_legacy', 'Beslagen (legacy)', 'Beslagen', 'BeslagID', seizuresLegacy, ANDERE.seizures),
  );

  const parcelGroups = await querySafe(
    systemKey,
    'SELECT * FROM PerceelGroep WHERE PerceelGroepPerceelID = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('parcel_groups', 'Parcel groups (PerceelGroep)', 'PerceelGroep', 'PerceelGroepID', parcelGroups, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Parcel groups',
    }),
  );

  const registers = await querySafe(
    systemKey,
    'SELECT * FROM Register WHERE RegisterPerceelNummer = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame('registers', 'Register', 'Register', 'RegisterID', registers, {
      section: 'andere_details_all',
      sectionLabel: 'Andere details - Register',
    }),
  );

  // Linked orders (same path as order support, reverse direction)
  const orderParcels = await querySafe(
    systemKey,
    'SELECT * FROM AgendaParcelGroup WHERE Parcel = @parcelId',
    { parcelId },
  );
  pushFrame(
    frames,
    buildFrame(
      'order_parcels',
      'Order parcel links',
      'AgendaParcelGroup',
      'Id',
      orderParcels,
      ANDERE.orders,
    ),
  );

  const orderProductIds = asNumberIds(orderParcels, 'ParcelGroup');
  const orderProducts = await queryByIds(systemKey, 'Agenda_Opdracht', 'AgendaO_ID', orderProductIds);
  pushFrame(
    frames,
    buildFrame('order_products', 'Order products', 'Agenda_Opdracht', 'AgendaO_ID', orderProducts, ANDERE.orders),
  );

  const orderIds = asNumberIds(orderProducts, 'AgendaO_IDGroup');
  const orders = await queryByIds(systemKey, 'Agenda', 'Agenda_ID', orderIds);
  pushFrame(
    frames,
    buildFrame('orders', 'Orders (Agenda)', 'Agenda', 'Agenda_ID', orders, ANDERE.orders),
  );

  const productCountByOrder = new Map<number, number>();
  for (const row of orderProducts) {
    const oid = getFieldNumber(row, 'AgendaO_IDGroup');
    if (oid == null) continue;
    productCountByOrder.set(oid, (productCountByOrder.get(oid) ?? 0) + 1);
  }

  const orderById = new Map<number, Record<string, unknown>>();
  for (const order of orders) {
    const id = getFieldNumber(order, 'Agenda_ID');
    if (id != null) orderById.set(id, order);
  }

  const linkedOrders = orderIds
    .map((orderId) => {
      const order = orderById.get(orderId);
      return {
        order_id: orderId,
        transaction_id: null as string | null,
        notary_code: order ? getFieldString(order, 'Agenda_NotaryCode') : null,
        requester: order ? getFieldString(order, 'Agenda_Requester') : null,
        register_date: order
          ? order.Agenda_RegisterDate instanceof Date
            ? order.Agenda_RegisterDate.toISOString()
            : getFieldString(order, 'Agenda_RegisterDate')
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
    meet_brief: meetBrief,
    found: true,
    candidates: candidates.length > 1 ? candidates : undefined,
    summary: {
      meet_brief: meetBrief,
      description: getFieldString(parcel, 'PerceelOmschrijving', 'description'),
      location: getFieldString(parcel, 'PerceelPlaatselijke'),
      sheet: getFieldString(parcel, 'PerceelBlad'),
      size: getFieldString(parcel, 'PerceelOppervlakteHA'),
      property_type: getFieldString(parcel, 'PerceelSoortEigendom'),
      status: getFieldString(parcel, 'PerceelStatus'),
      title_details: titleDetails.length,
      mortgage_details: mortgageDetails.length,
      seizure_details: seizureDetails.length,
      limited_rights_details: limitedDetails.length,
      share_details: shareDetails.length,
      order_links: orderParcels.length,
      linked_orders: linkedOrders,
    },
    frames,
  };
}
