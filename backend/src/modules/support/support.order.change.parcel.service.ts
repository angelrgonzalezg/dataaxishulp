import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystem, querySystem, serializeRow } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  querySafe,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import type { SystemDialect } from './systemDialect';

export interface OrderParcelLink {
  link_id: number;
  order_product_id: number;
  parcel_id: number | null;
  parcel_esri: string | null;
  parcel_location: string | null;
  parcel_status: string | null;
  raw: Record<string, unknown>;
}

export interface OrderParcelLinksResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  links: OrderParcelLink[];
}

export interface ChangeOrderParcelResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  link_id: number;
  order_product_id: number;
  from_parcel_id: number | null;
  from_parcel_esri: string | null;
  to_parcel_id: number;
  to_parcel_esri: string | null;
  raw: Record<string, unknown>;
}

function dialectCols(dialect: SystemDialect) {
  const tereno = isTerenoDialect(dialect);
  return {
    tereno,
    productTable: tereno ? 'OrderProduct' : 'Agenda_Opdracht',
    productPk: tereno ? 'id' : 'AgendaO_ID',
    productOrderFk: tereno ? 'orderId' : 'AgendaO_IDGroup',
    linkTable: tereno ? 'OrderParcel' : 'AgendaParcelGroup',
    linkPk: tereno ? 'id' : 'Id',
    linkProductFk: tereno ? 'orderProductId' : 'ParcelGroup',
    linkParcelFk: tereno ? 'parcelId' : 'Parcel',
    parcelTable: tereno ? 'Parcel' : 'PerceelTb',
    parcelPk: tereno ? 'id' : 'PerceelNummer',
  };
}

async function loadParcelInfo(
  systemKey: string,
  dialect: SystemDialect,
  parcelId: number | null,
): Promise<{
  parcel_id: number | null;
  parcel_esri: string | null;
  parcel_location: string | null;
  parcel_status: string | null;
}> {
  if (parcelId == null || parcelId <= 0) {
    return {
      parcel_id: null,
      parcel_esri: null,
      parcel_location: null,
      parcel_status: null,
    };
  }

  const cols = dialectCols(dialect);
  const rows = await querySafe(
    systemKey,
    `SELECT * FROM ${cols.parcelTable} WHERE ${cols.parcelPk} = @parcelId`,
    { parcelId },
  );
  if (rows.length === 0) {
    return {
      parcel_id: parcelId,
      parcel_esri: null,
      parcel_location: null,
      parcel_status: null,
    };
  }

  const parcel = rows[0];
  return {
    parcel_id: parcelId,
    parcel_esri: getFieldString(
      parcel,
      'esri',
      'MeetbriefInf',
      'Meetbriefinf',
      'PerceelESRI',
    ),
    parcel_location: getFieldString(
      parcel,
      'location',
      'PerceelPlaatselijke',
      'description',
      'PerceelOmschrijving',
    ),
    parcel_status: getFieldString(parcel, 'status', 'PerceelStatus'),
  };
}

