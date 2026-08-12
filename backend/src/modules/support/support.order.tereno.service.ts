import { NotFoundError } from '../../utils/AppError';
import {
  asNumberIds,
  buildFrame,
  getFieldNumber,
  getFieldString,
  queryByIds,
  querySafe,
  resolveSupportSystem,
} from './support.frames';
import { attachDeedTitleColumn, mapDeedTitlesById } from './support.deedTitle';
import type { OrderSupportLookup, TableFrame } from './support.types';

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

/** Adds Product.code / Product.nameNl / Product.nameEn next to OrderProduct.productId. */
export async function enrichOrderProductsWithCatalog(
  systemKey: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;

  const productIds = [
    ...new Set(
      rows
        .map((row) => getFieldString(row, 'productId'))
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const products =
    productIds.length > 0
      ? await queryByIds(systemKey, 'Product', 'id', productIds)
      : [];

  const byId = new Map<string, { code: string | null; nameNl: string | null; nameEn: string | null }>();
  for (const product of products) {
    const id = getFieldString(product, 'id');
    if (!id) continue;
    byId.set(id, {
      code: getFieldString(product, 'code'),
      nameNl: getFieldString(product, 'nameNl'),
      nameEn: getFieldString(product, 'nameEn'),
    });
  }

  return rows.map((row) => {
    const productId = getFieldString(row, 'productId');
    const catalog = productId ? byId.get(productId) : undefined;
    return insertAfter(row, ['productId'], [
      ['code', catalog?.code ?? null],
      ['nameNl', catalog?.nameNl ?? null],
      ['nameEn', catalog?.nameEn ?? null],
    ]);
  });
}

export async function lookupOrderByIdTereno(
  orderId: number,
  systemKey: string,
  options?: {
    entry?: OrderSupportLookup['entry'];
    kenmerk?: string | null;
    register_title?: string | null;
  },
): Promise<OrderSupportLookup> {
  const system = await resolveSupportSystem(systemKey);

  const orders = await querySafe(systemKey, 'SELECT * FROM [Order] WHERE id = @orderId', {
    orderId,
  });

  if (orders.length === 0) {
    throw new NotFoundError(`Order ${orderId} not found in ${system.system_name}`);
  }

  const order = orders[0];
  const frames: TableFrame[] = [];

  frames.push(buildFrame('order', 'Order', 'Order', 'id', orders));

  const statusId = getFieldNumber(order, 'statusId');
  if (statusId) {
    const statuses = await queryByIds(systemKey, 'OrderStatus', 'id', [statusId]);
    frames.push(buildFrame('order_status', 'Order status', 'OrderStatus', 'id', statuses));
  }

  const applicantId = getFieldNumber(order, 'applicantId');
  if (applicantId) {
    const applicants = await queryByIds(systemKey, 'Applicant', 'id', [applicantId]);
    frames.push(buildFrame('applicant', 'Applicant', 'Applicant', 'id', applicants));
  }

  const requesterId = getFieldNumber(order, 'requesterId');
  const requestType = (getFieldString(order, 'requestType') ?? '').toLowerCase();
  if (requesterId) {
    if (['notary', 'notaris'].includes(requestType)) {
      const notaries = await queryByIds(systemKey, 'Notary', 'id', [requesterId]);
      frames.push(buildFrame('notary', 'Notary', 'Notary', 'id', notaries));
    } else if (['debtor', 'debiteuren', 'debiteur'].includes(requestType)) {
      const debtors = await queryByIds(systemKey, 'Debtor', 'id', [requesterId]);
      frames.push(buildFrame('debtor', 'Debtor', 'Debtor', 'id', debtors));
    } else if (['client', 'klant'].includes(requestType)) {
      const clients = await queryByIds(systemKey, 'Client', 'id', [requesterId]);
      frames.push(buildFrame('client', 'Client', 'Client', 'id', clients));
    }
  }

  const deliveryMethodId = getFieldNumber(order, 'deliveryMethodId');
  if (deliveryMethodId) {
    const methods = await queryByIds(systemKey, 'DeliveryMethod', 'id', [deliveryMethodId]);
    frames.push(buildFrame('delivery_method', 'Delivery method', 'DeliveryMethod', 'id', methods));
  }

  const orderProductsRaw = await querySafe(
    systemKey,
    `SELECT op.*,
            p.code AS code,
            p.nameNl AS nameNl,
            p.nameEn AS nameEn
     FROM OrderProduct op
     LEFT JOIN Product p ON p.id = op.productId
     WHERE op.orderId = @orderId
     ORDER BY op.orderProductNumber, op.id`,
    { orderId },
  );
  // Ensure catalog columns exist even if the join aliases were overwritten by SELECT *.
  const orderProducts = await enrichOrderProductsWithCatalog(systemKey, orderProductsRaw);
  frames.push(
    buildFrame('order_products', 'Order products', 'OrderProduct', 'id', orderProducts),
  );

  const orderProductIds = asNumberIds(orderProducts, 'id');

  const orderParcels = await queryByIds(systemKey, 'OrderParcel', 'orderProductId', orderProductIds);
  frames.push(
    buildFrame('order_parcels', 'Order parcels (OrderParcel)', 'OrderParcel', 'id', orderParcels),
  );

  const parcelIds = asNumberIds(orderParcels, 'parcelId');
  let linkedParcels: NonNullable<OrderSupportLookup['summary']>['linked_parcels'] = [];
  if (parcelIds.length > 0) {
    const parcels = await queryByIds(systemKey, 'Parcel', 'id', parcelIds);
    frames.push(buildFrame('parcels', 'Parcels', 'Parcel', 'id', parcels));
    linkedParcels = parcels
      .map((parcel) => ({
        parcel_id: getFieldNumber(parcel, 'id') ?? 0,
        meet_brief: getFieldString(parcel, 'esri'),
        description: getFieldString(parcel, 'description'),
        location: getFieldString(parcel, 'location'),
        status: getFieldString(parcel, 'status'),
      }))
      .filter((item) => item.parcel_id > 0)
      .sort((a, b) => a.parcel_id - b.parcel_id);
  }

  const orderSubjects = await queryByIds(systemKey, 'OrderSubject', 'orderProductId', orderProductIds);
  frames.push(
    buildFrame('order_subjects', 'Order subjects', 'OrderSubject', 'id', orderSubjects),
  );

  const subjectIds = asNumberIds(orderSubjects, 'subjectId');
  if (subjectIds.length > 0) {
    const subjects = await queryByIds(systemKey, 'Subject', 'id', subjectIds);
    frames.push(buildFrame('subjects', 'Subjects', 'Subject', 'id', subjects));
  }

  const orderDeeds = await queryByIds(systemKey, 'OrderDeed', 'orderProductId', orderProductIds);
  const deedIds = asNumberIds(orderDeeds, 'deedId');
  const deedTitles = await mapDeedTitlesById(systemKey, system.dialect, deedIds);
  frames.push(
    buildFrame(
      'order_deeds',
      'Order deeds',
      'OrderDeed',
      'id',
      attachDeedTitleColumn(orderDeeds, deedTitles, ['deedId', 'DeedId']),
    ),
  );

  if (deedIds.length > 0) {
    const deeds = await queryByIds(systemKey, 'Deed', 'id', deedIds);
    frames.push(
      buildFrame(
        'deeds',
        'Deeds',
        'Deed',
        'id',
        attachDeedTitleColumn(deeds, deedTitles, ['id', 'Id']),
      ),
    );
  }

  const workflowFacts = await queryByIds(systemKey, 'WorkflowStepFact', 'orderProductId', orderProductIds);
  frames.push(
    buildFrame('workflow_step_facts', 'Workflow step facts', 'WorkflowStepFact', 'id', workflowFacts),
  );

  const workOrderJobs = await queryByIds(systemKey, 'WorkOrderJob', 'orderProductId', orderProductIds);
  frames.push(buildFrame('work_order_jobs', 'Work order jobs', 'WorkOrderJob', 'id', workOrderJobs));

  const documents = await querySafe(
    systemKey,
    'SELECT * FROM OrderDocument WHERE orderId = @orderId',
    { orderId },
  );
  frames.push(buildFrame('order_documents', 'Order documents', 'OrderDocument', 'id', documents));

  const payments = await querySafe(
    systemKey,
    'SELECT * FROM OrderPayment WHERE orderId = @orderId',
    { orderId },
  );
  frames.push(buildFrame('order_payments', 'Order payments', 'OrderPayment', 'id', payments));

  const statusName =
    (frames.find((frame) => frame.key === 'order_status')?.rows[0] &&
      getFieldString(frames.find((frame) => frame.key === 'order_status')!.rows[0], 'name', 'Name')) ??
    null;

  const kenmerk =
    options?.kenmerk ?? getFieldString(order, 'notaryCode') ?? getFieldString(order, 'transactionId');

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    entry: options?.entry ?? 'order',
    order_id: orderId,
    kenmerk,
    register_title: options?.register_title ?? null,
    found: true,
    summary: {
      transaction_id: getFieldString(order, 'transactionId'),
      request_type: getFieldString(order, 'requestType'),
      requester: getFieldString(order, 'requester'),
      register_date:
        order.registerDate instanceof Date
          ? order.registerDate.toISOString()
          : getFieldString(order, 'registerDate'),
      status: statusName,
      product_count: orderProducts.length,
      parcel_count: linkedParcels.length,
      kenmerk,
      register_title: options?.register_title ?? null,
      linked_parcels: linkedParcels,
    },
    frames,
  };
}
