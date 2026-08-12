import { NotFoundError, ValidationError } from '../../utils/AppError';
import { querySystem } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  asNumberIds,
  buildFrame,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  queryByIds,
  querySafe,
  resolveSupportSystem,
} from './support.frames';
import { attachDeedTitleColumn, mapDeedTitlesById } from './support.deedTitle';
import type { OrderCandidate, OrderSupportLookup, TableFrame } from './support.types';
import { lookupOrderByIdTereno } from './support.order.tereno.service';

function asStringIds(rows: Record<string, unknown>[], column: string): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[column])
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  ];
}

function mapOrderCandidates(
  orders: Record<string, unknown>[],
  extras?: { register_title?: string | null },
): OrderCandidate[] {
  return orders.map((order) => ({
    order_id: getFieldNumber(order, 'Agenda_ID') ?? 0,
    kenmerk: getFieldString(order, 'Agenda_NotaryCode'),
    requester: getFieldString(order, 'Agenda_Requester'),
    request_type: getFieldString(order, 'Agenda_RequesterType'),
    register_date:
      order.Agenda_RegistrationDate instanceof Date
        ? order.Agenda_RegistrationDate.toISOString()
        : getFieldString(order, 'Agenda_RegistrationDate'),
    register_title: extras?.register_title ?? null,
  }));
}

/** Parses values like "B 156-3", "B-156-3", "B 156 - 3". */
export function parseRegisterTitle(
  input: string,
): { register: string; segment: number; number: number } | null {
  const cleaned = input.trim().replace(/\s+/g, ' ');
  const match = cleaned.match(/^([A-Za-z]+)\s*[-]?\s*(\d+)\s*[-]\s*(\d+)$/);
  if (!match) return null;
  return {
    register: match[1].toUpperCase(),
    segment: Number(match[2]),
    number: Number(match[3]),
  };
}

