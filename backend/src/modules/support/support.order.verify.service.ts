import { NotFoundError, ValidationError } from '../../utils/AppError';
import { querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';
import { mapDeedTitlesById } from './support.deedTitle';

export interface VerifyOrderDeedLine {
  order_deed_id: number | null;
  order_product_id: number | null;
  deed_id: number | null;
  title: string | null;
  amount: number | null;
  price: number | null;
  /** Approximate unit price: price / amount when amount > 0. */
  unit_price: number | null;
  product_code: string | null;
  product_name: string | null;
}

export interface VerifyOrderPriceCheck {
  check_key: 'order_deed_price_vs_order_total';
  ok: boolean;
  order_total_price: number | null;
  order_deed_price_sum: number;
  difference: number | null;
  tolerance: number;
  line_count: number;
  lines: VerifyOrderDeedLine[];
  message: string;
}

export interface VerifyOrderResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  checks: VerifyOrderPriceCheck[];
  all_ok: boolean;
}

const MONEY_TOLERANCE = 0.01;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function asMoney(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  return num;
}

export async function verifyOrder(input: {
  orderId: number;
  systemKey?: string;
}): Promise<VerifyOrderResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);
  const dialect = await resolveSystemDialect(systemKey);

  if (!isTerenoDialect(dialect)) {
    throw new ValidationError(
      'Verify Order is currently available for DLV / Tereno system connections only.',
    );
  }

  if (!Number.isInteger(input.orderId) || input.orderId <= 0) {
    throw new ValidationError('Valid order id is required');
  }

  const orders = await querySystem(
    systemKey,
    `SELECT TOP 1 id, totalPrice
     FROM [Order]
     WHERE id = @orderId`,
    { orderId: input.orderId },
  );

  if (orders.length === 0) {
    throw new NotFoundError(`Order ${input.orderId} not found in ${system.system_name}`);
  }

  const orderTotalPrice = asMoney(orders[0].totalPrice ?? orders[0].TotalPrice);

  const deedRows = await querySystem(
    systemKey,
    `SELECT od.id AS orderDeedId,
            od.orderProductId AS orderProductId,
            od.deedId AS deedId,
            od.amount AS amount,
            od.price AS price,
            p.code AS productCode,
            p.nameNl AS productNameNl,
            p.nameEn AS productNameEn
     FROM OrderDeed od
     INNER JOIN OrderProduct op ON op.id = od.orderProductId
     LEFT JOIN Product p ON p.id = op.productId
     WHERE op.orderId = @orderId
     ORDER BY od.id`,
    { orderId: input.orderId },
  );

  const deedIds = deedRows
    .map((row) => getFieldNumber(row, 'deedId'))
    .filter((id): id is number => id != null && id > 0);
  const titlesByDeedId = await mapDeedTitlesById(systemKey, dialect, deedIds);

  const lines: VerifyOrderDeedLine[] = deedRows.map((row) => {
    const amount = asMoney(row.amount ?? row.Amount);
    const price = asMoney(row.price ?? row.Price);
    const unitPrice =
      price != null && amount != null && amount !== 0 ? roundMoney(price / amount) : null;
    const deedId = getFieldNumber(row, 'deedId');

    return {
      order_deed_id: getFieldNumber(row, 'orderDeedId', 'id'),
      order_product_id: getFieldNumber(row, 'orderProductId'),
      deed_id: deedId,
      title: deedId != null ? titlesByDeedId.get(deedId) ?? null : null,
      amount,
      price,
      unit_price: unitPrice,
      product_code: getFieldString(row, 'productCode', 'code'),
      product_name:
        getFieldString(row, 'productNameNl', 'nameNl') ??
        getFieldString(row, 'productNameEn', 'nameEn'),
    };
  });

  const orderDeedPriceSum = roundMoney(
    lines.reduce((sum, line) => sum + (line.price ?? 0), 0),
  );

  const difference =
    orderTotalPrice == null ? null : roundMoney(orderDeedPriceSum - orderTotalPrice);

  const ok =
    orderTotalPrice != null &&
    difference != null &&
    Math.abs(difference) <= MONEY_TOLERANCE;

  const check: VerifyOrderPriceCheck = {
    check_key: 'order_deed_price_vs_order_total',
    ok,
    order_total_price: orderTotalPrice,
    order_deed_price_sum: orderDeedPriceSum,
    difference,
    tolerance: MONEY_TOLERANCE,
    line_count: lines.length,
    lines,
    message: ok
      ? `SUM(OrderDeed.price) matches Order.totalPrice (${orderTotalPrice}).`
      : orderTotalPrice == null
        ? 'Order.totalPrice is null; cannot compare.'
        : lines.length === 0
          ? `No OrderDeed rows for order ${input.orderId}; sum=0 vs totalPrice=${orderTotalPrice}.`
          : `Mismatch: SUM(OrderDeed.price)=${orderDeedPriceSum} vs Order.totalPrice=${orderTotalPrice} (diff=${difference}).`,
  };

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    order_id: input.orderId,
    checks: [check],
    all_ok: check.ok,
  };
}
