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
import { parseRegisterTitle } from './support.service';
import type { SystemDialect } from './systemDialect';

export interface OrderDeedLink {
  link_id: number;
  order_product_id: number;
  deed_id: number | null;
  register_title: string | null;
  akte: string | null;
  raw: Record<string, unknown>;
}

export interface OrderDeedLinksResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  links: OrderDeedLink[];
}

export interface DeedTitleCandidate {
  deed_id: number;
  register_title: string;
}

export interface DeedTitleSearchResult {
  register_title: string;
  candidates: DeedTitleCandidate[];
}

export interface ChangeOrderDeedResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  link_id: number;
  order_product_id: number;
  from_deed_id: number | null;
  from_register_title: string | null;
  from_akte: string | null;
  to_deed_id: number;
  to_register_title: string;
  to_akte: string;
  raw: Record<string, unknown>;
}

function dialectCols(dialect: SystemDialect) {
  const tereno = isTerenoDialect(dialect);
  return {
    tereno,
    productTable: tereno ? 'OrderProduct' : 'Agenda_Opdracht',
    productPk: tereno ? 'id' : 'AgendaO_ID',
    productOrderFk: tereno ? 'orderId' : 'AgendaO_IDGroup',
    linkTable: tereno ? 'OrderDeed' : 'AgendaAkteGroup',
    linkPk: tereno ? 'id' : 'ID',
    linkProductFk: tereno ? 'orderProductId' : 'AgendaO_ID',
    linkDeedFk: tereno ? 'deedId' : 'DeedId',
    linkAkteCol: tereno ? null as string | null : 'Akte',
    registerFk: tereno ? 'legalFactRegisterId' : 'DeedTypeId',
  };
}

function formatTitle(register: string, segment: number, number: number): string {
  return `${register} ${segment}-${number}`;
}

async function loadDeedTitle(
  systemKey: string,
  dialect: SystemDialect,
  deedId: number | null,
): Promise<string | null> {
  if (deedId == null || deedId <= 0) return null;
  const cols = dialectCols(dialect);
  const rows = await querySafe(
    systemKey,
    `SELECT d.id, d.[segment], d.[number], lfr.register
     FROM Deed d
     LEFT JOIN LegalFactRegister lfr ON lfr.id = d.${cols.registerFk}
     WHERE d.id = @deedId`,
    { deedId },
  );
  if (rows.length === 0) return null;
  const register = getFieldString(rows[0], 'register');
  const segment = getFieldNumber(rows[0], 'segment', 'Segment');
  const number = getFieldNumber(rows[0], 'number', 'Number');
  if (!register || segment == null || number == null) return null;
  return formatTitle(register, segment, number);
}

export async function resolveDeedByTitle(
  systemKey: string,
  dialect: SystemDialect,
  registerTitle: string,
): Promise<DeedTitleSearchResult> {
  const parsed = parseRegisterTitle(registerTitle);
  if (!parsed) {
    throw new ValidationError(
      'Invalid Register-Deel-Nummer. Use format like "C 200-18" or "C-200-18".',
    );
  }

  const cols = dialectCols(dialect);
  const deeds = await querySystem(
    systemKey,
    `SELECT d.id, d.[segment], d.[number], lfr.register
     FROM Deed d
     INNER JOIN LegalFactRegister lfr ON lfr.id = d.${cols.registerFk}
     WHERE UPPER(LTRIM(RTRIM(lfr.register))) = @registerCode
       AND d.[segment] = @deedSegment
       AND d.[number] = @deedNumber
     ORDER BY d.id`,
    {
      registerCode: parsed.register,
      deedSegment: parsed.segment,
      deedNumber: parsed.number,
    },
  );

  if (deeds.length === 0) {
    throw new NotFoundError(`Deed "${registerTitle}" not found`);
  }

  const title = formatTitle(parsed.register, parsed.segment, parsed.number);
  const candidates = deeds
    .map((deed) => {
      const deedId = getFieldNumber(deed, 'id', 'Id');
      if (deedId == null) return null;
      return {
        deed_id: deedId,
        register_title: title,
      };
    })
    .filter((item): item is DeedTitleCandidate => item != null);

  if (candidates.length === 0) {
    throw new NotFoundError(`Deed "${registerTitle}" not found`);
  }

  return { register_title: title, candidates };
}