export async function lookupOrderById(
  orderId: number,
  systemKeyInput?: string,
  options?: {
    entry?: OrderSupportLookup['entry'];
    kenmerk?: string | null;
    register_title?: string | null;
  },
): Promise<OrderSupportLookup> {
  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);

  if (isTerenoDialect(system.dialect)) {
    return lookupOrderByIdTereno(orderId, systemKey, options);
  }

  const orders = await querySafe(
    systemKey,
    'SELECT * FROM Agenda WHERE Agenda_ID = @orderId',
    { orderId },
  );

  if (orders.length === 0) {
    throw new NotFoundError(`Order ${orderId} not found in ${system.system_name}`);
  }

  const order = orders[0];
  const frames: TableFrame[] = [];

  frames.push(buildFrame('order', 'Order (Agenda)', 'Agenda', 'Agenda_ID', orders));

  const statusId = order.Agenda_Status != null ? Number(order.Agenda_Status) : null;
  if (statusId) {
    const statuses = await queryByIds(systemKey, 'Agenda_OStatus', 'AgendaOS_ID', [statusId]);
    frames.push(buildFrame('order_status', 'Order status', 'Agenda_OStatus', 'AgendaOS_ID', statuses));
  }

  const applicantId = order.Agenda_Requester2 != null ? Number(order.Agenda_Requester2) : null;
  if (applicantId) {
    const applicants = await queryByIds(systemKey, 'AaanvraagEmployee', 'AaanvraagE_ID', [applicantId]);
    frames.push(
      buildFrame('applicant', 'Applicant', 'AaanvraagEmployee', 'AaanvraagE_ID', applicants),
    );
  }

  const requesterId = order.Agenda_RequesterId != null ? Number(order.Agenda_RequesterId) : null;
  const requestType = String(order.Agenda_RequesterType ?? '');
  if (requesterId) {
    const normalizedType = requestType.toLowerCase();
    if (['notary', 'notaris'].includes(normalizedType)) {
      const notaries = await queryByIds(systemKey, 'Notaris', 'NotariaID', [requesterId]);
      frames.push(buildFrame('notary', 'Notary', 'Notaris', 'NotariaID', notaries));
    } else if (['debtor', 'debiteuren', 'debiteur'].includes(normalizedType)) {
      const debtors = await queryByIds(systemKey, 'Debtor', 'Debtor_id', [requesterId]);
      frames.push(buildFrame('debtor', 'Debtor', 'Debtor', 'Debtor_id', debtors));
    }
  }

  const deliveryMethodId =
    order.Agenda_MethodID != null ? Number(order.Agenda_MethodID) : null;
  if (deliveryMethodId) {
    const methods = await queryByIds(systemKey, 'Agenda_Method', 'AgendaM_ID', [deliveryMethodId]);
    frames.push(
      buildFrame('delivery_method', 'Delivery method', 'Agenda_Method', 'AgendaM_ID', methods),
    );
  }

  const orderProducts = await querySafe(
    systemKey,
    'SELECT * FROM Agenda_Opdracht WHERE AgendaO_IDGroup = @orderId ORDER BY AgendaO_ID',
    { orderId },
  );
  frames.push(
    buildFrame('order_products', 'Order products', 'Agenda_Opdracht', 'AgendaO_ID', orderProducts),
  );

  const orderProductIds = asNumberIds(orderProducts, 'AgendaO_ID');
  const productTypeKeys = asStringIds(orderProducts, 'AgendaO_TypeKey');
  const productStatusIds = asNumberIds(orderProducts, 'AgendaO_Status');

  if (productTypeKeys.length > 0) {
    const products = await queryByIds(systemKey, 'Product_Type', 'typeKey', productTypeKeys);
    frames.push(buildFrame('products', 'Products', 'Product_Type', 'typeKey', products));
  }

  if (productStatusIds.length > 0) {
    const productStatuses = await queryByIds(systemKey, 'Agenda_OStatus', 'AgendaOS_ID', productStatusIds);
    frames.push(
      buildFrame(
        'product_statuses',
        'Product statuses',
        'Agenda_OStatus',
        'AgendaOS_ID',
        productStatuses,
      ),
    );
  }

  const orderParcels = await queryByIds(systemKey, 'AgendaParcelGroup', 'ParcelGroup', orderProductIds);
  frames.push(
    buildFrame('order_parcels', 'Order parcels (links)', 'AgendaParcelGroup', 'Id', orderParcels),
  );

  const parcelIds = asNumberIds(orderParcels, 'Parcel');
  let linkedParcels: NonNullable<OrderSupportLookup['summary']>['linked_parcels'] = [];
  if (parcelIds.length > 0) {
    const parcels = await queryByIds(systemKey, 'PerceelTb', 'PerceelNummer', parcelIds);
    frames.push(buildFrame('parcels', 'Parcels (PerceelTb)', 'PerceelTb', 'PerceelNummer', parcels));
    linkedParcels = parcels
      .map((parcel) => ({
        parcel_id: getFieldNumber(parcel, 'PerceelNummer') ?? 0,
        meet_brief: getFieldString(parcel, 'MeetbriefInf', 'Meetbriefinf'),
        description: getFieldString(parcel, 'PerceelOmschrijving', 'description'),
        location: getFieldString(parcel, 'PerceelPlaatselijke'),
        status: getFieldString(parcel, 'PerceelStatus'),
      }))
      .filter((item) => item.parcel_id > 0)
      .sort((a, b) => a.parcel_id - b.parcel_id);
  }

  const orderSubjects = await queryByIds(systemKey, 'OrderSubject', 'orderProductId', orderProductIds);
  frames.push(
    buildFrame('order_subjects', 'Order subjects (links)', 'OrderSubject', 'id', orderSubjects),
  );

  const subjectIds = asNumberIds(orderSubjects, 'subjectId');
  if (subjectIds.length > 0) {
    const subjects = await queryByIds(systemKey, 'Subject', 'SubjectID', subjectIds);
    frames.push(buildFrame('subjects', 'Subjects', 'Subject', 'SubjectID', subjects));
  }

  const orderDeeds = await queryByIds(systemKey, 'AgendaAkteGroup', 'AgendaO_ID', orderProductIds);
  const deedIds = [
    ...new Set([
      ...asNumberIds(orderDeeds, 'deedId'),
      ...asNumberIds(orderDeeds, 'DeedId'),
    ]),
  ];
  const dialect = system.dialect;
  const deedTitles = await mapDeedTitlesById(systemKey, dialect, deedIds);
  frames.push(
    buildFrame(
      'order_deeds',
      'Order deeds (links)',
      'AgendaAkteGroup',
      'ID',
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
    buildFrame(
      'workflow_step_facts',
      'Workflow step facts',
      'WorkflowStepFact',
      'id',
      workflowFacts,
    ),
  );

  const workflowStepIds = asNumberIds(workflowFacts, 'stepId');
  if (workflowStepIds.length > 0) {
    const workflowSteps = await queryByIds(systemKey, 'WorkflowStep', 'id', workflowStepIds);
    frames.push(
      buildFrame('workflow_steps', 'Workflow steps', 'WorkflowStep', 'id', workflowSteps),
    );
  }

  const workOrderJobs = await queryByIds(systemKey, 'WorkOrderJob', 'orderProductId', orderProductIds);
  frames.push(
    buildFrame('work_order_jobs', 'Work order jobs', 'WorkOrderJob', 'id', workOrderJobs),
  );

  const workOrderIds = asNumberIds(workOrderJobs, 'workOrderId');
  if (workOrderIds.length > 0) {
    const workOrders = await queryByIds(systemKey, 'WorkOrder', 'id', workOrderIds);
    frames.push(buildFrame('work_orders', 'Work orders', 'WorkOrder', 'id', workOrders));
  }

  const documents = await querySafe(systemKey, 'SELECT * FROM OrderDocument WHERE orderId = @orderId', {
    orderId,
  });
  frames.push(buildFrame('order_documents', 'Order documents', 'OrderDocument', 'id', documents));

  const payments = await querySafe(systemKey, 'SELECT * FROM OrderPayment WHERE orderId = @orderId', {
    orderId,
  });
  frames.push(buildFrame('order_payments', 'Order payments', 'OrderPayment', 'id', payments));

  const invoiceIds = asNumberIds(payments, 'invoiceId');
  if (invoiceIds.length > 0) {
    const invoices = await queryByIds(systemKey, 'OrderInvoice', 'id', invoiceIds);
    frames.push(buildFrame('order_invoices', 'Order invoices', 'OrderInvoice', 'id', invoices));
  }

  const statusName =
    frames.find((frame) => frame.key === 'order_status')?.rows[0]?.AgendaOS_Descr ?? null;

  const kenmerk =
    options?.kenmerk ??
    (order.Agenda_NotaryCode != null ? String(order.Agenda_NotaryCode) : null);

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
      transaction_id: order.transactionId != null ? String(order.transactionId) : null,
      request_type: order.Agenda_RequesterType != null ? String(order.Agenda_RequesterType) : null,
      requester: order.Agenda_Requester != null ? String(order.Agenda_Requester) : null,
      register_date:
        order.Agenda_RegistrationDate instanceof Date
          ? order.Agenda_RegistrationDate.toISOString()
          : order.Agenda_RegistrationDate != null
            ? String(order.Agenda_RegistrationDate)
            : null,
      status: statusName != null ? String(statusName) : null,
      product_count: orderProducts.length,
      parcel_count: linkedParcels.length,
      kenmerk,
      register_title: options?.register_title ?? null,
      linked_parcels: linkedParcels,
    },
    frames: frames.filter((frame) => frame.rowCount > 0 || frame.key === 'order'),
  };
}

