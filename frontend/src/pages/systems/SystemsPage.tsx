import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Database, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PermissionGate } from '@/components/PermissionGate';
import { extractErrorMessage } from '@/api/client';
import { useSystems, useTestSystem } from '@/hooks/useSystems';
import type { SystemConnection } from '@/types';

function statusBadge(system: SystemConnection, t: (key: string) => string) {
  if (system.last_status === 'online') {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{t('systems.online')}</span>;
  }
  if (system.last_status === 'offline') {
    return <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{t('systems.offline')}</span>;
  }
  return <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-600">{t('systems.unknown')}</span>;
}

export function SystemsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useSystems();
  const testSystem = useTestSystem();

  async function onTest(systemId: number) {
    const toastId = toast.loading(t('systems.testing'));
    try {
      const system = await testSystem.mutateAsync(systemId);
      if (system.last_status === 'online') {
        toast.success(t('systems.testOk'), { id: toastId });
      } else {
        toast.error(system.last_error || t('systems.testFail'), { id: toastId, duration: 8000 });
      }
    } catch (error) {
      toast.error(extractErrorMessage(error), { id: toastId, duration: 8000 });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader
          title={t('systems.title')}
          description={t('systems.description')}
          icon={<Database style={{ width: 20, height: 20 }} />}
        />
      </Card>

      {isError && <Card className="p-6 text-sm text-red-600">{t('systems.loadError')}</Card>}
      {isLoading && <Card className="p-6 text-sm text-ink-500">{t('common.loading')}</Card>}

      <div className="grid gap-4">
        {(data ?? []).map((system) => (
          <Card key={system.system_id} className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-bold text-ink-900">{system.name}</h3>
                  {system.is_production && (
                    <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-white">
                      {t('systems.production')}
                    </span>
                  )}
                  {statusBadge(system, t)}
                </div>
                {system.description && (
                  <p className="mt-1 text-sm text-ink-500">{system.description}</p>
                )}
                <div className="mt-4 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
                  <p>
                    <span className="font-semibold text-ink-800">{t('systems.database')}: </span>
                    {system.database_name ?? '—'}
                  </p>
                  <p>
                    <span className="font-semibold text-ink-800">{t('systems.host')}: </span>
                    {system.host ?? '—'}
                    {system.port ? `:${system.port}` : ''}
                  </p>
                  <p>
                    <span className="font-semibold text-ink-800">{t('systems.envVar')}: </span>
                    <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{system.env_var_name}</code>
                  </p>
                  <p>
                    <span className="font-semibold text-ink-800">URL: </span>
                    {system.has_connection_url ? t('systems.hasUrl') : t('systems.missingUrl')}
                  </p>
                  {system.last_checked_at && (
                    <p className="sm:col-span-2">
                      <span className="font-semibold text-ink-800">{t('systems.lastChecked')}: </span>
                      {new Date(system.last_checked_at).toLocaleString()}
                    </p>
                  )}
                  {system.last_error && (
                    <p className="sm:col-span-2 text-red-600">{system.last_error}</p>
                  )}
                </div>
              </div>

              <PermissionGate permission="systems.manage">
                <Button
                  variant="secondary"
                  loading={testSystem.isPending}
                  onClick={() => void onTest(system.system_id)}
                >
                  <PlugZap style={{ width: 18, height: 18 }} />
                  {t('systems.testConnection')}
                </Button>
              </PermissionGate>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
