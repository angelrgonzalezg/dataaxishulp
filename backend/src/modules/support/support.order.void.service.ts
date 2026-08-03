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

export const VOID_STATUS_ID = 11;

export interface VoidOrderProductChange {
  order_product_id: number;
  product_code: string | null;
  product_name: string | null;
  from_status_id: number | null;
  from_status: string | null;
  to_status_id: number;
  to_status: string | null;
  raw: Record<string, unknown>;
}

export interface VoidOrderRegistryRisk {
  table: string;
  count: number;
  detail: string;
}

export interface VoidOrderResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  void_status_id: number;
  order_from_status_id: number | null;
  order_from_status: string | null;
  order_to_status_id: number;
  order_to_status: string | null;
  product_change_count: number;
  product_changes: VoidOrderProductChange[];
  is_safe: boolean;
  risks: VoidOrderRegistryRisk[];
  warnings: string[];
  already_voided: boolean;
}

function dialectProfile(dialect: SystemDialect) {
  const tereno = isTerenoDialect(dialect);
  return {
    tereno,
    orderTable: tereno ? '[Order]' : 'Agenda',
    orderPk: tereno ? 'id' : 'Agenda_ID',
    orderStatusCol: tereno ? 'statusId' : 'Agenda_Status',
    productTable: tereno ? 'OrderProduct' : 'Agenda_Opdracht',
    productPk: tereno ? 'id' : 'AgendaO_ID',
    productOrderFk: tereno ? 'orderId' : 'AgendaO_IDGroup',
    productStatusCol: tereno ? 'statusId' : 'AgendaO_Status',
    productCodeCol: tereno ? 'code' : null as string | null,
    statusTable: tereno ? 'OrderStatus' : 'Agenda_OStatus',
    statusPk: tereno ? 'id' : 'AgendaOS_ID',
    statusNameCol: tereno ? 'name' : 'AgendaOS_Descr',
    productStatusTable: tereno ? 'OrderProductStatus' : 'Agenda_OStatus',
    productStatusPk: tereno ? 'id' : 'AgendaOS_ID',
    productStatusNameCol: tereno ? 'name' : 'AgendaOS_Descr',
  };
}

async function loadStatusName(
  systemKey: string,
  table: string,
  pk: string,
  nameCol: string,
  statusId: number | null,
  extraNameCols: string[] = [],
): Promise<string | null> {
  if (statusId == null) return null;
  try {
    const rows = await querySystem(
      systemKey,
      `SELECT * FROM ${table} WHERE ${pk} = @statusId`,
      { statusId },
    );
    if (rows.length === 0) return null;
    return (
      getFieldString(rows[0], nameCol, ...extraNameCols, 'name', 'nameNl', 'Name', 'NameNl') ??
      null
    );
  } catch {
    return null;
  }
}

