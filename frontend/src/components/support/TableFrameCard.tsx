import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, ArrowUpDown, PencilLine, Table2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { extractErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useUpdateFrameRows } from '@/hooks/useSupport';
import type { FrameRowChange, TableFrame, UpdateFrameRowsResult } from '@/types';
import { cn } from '@/lib/cn';

type SortDirection = 'asc' | 'desc';

type SortState = {
  column: string;
  direction: SortDirection;
};

type TableFrameCardProps = {
  frame: TableFrame;
  systemKey: string;
  isProduction: boolean;
  systemName: string;
  /** When set, matching cells render as navigation links (e.g. deedId / title). */
  onNavigateCell?: (info: {
    frameKey: string;
    column: string;
    value: unknown;
    row: Record<string, unknown>;
  }) => void;
  isNavigableCell?: (info: {
    frameKey: string;
    column: string;
    value: unknown;
    row: Record<string, unknown>;
  }) => boolean;
};

function cellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeEmpty(value: unknown): unknown {
  if (value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const a = normalizeEmpty(left);
  const b = normalizeEmpty(right);
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (
      Number.isFinite(na) &&
      Number.isFinite(nb) &&
      String(a).trim() !== '' &&
      String(b).trim() !== ''
    ) {
      return na === nb;
    }
  }
  return String(a) === String(b);
}

function getPkValue(
  row: Record<string, unknown>,
  primaryKey: string,
): string | number | null {
  const key = Object.keys(row).find((k) => k.toLowerCase() === primaryKey.toLowerCase());
  if (!key) return null;
  const value = row[key];
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const asNumber = Number(value);
  if (
    Number.isFinite(asNumber) &&
    String(value).trim() !== '' &&
    /^-?\d+(\.\d+)?$/.test(String(value).trim())
  ) {
    return asNumber;
  }
  return String(value);
}

function buildChanges(
  primaryKey: string,
  originalRows: Record<string, unknown>[],
  draftRows: Record<string, unknown>[],
): FrameRowChange[] {
  if (originalRows.length !== draftRows.length) {
    throw new Error('Draft row count does not match the loaded frame.');
  }

  const changes: FrameRowChange[] = [];
  for (let index = 0; index < originalRows.length; index += 1) {
    const original = originalRows[index];
    const draft = draftRows[index];
    const pkValue = getPkValue(original, primaryKey);
    if (pkValue == null) {
      throw new Error(`Missing primary key (${primaryKey}) on row ${index + 1}.`);
    }
    const draftPk = getPkValue(draft, primaryKey);
    if (draftPk == null || String(draftPk) !== String(pkValue)) {
      throw new Error('Primary key values cannot be changed.');
    }

    const cells: FrameRowChange['cells'] = [];
    for (const column of Object.keys(draft)) {
      if (column.toLowerCase() === primaryKey.toLowerCase()) continue;
      const fromKey =
        Object.keys(original).find((k) => k.toLowerCase() === column.toLowerCase()) ?? column;
      const from = original[fromKey];
      const to = draft[column];
      if (!valuesEqual(from, to)) {
        cells.push({
          column,
          from: normalizeEmpty(from) ?? null,
          to: normalizeEmpty(to) ?? null,
        });
      }
    }

    if (cells.length > 0) {
      changes.push({ primary_key_value: pkValue, cells });
    }
  }

  return changes;
}

