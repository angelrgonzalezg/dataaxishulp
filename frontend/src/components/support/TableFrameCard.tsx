import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, PencilLine, Table2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { TableFrame } from '@/types';
import { cn } from '@/lib/cn';

type SortDirection = 'asc' | 'desc';

type SortState = {
  column: string;
  direction: SortDirection;
};

function cellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

export function TableFrameCard({ frame }: { frame: TableFrame }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, unknown>[]>(frame.rows);
  const [sort, setSort] = useState<SortState | null>(null);

  const columns = frame.columns;
  const sortable = isSortableTable(frame.tableName);

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

  function startEdit() {
    setDraftRows(frame.rows.map((row) => ({ ...row })));
    setEditing(true);
  }

  function cancelEdit() {
    setDraftRows(frame.rows.map((row) => ({ ...row })));
    setEditing(false);
  }

  function updateCell(rowIndex: number, column: string, value: string) {
    setDraftRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)),
    );
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
              <Button size="sm" variant="secondary" onClick={startEdit}>
                <PencilLine style={{ width: 14, height: 14 }} />
                {t('support.editColumns')}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={cancelEdit}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" disabled title={t('support.saveSoon')}>
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
                      ) : (
                        <span
                          className={cn(
                            'block max-w-xs truncate text-xs text-ink-700',
                            column.isPrimaryKey && 'font-semibold text-brand-800',
                            /description|Description|Name|nameNl|nameNe/.test(column.name)
                              ? 'max-w-md font-sans text-ink-800'
                              : 'font-mono',
                          )}
                          title={cellValue(row[column.name])}
                        >
                          {cellValue(row[column.name]) || '—'}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <p className="border-t border-ink-100 px-6 py-3 text-xs text-amber-700">
          {t('support.saveSoon')}
        </p>
      )}
    </Card>
  );
}