export async function lookupOrderByKenmerk(
  kenmerkInput: string,
  systemKeyInput?: string,
): Promise<OrderSupportLookup> {
  const kenmerk = kenmerkInput.trim();
  if (!kenmerk) {
    throw new ValidationError('Kenmerk/dossiernummer is required');
  }

  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);

  let orders = await querySafe(
    systemKey,
    'SELECT * FROM Agenda WHERE Agenda_NotaryCode = @kenmerk ORDER BY Agenda_ID DESC',
    { kenmerk },
  );

  if (orders.length === 0) {
    orders = await querySafe(
      systemKey,
      'SELECT * FROM Agenda WHERE Agenda_NotaryCode LIKE @kenmerkLike ORDER BY Agenda_ID DESC',
      { kenmerkLike: `%${kenmerk}%` },
    );
  }

  if (orders.length === 0) {
    throw new NotFoundError(
      `No order found for kenmerk/dossiernummer "${kenmerk}" in ${system.system_name}`,
    );
  }

  if (orders.length > 1) {
    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      entry: 'kenmerk',
      order_id: 0,
      kenmerk,
      found: true,
      candidates: mapOrderCandidates(orders),
      summary: null,
      frames: [
        buildFrame(
          'order_candidates',
          'Matching orders — select a Bestelnummer to continue',
          'Agenda',
          'Agenda_ID',
          orders,
        ),
      ],
    };
  }

  const orderId = getFieldNumber(orders[0], 'Agenda_ID');
  if (!orderId) {
    throw new NotFoundError(`Order id missing for kenmerk "${kenmerk}"`);
  }

  return lookupOrderById(orderId, systemKey, { entry: 'kenmerk', kenmerk });
}