export async function resolveParcelByEsri(
  systemKey: string,
  dialect: SystemDialect,
  parcelEsri: string,
): Promise<{ parcel_id: number; parcel_esri: string | null; candidates: Array<{
  parcel_id: number;
  parcel_esri: string | null;
  location: string | null;
  status: string | null;
}> }> {
  const esri = parcelEsri.trim();
  if (!esri) {
    throw new ValidationError('Parcel ESRI / meet brief is required');
  }

  const cols = dialectCols(dialect);
  let parcels: Record<string, unknown>[] = [];

  if (cols.tereno) {
    parcels = await querySystem(
      systemKey,
      `SELECT * FROM Parcel WHERE esri = @esri ORDER BY id`,
      { esri },
    );
    if (parcels.length === 0) {
      parcels = await querySystem(
        systemKey,
        `SELECT * FROM Parcel WHERE esri LIKE @esriLike ORDER BY id`,
        { esriLike: `%${esri}%` },
      );
    }
  } else {
    parcels = await querySystem(
      systemKey,
      `SELECT * FROM PerceelTb
       WHERE MeetbriefInf = @esri OR PerceelESRI = @esri
       ORDER BY PerceelNummer`,
      { esri },
    );
    if (parcels.length === 0) {
      parcels = await querySystem(
        systemKey,
        `SELECT * FROM PerceelTb
         WHERE MeetbriefInf LIKE @esriLike OR PerceelESRI LIKE @esriLike
         ORDER BY PerceelNummer`,
        { esriLike: `%${esri}%` },
      );
    }
  }

  if (parcels.length === 0) {
    throw new NotFoundError(`Parcel "${esri}" not found`);
  }

  const candidates = parcels.map((parcel) => {
    const parcelId =
      getFieldNumber(parcel, cols.parcelPk, 'id', 'Id', 'PerceelNummer') ?? 0;
    return {
      parcel_id: parcelId,
      parcel_esri: getFieldString(
        parcel,
        'esri',
        'MeetbriefInf',
        'Meetbriefinf',
        'PerceelESRI',
      ),
      location: getFieldString(
        parcel,
        'location',
        'PerceelPlaatselijke',
        'description',
        'PerceelOmschrijving',
      ),
      status: getFieldString(parcel, 'status', 'PerceelStatus'),
    };
  }).filter((item) => item.parcel_id > 0);

  if (candidates.length === 0) {
    throw new NotFoundError(`Parcel "${esri}" not found`);
  }

  return {
    parcel_id: candidates[0].parcel_id,
    parcel_esri: candidates[0].parcel_esri,
    candidates,
  };
}

export async function listOrderParcelLinks(input: {
  systemKey?: string;
  orderId: number;
}): Promise<OrderParcelLinksResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectCols(dialect);
  const orderId = input.orderId;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new ValidationError('Valid order id is required');
  }

  const products = await querySystem(
    systemKey,
    `SELECT * FROM ${cols.productTable} WHERE ${cols.productOrderFk} = @orderId`,
    { orderId },
  );
  if (products.length === 0) {
    // Still allow empty links if order exists but has no products.
    const orderTable = cols.tereno ? '[Order]' : 'Agenda';
    const orderPk = cols.tereno ? 'id' : 'Agenda_ID';
    const orders = await querySystem(
      systemKey,
      `SELECT * FROM ${orderTable} WHERE ${orderPk} = @orderId`,
      { orderId },
    );
    if (orders.length === 0) {
      throw new NotFoundError(`Order ${orderId} not found in ${system.system_name}`);
    }
  }

  const productIds = products
    .map((row) => getFieldNumber(row, cols.productPk, 'id', 'Id', 'AgendaO_ID'))
    .filter((id): id is number => id != null && id > 0);

  let linksRaw: Record<string, unknown>[] = [];
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, i) => `@p${i}`).join(', ');
    const params: Record<string, number> = {};
    productIds.forEach((id, i) => {
      params[`p${i}`] = id;
    });
    linksRaw = await querySystem(
      systemKey,
      `SELECT * FROM ${cols.linkTable}
       WHERE ${cols.linkProductFk} IN (${placeholders})
       ORDER BY ${cols.linkPk}`,
      params,
    );
  }

  const links: OrderParcelLink[] = [];
  for (const row of linksRaw) {
    const linkId = getFieldNumber(row, cols.linkPk, 'id', 'Id') ?? 0;
    const orderProductId =
      getFieldNumber(row, cols.linkProductFk, 'orderProductId', 'ParcelGroup') ?? 0;
    const parcelId = getFieldNumber(row, cols.linkParcelFk, 'parcelId', 'Parcel');
    const parcelInfo = await loadParcelInfo(systemKey, dialect, parcelId);
    links.push({
      link_id: linkId,
      order_product_id: orderProductId,
      parcel_id: parcelInfo.parcel_id,
      parcel_esri: parcelInfo.parcel_esri,
      parcel_location: parcelInfo.parcel_location,
      parcel_status: parcelInfo.parcel_status,
      raw: serializeRow(row),
    });
  }

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    order_id: orderId,
    links,
  };
}

