import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  LayoutList,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardOverview } from '@/hooks/useDashboard';
import { mondayBoardBarColor } from '@/lib/mondayBoardThemes';

function StatCard({
  icon,
  label,
  value,
  accent,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="h-full p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>{icon}</div>
        <p className="mt-4 text-2xl font-extrabold text-ink-900">{value}</p>
        <p className="text-sm font-medium text-ink-700">{label}</p>
      </Card>
    </motion.div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useDashboardOverview();
  const monday = data?.monday;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white shadow-glow"
      >
        <p className="text-sm text-white/70">
          {t('dashboard.subtitle', { name: user?.full_name ?? user?.username ?? '' })}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold">{t('dashboard.title')}</h2>
        <p className="mt-2 max-w-xl text-white/80">{t('dashboard.description')}</p>
      </motion.div>

      {isError && <Card className="p-6 text-sm text-red-600">{t('dashboard.loadError')}</Card>}

      {isLoading || !data ? (
        <Card className="p-10 text-center text-sm text-ink-500">{t('common.loading')}</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              icon={<LayoutList style={{ width: 22, height: 22 }} />}
              label={t('dashboard.totalIssues')}
              value={String(data.totals.issues)}
              accent="bg-brand-50 text-brand-600"
              delay={0.05}
            />
            <StatCard
              icon={<AlertTriangle style={{ width: 22, height: 22 }} />}
              label={t('dashboard.open')}
              value={String(data.totals.open)}
              accent="bg-amber-50 text-amber-600"
              delay={0.1}
            />
            <StatCard
              icon={<Loader2 style={{ width: 22, height: 22 }} />}
              label={t('dashboard.inProgress')}
              value={String(data.totals.in_progress)}
              accent="bg-sky-50 text-sky-600"
              delay={0.15}
            />
            <StatCard
              icon={<CheckCircle2 style={{ width: 22, height: 22 }} />}
              label={t('dashboard.resolved')}
              value={String(data.totals.resolved)}
              accent="bg-emerald-50 text-emerald-600"
              delay={0.2}
            />
            <StatCard
              icon={<ShieldAlert style={{ width: 22, height: 22 }} />}
              label={t('dashboard.critical')}
              value={String(data.totals.critical_open)}
              accent="bg-red-50 text-red-600"
              delay={0.25}
            />
            <StatCard
              icon={<Database style={{ width: 22, height: 22 }} />}
              label={t('dashboard.systems')}
              value={String(data.totals.systems)}
              accent="bg-violet-50 text-violet-600"
              delay={0.3}
            />
          </div>

          {monday?.configured && (
            <Card>
              <div className="flex flex-col gap-3 border-b border-ink-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-extrabold text-ink-900">
                    <ExternalLink style={{ width: 20, height: 20 }} className="text-brand-600" />
                    {t('dashboard.monday.title')}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {t('dashboard.monday.subtitle')}
                    {monday.workspace ? ` · ${monday.workspace}` : ''}
                    {monday.last_synced_at && (
                      <>
                        {' '}
                        · {t('dashboard.monday.lastSynced')}{' '}
                        {new Date(monday.last_synced_at).toLocaleString()}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link to="/issues?tab=monday">
                    <Button variant="secondary" size="sm">
                      {t('dashboard.monday.viewInbox')}
                    </Button>
                  </Link>
                  <Button variant="secondary" size="sm" loading={isFetching} onClick={() => refetch()}>
                    <RefreshCw style={{ width: 14, height: 14 }} />
                    {t('dashboard.monday.refresh')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-6 lg:grid-cols-4">
                <div>
                  <p className="text-2xl font-extrabold text-amber-600">{monday.totals.open}</p>
                  <p className="text-sm text-ink-600">{t('dashboard.monday.open')}</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-emerald-600">{monday.totals.done}</p>
                  <p className="text-sm text-ink-600">{t('dashboard.monday.done')}</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-ink-900">{monday.totals.total}</p>
                  <p className="text-sm text-ink-600">{t('dashboard.monday.total')}</p>
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-brand-600">{monday.totals.imported_local}</p>
                  <p className="text-sm text-ink-600">{t('dashboard.monday.imported')}</p>
                </div>
              </div>

              {monday.by_board.length > 0 && (
                <div className="space-y-3 border-t border-ink-100 px-6 pb-6 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    {t('dashboard.monday.byBoard')}
                  </p>
                  {monday.by_board.map((board) => (
                    <div key={board.board_key}>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="font-medium text-ink-700">{board.label}</span>
                        <span className="shrink-0 text-ink-500">
                          {board.open} {t('issues.monday.openItems')} · {board.done} Done · {board.total}{' '}
                          total
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className={`h-full ${mondayBoardBarColor(board.board_key)}`}
                          style={{
                            width: `${Math.min(100, (board.open / Math.max(board.total, 1)) * 100)}%`,
                          }}
                        />
                        <div
                          className="h-full bg-emerald-300"
                          style={{
                            width: `${Math.min(100, (board.done / Math.max(board.total, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('dashboard.recent')} icon={<AlertTriangle style={{ width: 20, height: 20 }} />} />
              <div className="divide-y divide-ink-100">
                {data.recent_issues.length === 0 ? (
                  <p className="p-6 text-sm text-ink-500">{t('dashboard.noRecent')}</p>
                ) : (
                  data.recent_issues.map((issue) => (
                    <Link
                      key={issue.issue_id}
                      to={`/issues/${issue.issue_id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-ink-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-ink-900">{issue.title}</p>
                          {issue.source === 'monday' && (
                            <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">
                              Monday
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-500">
                          {issue.system_name} · {t(`issues.statuses.${issue.status}`, { defaultValue: issue.status })}
                        </p>
                      </div>
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                        {t(`issues.priorities.${issue.priority}`, { defaultValue: issue.priority })}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title={t('dashboard.bySystem')} icon={<Database style={{ width: 20, height: 20 }} />} />
              <div className="space-y-3 p-6">
                {data.by_system.length === 0 ? (
                  <p className="text-sm text-ink-500">{t('common.noData')}</p>
                ) : (
                  data.by_system.map((item) => (
                    <div key={item.system_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-700">{item.name}</span>
                        <span className="font-semibold text-ink-900">{item.count}</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${Math.min(100, (item.count / Math.max(data.totals.issues, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
