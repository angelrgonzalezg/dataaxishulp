import { NotFoundError, ValidationError } from '../../utils/AppError';
import { executeSystemProcedure, querySystem, serializeRow } from '../../utils/externalDb';
import {
  DEFAULT_SYSTEM_KEY,
  getFieldNumber,
  getFieldString,
  isTerenoDialect,
  resolveSupportSystem,
  resolveSystemDialect,
} from './support.frames';

const SP_NAME = 'usp_SetOrderProducts_ToVerwerkenInzages';

export interface ReopenBestellingChange {
  action_type: string | null;
  order_id: number | null;
  order_product_id: number | null;
  product_id: string | null;
  product_number: number | null;
  product_code: string | null;
  product_name: string | null;
  from_status_id: number | null;
  from_status: string | null;
  to_status_id: number | null;
  to_status: string | null;
  detail: string | null;
  raw: Record<string, unknown>;
}

export interface ReopenBestellingResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  return_value: number | null;
  change_count: number;
  changes: ReopenBestellingChange[];
  rows: Record<string, unknown>[];
}

async function requireTerenoSystem(systemKey: string): Promise<void> {
  const dialect = await resolveSystemDialect(systemKey);
  if (!isTerenoDialect(dialect)) {
    throw new ValidationError(
      'Reopen Bestelling is only available for DLV / Tereno system connections.',
    );
  }
}

async function loadStatusNameMap(systemKey: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const queries = [
    'SELECT id, name FROM OrderStatus',
    'SELECT id, name FROM OrderProductStatus',
    'SELECT id, nameNl AS name FROM OrderStatus',
    'SELECT id, nameNl AS name FROM OrderProductStatus',
  ];

  for (const sql of queries) {
    try {
      const rows = await querySystem(systemKey, sql);
      for (const row of rows) {
        const id = getFieldNumber(row, 'id', 'Id');
        const name = getFieldString(row, 'name', 'Name', 'nameNl', 'NameNl');
        if (id != null && name && !map.has(id)) {
          map.set(id, name);
        }
      }
    } catch {
      // Table/column naming differs across environments; keep trying.
    }
  }

  return map;
}

function resolveStatusName(
  statusMap: Map<number, string>,
  id: number | null,
  explicitName: string | null,
): string | null {
  if (explicitName) return explicitName;
  if (id == null) return null;
  return statusMap.get(id) ?? null;
}

function mapChange(
  row: Record<string, unknown>,
  statusMap: Map<number, string>,
): ReopenBestellingChange {
  const actionType = getFieldString(row, 'ActionType', 'actionType');
  const fromStatusId = getFieldNumber(
    row,
    'CurrentOrderProductStatusId',
    'currentOrderProductStatusId',
    'CurrentOrderStatusId',
    'currentOrderStatusId',
    'fromStatusId',
    'FromStatusId',
    'oldStatusId',
    'OldStatusId',
    'statusId',
    'StatusId',
  );
  const toStatusId = getFieldNumber(
    row,
    'NewOrderProductStatusId',
    'newOrderProductStatusId',
    'NewOrderStatusId',
    'newOrderStatusId',
    'toStatusId',
    'ToStatusId',
    'newStatusId',
    'NewStatusId',
    'targetStatusId',
    'TargetStatusId',
  );

  const orderProductId = getFieldNumber(
    row,
    'OrderProductId',
    'orderProductId',
    'orderProduct_id',
  );
  const workflowStepId = getFieldNumber(row, 'NewStepId', 'newStepId', 'SourceWorkflowStepFactId');

  let detail: string | null = null;
  if (actionType?.toLowerCase().includes('workflow')) {
    const sourceFact = getFieldNumber(row, 'SourceWorkflowStepFactId');
    const newStep = getFieldNumber(row, 'NewStepId');
    detail = [
      sourceFact != null ? `sourceFact=${sourceFact}` : null,
      newStep != null ? `newStep=${newStep}` : null,
      getFieldString(row, 'NewProcessedBy') != null
        ? `processedBy=${getFieldString(row, 'NewProcessedBy')}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return {
    action_type: actionType,
    order_id: getFieldNumber(row, 'OrderId', 'orderId'),
    order_product_id: orderProductId,
    product_id: getFieldString(row, 'productId', 'ProductId'),
    product_number: getFieldNumber(
      row,
      'orderProductNumber',
      'OrderProductNumber',
      'productNumber',
      'ProductNumber',
    ),
    product_code: getFieldString(row, 'code', 'Code', 'productCode', 'ProductCode'),
    product_name: getFieldString(
      row,
      'nameNl',
      'NameNl',
      'nameEn',
      'NameEn',
      'productName',
      'ProductName',
    ),
    from_status_id: fromStatusId,
    from_status: resolveStatusName(
      statusMap,
      fromStatusId,
      getFieldString(row, 'fromStatus', 'FromStatus', 'oldStatus', 'OldStatus', 'currentStatus'),
    ),
    to_status_id: toStatusId,
    to_status: resolveStatusName(
      statusMap,
      toStatusId,
      getFieldString(row, 'toStatus', 'ToStatus', 'newStatus', 'NewStatus', 'targetStatus'),
    ),
    detail:
      detail ??
      (orderProductId == null && workflowStepId == null && actionType
        ? actionType.replace(/^PREVIEW\s*-\s*/i, '')
        : null),
    raw: serializeRow(row),
  };
}

export async function reopenBestelling(input: {
  orderId: number;
  systemKey?: string;
  previewOnly: boolean;
  confirm?: boolean;
}): Promise<ReopenBestellingResult> {
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
  await requireTerenoSystem(systemKey);
  const system = await resolveSupportSystem(systemKey);

  if (!Number.isInteger(input.orderId) || input.orderId <= 0) {
    throw new ValidationError('Invalid orderId');
  }

  if (!input.previewOnly && !input.confirm) {
    throw new ValidationError(
      'Confirmation required. Set confirm=true to apply Reopen Bestelling.',
    );
  }

  const orders = await querySystem(
    systemKey,
    'SELECT id FROM [Order] WHERE id = @orderId',
    { orderId: input.orderId },
  );
  if (orders.length === 0) {
    throw new NotFoundError(`Order ${input.orderId} not found in ${system.system_name}`);
  }

  let rows: Record<string, unknown>[] = [];
  let returnValue: number | null = null;
  try {
    const result = await executeSystemProcedure(systemKey, SP_NAME, {
      OrderId: input.orderId,
      PreviewOnly: input.previewOnly ? 1 : 0,
    });
    // The SP returns multiple preview sets (Order, OrderProduct, WorkflowStepFact, …).
    rows = result.recordsets.flatMap((set) => set).filter((row) => Object.keys(row).length > 0);
    if (rows.length === 0) {
      rows = result.rows;
    }
    returnValue = result.returnValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/could not find stored procedure/i.test(message)) {
      throw new ValidationError(
        `Stored procedure ${SP_NAME} was not found in ${system.system_name}. Deploy it on this Tereno database first.`,
      );
    }
    throw error;
  }

  const statusMap = await loadStatusNameMap(systemKey);
  const changes = rows.map((row) => mapChange(row, statusMap));

  return {
    system_key: system.system_key,
    system_name: system.system_name,
    dialect: system.dialect,
    is_production: system.is_production,
    order_id: input.orderId,
    preview_only: input.previewOnly,
    return_value: returnValue,
    change_count: changes.length,
    changes,
    rows: rows.map(serializeRow),
  };
}