async function assessRegistryRisk(
  systemKey: string,
  dialect: SystemDialect,
  orderId: number,
  orderProductIds: number[],
): Promise<VoidOrderRegistryRisk[]> {
  const risks: VoidOrderRegistryRisk[] = [];
  const tereno = isTerenoDialect(dialect);

  if (orderProductIds.length === 0) {
    return risks;
  }

  const placeholders = orderProductIds.map((_, i) => `@p${i}`).join(', ');
  const params: Record<string, number> = {};
  orderProductIds.forEach((id, i) => {
    params[`p${i}`] = id;
  });

  if (tereno) {
    const orderDeeds = await querySafe(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM OrderDeed WHERE orderProductId IN (${placeholders})`,
      params,
    );
    const deedLinkCount = getFieldNumber(orderDeeds[0], 'cnt', 'Cnt') ?? 0;
    if (deedLinkCount > 0) {
      risks.push({
        table: 'OrderDeed / Deed',
        count: deedLinkCount,
        detail: `${deedLinkCount} deed link(s) via OrderDeed — voiding will not clean Deed / DeedDetail.`,
      });
    }

    const orderParcels = await querySafe(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM OrderParcel WHERE orderProductId IN (${placeholders})`,
      params,
    );
    const parcelLinkCount = getFieldNumber(orderParcels[0], 'cnt', 'Cnt') ?? 0;
    if (parcelLinkCount > 0) {
      risks.push({
        table: 'OrderParcel / Parcel',
        count: parcelLinkCount,
        detail: `${parcelLinkCount} parcel link(s) via OrderParcel — voiding will not clean Parcel records.`,
      });
    }

    const deedIdsRows = await querySafe(
      systemKey,
      `SELECT DISTINCT deedId FROM OrderDeed WHERE orderProductId IN (${placeholders}) AND deedId IS NOT NULL`,
      params,
    );
    const deedIds = deedIdsRows
      .map((row) => getFieldNumber(row, 'deedId', 'DeedId'))
      .filter((id): id is number => id != null && id > 0);

    if (deedIds.length > 0) {
      const deedPh = deedIds.map((_, i) => `@d${i}`).join(', ');
      const deedParams: Record<string, number> = {};
      deedIds.forEach((id, i) => {
        deedParams[`d${i}`] = id;
      });

      const detailCountRows = await querySafe(
        systemKey,
        `SELECT COUNT(*) AS cnt FROM DeedDetail WHERE deedId IN (${deedPh})`,
        deedParams,
      );
      const detailCount = getFieldNumber(detailCountRows[0], 'cnt', 'Cnt') ?? 0;
      if (detailCount > 0) {
        risks.push({
          table: 'DeedDetail',
          count: detailCount,
          detail: `${detailCount} DeedDetail row(s) on linked deeds — not cleaned by void.`,
        });
      }

      const annotationCountRows = await querySafe(
        systemKey,
        `SELECT COUNT(*) AS cnt FROM DeedDetailAnnotation
         WHERE deedDetailId IN (
           SELECT id FROM DeedDetail WHERE deedId IN (${deedPh})
         )`,
        deedParams,
      );
      const annotationCount = getFieldNumber(annotationCountRows[0], 'cnt', 'Cnt') ?? 0;
      if (annotationCount > 0) {
        risks.push({
          table: 'DeedDetailAnnotation',
          count: annotationCount,
          detail: `${annotationCount} DeedDetailAnnotation row(s) on linked deeds — not cleaned by void.`,
        });
      }
    }
  } else {
    const orderDeeds = await querySafe(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM AgendaAkteGroup WHERE AgendaO_ID IN (${placeholders})`,
      params,
    );
    const deedLinkCount = getFieldNumber(orderDeeds[0], 'cnt', 'Cnt') ?? 0;
    if (deedLinkCount > 0) {
      risks.push({
        table: 'AgendaAkteGroup / Deed',
        count: deedLinkCount,
        detail: `${deedLinkCount} deed link(s) via AgendaAkteGroup — voiding will not clean Deed / DeedDetail.`,
      });
    }

    const orderParcels = await querySafe(
      systemKey,
      `SELECT COUNT(*) AS cnt FROM AgendaParcelGroup WHERE ParcelGroup IN (${placeholders})`,
      params,
    );
    const parcelLinkCount = getFieldNumber(orderParcels[0], 'cnt', 'Cnt') ?? 0;
    if (parcelLinkCount > 0) {
      risks.push({
        table: 'AgendaParcelGroup / Perceel',
        count: parcelLinkCount,
        detail: `${parcelLinkCount} parcel link(s) via AgendaParcelGroup — voiding will not clean PerceelTb.`,
      });
    }

    const deedIdsRows = await querySafe(
      systemKey,
      `SELECT DISTINCT deedId FROM AgendaAkteGroup
       WHERE AgendaO_ID IN (${placeholders}) AND deedId IS NOT NULL`,
      params,
    );
    const deedIds = deedIdsRows
      .map((row) => getFieldNumber(row, 'deedId', 'DeedId', 'DeedID'))
      .filter((id): id is number => id != null && id > 0);

    if (deedIds.length > 0) {
      const deedPh = deedIds.map((_, i) => `@d${i}`).join(', ');
      const deedParams: Record<string, number> = {};
      deedIds.forEach((id, i) => {
        deedParams[`d${i}`] = id;
      });

      const detailCountRows = await querySafe(
        systemKey,
        `SELECT COUNT(*) AS cnt FROM DeedDetail WHERE DeedID IN (${deedPh})`,
        deedParams,
      );
      const detailCount = getFieldNumber(detailCountRows[0], 'cnt', 'Cnt') ?? 0;
      if (detailCount > 0) {
        risks.push({
          table: 'DeedDetail',
          count: detailCount,
          detail: `${detailCount} DeedDetail row(s) on linked deeds — not cleaned by void.`,
        });
      }

      const annotationCountRows = await querySafe(
        systemKey,
        `SELECT COUNT(*) AS cnt FROM DeedDetailAantekeningPerceel
         WHERE DeedDetailID IN (
           SELECT Id FROM DeedDetail WHERE DeedID IN (${deedPh})
         )`,
        deedParams,
      );
      const annotationCount = getFieldNumber(annotationCountRows[0], 'cnt', 'Cnt') ?? 0;
      if (annotationCount > 0) {
        risks.push({
          table: 'DeedDetailAantekeningPerceel',
          count: annotationCount,
          detail: `${annotationCount} DeedDetailAantekeningPerceel row(s) — not cleaned by void.`,
        });
      }
    }
  }

  return risks;
}

export async function voidOrder(input: {
  systemKey?: string;
  orderId: number;
  previewOnly: boolean;
  confirm?: boolean;
  acknowledgeRisk?: boolean;
  updatedBy?: string;
}): Promise<VoidOrderResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);
  const cols = dialectProfile(dialect);
  const orderId = input.orderId;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new ValidationError('Valid order id is required');
  }

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to void the order.',
    );
  }

  const orders = await querySystem(
    systemKey,
    `SELECT * FROM ${cols.orderTable} WHERE ${cols.orderPk} = @orderId`,
    { orderId },
  );
  if (orders.length === 0) {
    throw new NotFoundError(`Order ${orderId} not found in ${system.system_name}`);
  }

  const order = orders[0];
  const orderFromStatusId = getFieldNumber(
    order,
    cols.orderStatusCol,
    'statusId',
    'Agenda_Status',
  );
  const orderFromStatus = await loadStatusName(
    systemKey,
    cols.statusTable,
    cols.statusPk,
    cols.statusNameCol,
    orderFromStatusId,
    ['nameNl'],
  );
  const orderToStatus = await loadStatusName(
    systemKey,
    cols.statusTable,
    cols.statusPk,
    cols.statusNameCol,
    VOID_STATUS_ID,
    ['nameNl'],
  );

  let products: Record<string, unknown>[] = [];
  if (cols.tereno) {
    products = await querySystem(
      systemKey,
      `SELECT op.*,
              p.code AS productCode,
              p.nameNl AS productNameNl,
              p.nameEn AS productNameEn
       FROM OrderProduct op
       LEFT JOIN Product p ON p.id = op.productId
       WHERE op.orderId = @orderId
       ORDER BY op.orderProductNumber, op.id`,
      { orderId },
    );
  } else {
    products = await querySystem(
      systemKey,
      `SELECT * FROM Agenda_Opdracht
       WHERE AgendaO_IDGroup = @orderId
       ORDER BY AgendaO_ID`,
      { orderId },
    );
  }

  const productIds = products
    .map((row) => getFieldNumber(row, cols.productPk, 'id', 'Id', 'AgendaO_ID'))
    .filter((id): id is number => id != null && id > 0);

  const risks = await assessRegistryRisk(systemKey, dialect, orderId, productIds);
  const isSafe = risks.length === 0;
  const warnings: string[] = [];

  if (!isSafe) {
    warnings.push(
      'This order appears linked to land-registry records (Deed / DeedDetail / Parcel / annotations). Voiding only sets status 11 and does NOT clean those tables. Only continue if you are sure this is appropriate.',
    );
  }

  const alreadyVoided =
    orderFromStatusId === VOID_STATUS_ID &&
    products.every((row) => {
      const status = getFieldNumber(row, cols.productStatusCol, 'statusId', 'AgendaO_Status');
      return status === VOID_STATUS_ID;
    });

  if (alreadyVoided) {
    warnings.push('Order and all products already have status 11 (Voided).');
  }

  const productChanges: VoidOrderProductChange[] = [];
  for (const row of products) {
    const productId = getFieldNumber(row, cols.productPk, 'id', 'Id', 'AgendaO_ID') ?? 0;
    const fromStatusId = getFieldNumber(
      row,
      cols.productStatusCol,
      'statusId',
      'AgendaO_Status',
    );
    const fromStatus = await loadStatusName(
      systemKey,
      cols.productStatusTable,
      cols.productStatusPk,
      cols.productStatusNameCol,
      fromStatusId,
      ['nameNl'],
    );

    productChanges.push({
      order_product_id: productId,
      product_code:
        getFieldString(
          row,
          'productCode',
          'code',
          'AgendaO_TypeKey',
          'productId',
        ) ?? null,
      product_name:
        getFieldString(
          row,
          'productNameNl',
          'nameNl',
          'productNameEn',
          'nameEn',
          'Descr',
        ) ?? null,
      from_status_id: fromStatusId,
      from_status: fromStatus,
      to_status_id: VOID_STATUS_ID,
      to_status: orderToStatus,
      raw: serializeRow(row),
    });
  }

  if (input.previewOnly) {
    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      order_id: orderId,
      preview_only: true,
      void_status_id: VOID_STATUS_ID,
      order_from_status_id: orderFromStatusId,
      order_from_status: orderFromStatus,
      order_to_status_id: VOID_STATUS_ID,
      order_to_status: orderToStatus,
      product_change_count: productChanges.length,
      product_changes: productChanges,
      is_safe: isSafe,
      risks,
      warnings,
      already_voided: alreadyVoided,
    };
  }

  if (!isSafe && !input.acknowledgeRisk) {
    throw new ValidationError(
      'Order has registry-related links. Set acknowledgeRisk=true to void anyway (status-only; registry data is not cleaned).',
    );
  }

  if (alreadyVoided) {
    throw new ValidationError('Order is already fully voided (status 11).');
  }

  const updatedBy = (input.updatedBy ?? 'dataaxis-hulp').trim().slice(0, 250);

  // Update order status.
  try {
    await executeSystem(
      systemKey,
      `UPDATE ${cols.orderTable}
       SET ${cols.orderStatusCol} = @voidStatus,
           updatedAt = SYSUTCDATETIME(),
           updatedBy = @updatedBy
       WHERE ${cols.orderPk} = @orderId`,
      { voidStatus: VOID_STATUS_ID, updatedBy, orderId },
    );
  } catch {
    await executeSystem(
      systemKey,
      `UPDATE ${cols.orderTable}
       SET ${cols.orderStatusCol} = @voidStatus
       WHERE ${cols.orderPk} = @orderId`,
      { voidStatus: VOID_STATUS_ID, orderId },
    );
  }

  // Update all related order products / tasks.
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, i) => `@upd${i}`).join(', ');
    const updateParams: Record<string, number | string> = {
      voidStatus: VOID_STATUS_ID,
      updatedBy,
    };
    productIds.forEach((id, i) => {
      updateParams[`upd${i}`] = id;
    });

    try {
      await executeSystem(
        systemKey,
        `UPDATE ${cols.productTable}
         SET ${cols.productStatusCol} = @voidStatus,
             updatedAt = SYSUTCDATETIME(),
             updatedBy = @updatedBy
         WHERE ${cols.productPk} IN (${placeholders})`,
        updateParams,
      );
    } catch {
      await executeSystem(
        systemKey,
        `UPDATE ${cols.productTable}
         SET ${cols.productStatusCol} = @voidStatus
         WHERE ${cols.productPk} IN (${placeholders})`,
        Object.fromEntries(
          Object.entries(updateParams).filter(([key]) => key !== 'updatedBy'),
        ),
      );
    }
  }

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    order_id: orderId,
    preview_only: false,
    void_status_id: VOID_STATUS_ID,
    order_from_status_id: orderFromStatusId,
    order_from_status: orderFromStatus,
    order_to_status_id: VOID_STATUS_ID,
    order_to_status: orderToStatus,
    product_change_count: productChanges.length,
    product_changes: productChanges,
    is_safe: isSafe,
    risks,
    warnings,
    already_voided: false,
  };
}