export async function changeOrderParcel(input: {
  systemKey?: string;
  orderId: number;
  linkId: number;
  newParcelEsri?: string;
  newParcelId?: number;
  previewOnly: boolean;
  confirm?: boolean;
  updatedBy?: string;
}): Promise<ChangeOrderParcelResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectCols(dialect);

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to change the parcel on this order.',
    );
  }

  const current = await listOrderParcelLinks({
    systemKey,
    orderId: input.orderId,
  });
  const link = current.links.find((item) => item.link_id === input.linkId);
  if (!link) {
    throw new NotFoundError(
      `Parcel link ${input.linkId} not found on order ${input.orderId}`,
    );
  }

  let toParcelId = input.newParcelId ?? null;
  let toParcelEsri: string | null = null;

  if (toParcelId != null && toParcelId > 0) {
    const info = await loadParcelInfo(systemKey, dialect, toParcelId);
    if (info.parcel_id == null) {
      throw new NotFoundError(`Parcel id ${toParcelId} not found`);
    }
    toParcelEsri = info.parcel_esri;
  } else if (input.newParcelEsri?.trim()) {
    const resolved = await resolveParcelByEsri(systemKey, dialect, input.newParcelEsri);
    if (resolved.candidates.length > 1) {
      // Prefer exact ESRI match; otherwise require explicit parcel id.
      const exact = resolved.candidates.filter(
        (c) => (c.parcel_esri ?? '').toLowerCase() === input.newParcelEsri!.trim().toLowerCase(),
      );
      if (exact.length === 1) {
        toParcelId = exact[0].parcel_id;
        toParcelEsri = exact[0].parcel_esri;
      } else if (resolved.candidates.length === 1) {
        toParcelId = resolved.candidates[0].parcel_id;
        toParcelEsri = resolved.candidates[0].parcel_esri;
      } else {
        throw new ValidationError(
          `Multiple parcels match "${input.newParcelEsri.trim()}". Provide newParcelId explicitly.`,
        );
      }
    } else {
      toParcelId = resolved.parcel_id;
      toParcelEsri = resolved.parcel_esri;
    }
  } else {
    throw new ValidationError('Provide newParcelEsri or newParcelId');
  }

  if (toParcelId == null || toParcelId <= 0) {
    throw new ValidationError('Could not resolve the replacement parcel');
  }

  if (link.parcel_id === toParcelId) {
    throw new ValidationError('Replacement parcel is already set on this link');
  }

  const resultBase: ChangeOrderParcelResult = {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    order_id: input.orderId,
    preview_only: input.previewOnly,
    link_id: link.link_id,
    order_product_id: link.order_product_id,
    from_parcel_id: link.parcel_id,
    from_parcel_esri: link.parcel_esri,
    to_parcel_id: toParcelId,
    to_parcel_esri: toParcelEsri,
    raw: link.raw,
  };

  if (input.previewOnly) {
    return resultBase;
  }

  const updatedBy = (input.updatedBy ?? 'dataaxis-hulp').trim().slice(0, 250);
  try {
    await executeSystem(
      systemKey,
      `UPDATE ${cols.linkTable}
       SET ${cols.linkParcelFk} = @newParcelId,
           updatedAt = SYSUTCDATETIME(),
           updatedBy = @updatedBy
       WHERE ${cols.linkPk} = @linkId`,
      {
        newParcelId: toParcelId,
        updatedBy,
        linkId: link.link_id,
      },
    );
  } catch {
    await executeSystem(
      systemKey,
      `UPDATE ${cols.linkTable}
       SET ${cols.linkParcelFk} = @newParcelId
       WHERE ${cols.linkPk} = @linkId`,
      {
        newParcelId: toParcelId,
        linkId: link.link_id,
      },
    );
  }

  return {
    ...resultBase,
    preview_only: false,
  };
}