/** Deed / DeedDetail / Subject frames get clickable column sorting. */
function isSortableTable(tableName: string): boolean {
  const name = tableName.trim().toLowerCase();
  return name === 'deed' || name === 'deeddetail' || name === 'subject';
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  const bothNumeric =
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber) &&
    String(left).trim() !== '' &&
    String(right).trim() !== '' &&
    !Number.isNaN(leftNumber) &&
    !Number.isNaN(rightNumber) &&
    /^-?\d+(\.\d+)?$/.test(String(left).trim()) &&
    /^-?\d+(\.\d+)?$/.test(String(right).trim());

  if (bothNumeric) {
    return leftNumber - rightNumber;
  }

  const leftDate = left instanceof Date ? left : new Date(String(left));
  const rightDate = right instanceof Date ? right : new Date(String(right));
  if (
    !Number.isNaN(leftDate.getTime()) &&
    !Number.isNaN(rightDate.getTime()) &&
    /^\d{4}-\d{2}-\d{2}/.test(String(left)) &&
    /^\d{4}-\d{2}-\d{2}/.test(String(right))
  ) {
    return leftDate.getTime() - rightDate.getTime();
  }

  return cellValue(left).localeCompare(cellValue(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function TableFrameCard({
  frame,
  systemKey,
  isProduction,
  systemName,
  onNavigateCell,
  isNavigableCell,
}: TableFrameCardProps) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canEdit = can('support.edit');
  const updateMutation = useUpdateFrameRows();

  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, unknown>[]>(frame.rows);
  const [sort, setSort] = useState<SortState | null>(null);
  const [preview, setPreview] = useState<UpdateFrameRowsResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const columns = frame.columns;
  const sortable = isSortableTable(frame.tableName);

  useEffect(() => {
    if (!editing) {
      setDraftRows(frame.rows.map((row) => ({ ...row })));
      setPreview(null);
      setConfirmOpen(false);
    }
  }, [frame, editing]);

  const rows = useMemo(() => {
    const source = editing ? draftRows : frame.rows;
    if (!sortable || !sort || editing) return source;

    const sorted = [...source];
    sorted.sort((a, b) => {
      const result = compareValues(a[sort.column], b[sort.column]);
      return sort.direction === 'asc' ? result : -result;
    });
    return sorted;
  }, [editing, draftRows, frame.rows, sortable, sort]);

  const localChanges = useMemo(() => {
    if (!editing) return [] as FrameRowChange[];
    try {
      return buildChanges(frame.primaryKey, frame.rows, draftRows);
    } catch {
      return [];
    }
  }, [editing, frame.primaryKey, frame.rows, draftRows]);

  const localChangeCount = localChanges.reduce((sum, row) => sum + row.cells.length, 0);

  function startEdit() {
    if (!canEdit) {
      toast.error(t('support.editColumnsViewOnly'));
      return;
    }
    setDraftRows(frame.rows.map((row) => ({ ...row })));
    setPreview(null);
    setConfirmOpen(false);
    setEditing(true);
  }

  function cancelEdit() {
    setDraftRows(frame.rows.map((row) => ({ ...row })));
    setPreview(null);
    setConfirmOpen(false);
    setEditing(false);
  }

  function updateCell(rowIndex: number, column: string, value: string) {
    setDraftRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)),
    );
    setPreview(null);
  }

  function toggleSort(column: string) {
    if (!sortable || editing) return;
    setSort((current) => {
      if (!current || current.column !== column) {
        return { column, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return null;
    });
  }

  async function runPreview() {
    if (!canEdit) return;
    let changes: FrameRowChange[];
    try {
      changes = buildChanges(frame.primaryKey, frame.rows, draftRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('support.editColumnsNoChanges'));
      return;
    }
    if (changes.length === 0) {
      toast(t('support.editColumnsNoChanges'));
      return;
    }
    try {
      const result = await updateMutation.mutateAsync({
        systemKey,
        tableName: frame.tableName,
        primaryKey: frame.primaryKey,
        changes,
        previewOnly: true,
      });
      setPreview(result);
    } catch (error) {
      setPreview(null);
      toast.error(extractErrorMessage(error));
    }
  }

  async function applySave() {
    if (!canEdit || !preview) return;
    try {
      const result = await updateMutation.mutateAsync({
        systemKey,
        tableName: frame.tableName,
        primaryKey: frame.primaryKey,
        changes: preview.changes,
        previewOnly: false,
        confirm: true,
      });
      toast.success(
        t('support.editColumnsSuccess', {
          table: result.table_name,
          count: result.change_count,
        }),
      );
      setConfirmOpen(false);
      setPreview(null);
      setEditing(false);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  const busy = updateMutation.isPending;

  return (
    <Card>
      <CardHeader
        title={frame.label}
        description={`${frame.tableName} · ${frame.rowCount} ${t('support.rows')}`}
        icon={<Table2 style={{ width: 20, height: 20 }} />}
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-ink-600">
              PK: {frame.primaryKey}
            </span>
            {!editing ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={startEdit}
                disabled={!canEdit || frame.rowCount === 0}
                title={!canEdit ? t('support.editColumnsViewOnly') : undefined}
              >
                <PencilLine style={{ width: 14, height: 14 }} />
                {t('support.editColumns')}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={cancelEdit}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || localChangeCount === 0}
                  onClick={() => void runPreview()}
                >
                  {t('support.editColumnsPreview')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !preview || !preview.preview_only}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('common.save')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {frame.rowCount === 0 ? (
        <p className="p-6 text-sm text-ink-500">{t('common.noData')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                {columns.map((column) => {
                  const active = sort?.column === column.name;
                  const SortIcon =
                    active && sort?.direction === 'asc'
                      ? ArrowUp
                      : active && sort?.direction === 'desc'
                        ? ArrowDown
                        : ArrowUpDown;

                  return (
                    <th
                      key={column.name}
                      className={cn(
                        'whitespace-nowrap border-b border-ink-100 px-4 py-3',
                        column.isPrimaryKey && 'text-brand-700',
                        sortable && !editing && 'cursor-pointer select-none hover:text-ink-800',
                      )}
                    >
                      {sortable && !editing ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          title={t('support.sortBy')}
                          onClick={() => toggleSort(column.name)}
                        >
                          <span>{column.name}</span>
                          {column.isPrimaryKey && (
                            <span className="text-[10px] font-bold text-brand-500">PK</span>
                          )}
                          <SortIcon
                            style={{ width: 12, height: 12 }}
                            className={active ? 'text-brand-600' : 'text-ink-300'}
                          />
                        </button>
                      ) : (
                        <>
                          {column.name}
                          {column.isPrimaryKey && (
                            <span className="ml-1 text-[10px] font-bold text-brand-500">PK</span>
                          )}
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                  {columns.map((column) => (
                    <td key={column.name} className="px-4 py-2 align-top">
                      {editing && !column.isPrimaryKey ? (
                        <Input
                          value={cellValue(row[column.name])}
                          onChange={(event) =>
                            updateCell(rowIndex, column.name, event.target.value)
                          }
                          className="min-w-[10rem] font-mono text-xs"
                        />
                      ) : (() => {
                        const raw = row[column.name];
                        const text = cellValue(raw);
                        const navigable =
                          !editing &&
                          Boolean(text) &&
                          Boolean(onNavigateCell) &&
                          (isNavigableCell?.({
                            frameKey: frame.key,
                            column: column.name,
                            value: raw,
                            row,
                          }) ??
                            false);

                        if (navigable && onNavigateCell) {
                          return (
                            <button
                              type="button"
                              className={cn(
                                'block max-w-xs truncate text-left text-xs font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900',
                                /description|Description|Name|nameNl|nameNe|title|Title|Akte/.test(
                                  column.name,
                                )
                                  ? 'max-w-md font-sans'
                                  : 'font-mono',
                              )}
                              title={t('support.openLinkedDeedHint', { value: text })}
                              onClick={() =>
                                onNavigateCell({
                                  frameKey: frame.key,
                                  column: column.name,
                                  value: raw,
                                  row,
                                })
                              }
                            >
                              {text}
                            </button>
                          );
                        }

                        return (
                          <span
                            className={cn(
                              'block max-w-xs truncate text-xs text-ink-700',
                              column.isPrimaryKey && 'font-semibold text-brand-800',
                              /description|Description|Name|nameNl|nameNe/.test(column.name)
                                ? 'max-w-md font-sans text-ink-800'
                                : 'font-mono',
                            )}
                            title={text}
                          >
                            {text || '—'}
                          </span>
                        );
                      })()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="space-y-2 border-t border-ink-100 px-6 py-3 text-xs text-ink-600">
          <p>
            {localChangeCount > 0
              ? t('support.editColumnsPending', { count: localChangeCount })
              : t('support.editColumnsHint')}
          </p>
          {preview && (
            <div className="rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-700">
              <p className="font-semibold text-ink-900">
                {t('support.editColumnsPreviewResult', {
                  rows: preview.row_count,
                  cells: preview.change_count,
                })}
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                {preview.changes.flatMap((row) =>
                  row.cells.map((cell) => (
                    <li key={`${row.primary_key_value}-${cell.column}`}>
                      PK {String(row.primary_key_value)} · {cell.column}:{' '}
                      {cellValue(cell.from) || '∅'} → {cellValue(cell.to) || '∅'}
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-xl">
            <h4 className="text-lg font-extrabold text-ink-900">
              {t('support.editColumnsConfirmTitle')}
            </h4>
            {isProduction && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t('support.productionBannerBody', { system: systemName })}
              </p>
            )}
            <p className="text-sm text-ink-600">
              {t('support.editColumnsConfirmHint', {
                table: preview.table_name,
                count: preview.change_count,
              })}
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-100 bg-ink-50 p-3 font-mono text-xs text-ink-700">
              {preview.changes.flatMap((row) =>
                row.cells.map((cell) => (
                  <li key={`${row.primary_key_value}-${cell.column}`}>
                    PK {String(row.primary_key_value)} · {cell.column}:{' '}
                    {cellValue(cell.from) || '∅'} → {cellValue(cell.to) || '∅'}
                  </li>
                )),
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="button" loading={busy} onClick={() => void applySave()}>
                {t('support.editColumnsConfirmApply')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
