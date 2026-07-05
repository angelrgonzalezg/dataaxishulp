import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilLine, Table2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { TableFrame } from '@/types';
import { cn } from '@/lib/cn';

function cellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function TableFrameCard({ frame }: { frame: TableFrame }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, unknown>[]>(frame.rows);

  const columns = frame.columns;

  const rows = useMemo(
    () => (editing ? draftRows : frame.rows),
    [editing, draftRows, frame.rows],
  );

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
                {columns.map((column) => (
                  <th
                    key={column.name}
                    className={cn(
                      'whitespace-nowrap border-b border-ink-100 px-4 py-3',
                      column.isPrimaryKey && 'text-brand-700',
                    )}
                  >
                    {column.name}
                    {column.isPrimaryKey && (
                      <span className="ml-1 text-[10px] font-bold text-brand-500">PK</span>
                    )}
                  </th>
                ))}
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
                            'block max-w-xs truncate font-mono text-xs text-ink-700',
                            column.isPrimaryKey && 'font-semibold text-brand-800',
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