export async function lookupOrderByRegisterTitle(
  registerTitleInput: string,
  systemKeyInput?: string,
): Promise<OrderSupportLookup> {
  const registerTitle = registerTitleInput.trim();
  const parsed = parseRegisterTitle(registerTitle);
  if (!parsed) {
    throw new ValidationError(
      'Invalid Register-Deel-Nummer. Use format like "B 156-3" or "B-156-3"',
    );
  }

  const systemKey = systemKeyInput?.trim() || DEFAULT_SYSTEM_KEY;
  const system = await resolveSupportSystem(systemKey);

  const registerFk = isTerenoDialect(system.dialect)
    ? 'legalFactRegisterId'
    : 'DeedTypeId';

  const deeds = await querySystem(
    systemKey,
    `SELECT d.*
     FROM Deed d
     INNER JOIN LegalFactRegister lfr ON lfr.id = d.${registerFk}
     WHERE UPPER(LTRIM(RTRIM(lfr.register))) = @registerCode
       AND d.[segment] = @deedSegment
       AND d.[number] = @deedNumber`,
    {
      registerCode: parsed.register,
      deedSegment: parsed.segment,
      deedNumber: parsed.number,
    },
  );

  if (deeds.length === 0) {
    throw new NotFoundError(
      `Deed "${registerTitle}" not found in ${system.system_name}`,
    );
  }

  const deedIds = asNumberIds(deeds, 'id');
  const orderDeeds = await queryByIds(systemKey, 'AgendaAkteGroup', 'deedId', deedIds);

  if (orderDeeds.length === 0) {
    // Still return deed frames even if not linked to an order yet
    const frames: TableFrame[] = [
      buildFrame('deeds', 'Deeds', 'Deed', 'id', deeds),
    ];
    const registerIds = isTerenoDialect(system.dialect)
      ? asNumberIds(deeds, 'legalFactRegisterId')
      : asNumberIds(deeds, 'DeedTypeId');
    const registers = await queryByIds(systemKey, 'LegalFactRegister', 'id', registerIds);
    frames.push(
      buildFrame('legal_fact_registers', 'Legal fact registers', 'LegalFactRegister', 'id', registers),
    );

    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      entry: 'register_deed',
      order_id: 0,
      register_title: registerTitle,
      found: true,
      summary: {
        transaction_id: null,
        request_type: null,
        requester: null,
        register_date: null,
        status: null,
        product_count: 0,
        parcel_count: 0,
        register_title: registerTitle,
      },
      frames,
    };
  }

  const orderProductIds = asNumberIds(orderDeeds, 'AgendaO_ID');
  const orderProducts = await queryByIds(systemKey, 'Agenda_Opdracht', 'AgendaO_ID', orderProductIds);
  const orderIds = asNumberIds(orderProducts, 'AgendaO_IDGroup');
  const orders = await queryByIds(systemKey, 'Agenda', 'Agenda_ID', orderIds);

  if (orders.length === 0) {
    throw new NotFoundError(
      `No order linked to deed "${registerTitle}" in ${system.system_name}`,
    );
  }

  if (orders.length > 1) {
    return {
      system_key: system.system_key,
      system_name: system.system_name,
      dialect: system.dialect,
      is_production: system.is_production,
      entry: 'register_deed',
      order_id: 0,
      register_title: registerTitle,
      found: true,
      candidates: mapOrderCandidates(orders, { register_title: registerTitle }),
      summary: null,
      frames: [
        buildFrame('deeds', 'Deeds', 'Deed', 'id', deeds),
        buildFrame('order_deeds', 'Order deeds (links)', 'AgendaAkteGroup', 'ID', orderDeeds),
        buildFrame(
          'order_candidates',
          'Matching orders — select a Bestelnummer to continue',
          'Agenda',
          'Agenda_ID',
          orders,
        ),
      ],
    };
  }

  const orderId = getFieldNumber(orders[0], 'Agenda_ID');
  if (!orderId) {
    throw new NotFoundError(`Order id missing for deed "${registerTitle}"`);
  }

  const result = await lookupOrderById(orderId, systemKey, {
    entry: 'register_deed',
    register_title: registerTitle,
  });

  // Ensure the matched deed frame is present at the top
  const hasDeedFrame = result.frames.some((frame) => frame.key === 'deeds');
  if (!hasDeedFrame) {
    result.frames.unshift(buildFrame('deeds', 'Deeds', 'Deed', 'id', deeds));
  }

  return result;
}