export async function listOrderDeedLinks(input: {
  systemKey?: string;
  orderId: number;
}): Promise<OrderDeedLinksResult> {
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

  const links: OrderDeedLink[] = [];
  for (const row of linksRaw) {
    const linkId = getFieldNumber(row, cols.linkPk, 'id', 'Id', 'ID') ?? 0;
    const orderProductId =
      getFieldNumber(row, cols.linkProductFk, 'orderProductId', 'AgendaO_ID') ?? 0;
    const deedId = getFieldNumber(row, cols.linkDeedFk, 'deedId', 'DeedId', 'DeedID');
    const akte = getFieldString(row, 'Akte', 'akte', 'title', 'deedTitle');
    const registerTitle = (await loadDeedTitle(systemKey, dialect, deedId)) ?? akte;

    links.push({
      link_id: linkId,
      order_product_id: orderProductId,
      deed_id: deedId,
      register_title: registerTitle,
      akte,
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

export async function changeOrderDeed(input: {
  systemKey?: string;
  orderId: number;
  linkId: number;
  newRegisterTitle?: string;
  newDeedId?: number;
  previewOnly: boolean;
  confirm?: boolean;
  updatedBy?: string;
}): Promise<ChangeOrderDeedResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectCols(dialect);

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to change the deed on this order.',
    );
  }

  const current = await listOrderDeedLinks({
    systemKey,
    orderId: input.orderId,
  });
  const link = current.links.find((item) => item.link_id === input.linkId);
  if (!link) {
    throw new NotFoundError(
      `Deed link ${input.linkId} not found on order ${input.orderId}`,
    );
  }

  let toDeedId = input.newDeedId ?? null;
  let toTitle: string | null = null;

  if (toDeedId != null && toDeedId > 0) {
    toTitle = await loadDeedTitle(systemKey, dialect, toDeedId);
    if (!toTitle) {
      throw new NotFoundError(`Deed id ${toDeedId} not found`);
    }
  } else if (input.newRegisterTitle?.trim()) {
    const resolved = await resolveDeedByTitle(
      systemKey,
      dialect,
      input.newRegisterTitle,
    );
    if (resolved.candidates.length > 1) {
      throw new ValidationError(
        `Multiple deeds match "${resolved.register_title}". Provide newDeedId explicitly.`,
      );
    }
    toDeedId = resolved.candidates[0].deed_id;
    toTitle = resolved.register_title;
  } else {
    throw new ValidationError('Provide newRegisterTitle or newDeedId');
  }

  if (toDeedId == null || toDeedId <= 0 || !toTitle) {
    throw new ValidationError('Could not resolve the replacement deed');
  }

  if (link.deed_id === toDeedId) {
    throw new ValidationError('Replacement deed is already set on this link');
  }

  const resultBase: ChangeOrderDeedResult = {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    order_id: input.orderId,
    preview_only: input.previewOnly,
    link_id: link.link_id,
    order_product_id: link.order_product_id,
    from_deed_id: link.deed_id,
    from_register_title: link.register_title,
    from_akte: link.akte,
    to_deed_id: toDeedId,
    to_register_title: toTitle,
    to_akte: toTitle,
    raw: link.raw,
  };

  if (input.previewOnly) {
    return resultBase;
  }

  const updatedBy = (input.updatedBy ?? 'dataaxis-hulp').trim().slice(0, 250);

  if (cols.linkAkteCol) {
    // Kadaster: update DeedId + Akte together for consistency.
    try {
      await executeSystem(
        systemKey,
        `UPDATE ${cols.linkTable}
         SET ${cols.linkDeedFk} = @newDeedId,
             ${cols.linkAkteCol} = @akte,
             updatedAt = SYSUTCDATETIME(),
             updatedBy = @updatedBy
         WHERE ${cols.linkPk} = @linkId`,
        {
          newDeedId: toDeedId,
          akte: toTitle,
          updatedBy,
          linkId: link.link_id,
        },
      );
    } catch {
      await executeSystem(
        systemKey,
        `UPDATE ${cols.linkTable}
         SET ${cols.linkDeedFk} = @newDeedId,
             ${cols.linkAkteCol} = @akte
         WHERE ${cols.linkPk} = @linkId`,
        {
          newDeedId: toDeedId,
          akte: toTitle,
          linkId: link.link_id,
        },
      );
    }
  } else {
    // Tereno: OrderDeed typically only has deedId.
    try {
      await executeSystem(
        systemKey,
        `UPDATE ${cols.linkTable}
         SET ${cols.linkDeedFk} = @newDeedId,
             updatedAt = SYSUTCDATETIME(),
             updatedBy = @updatedBy
         WHERE ${cols.linkPk} = @linkId`,
        {
          newDeedId: toDeedId,
          updatedBy,
          linkId: link.link_id,
        },
      );
    } catch {
      await executeSystem(
        systemKey,
        `UPDATE ${cols.linkTable}
         SET ${cols.linkDeedFk} = @newDeedId
         WHERE ${cols.linkPk} = @linkId`,
        {
          newDeedId: toDeedId,
          linkId: link.link_id,
        },
      );
    }
  }

  return {
    ...resultBase,
    preview_only: false,
  };
}
