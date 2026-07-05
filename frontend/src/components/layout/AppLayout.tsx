import { Outlet, useMatches } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface RouteHandle {
  titleKey?: string;
  subtitleKey?: string;
}

export function AppLayout() {
  const { t } = useTranslation();
  const matches = useMatches();
  const current = [...matches].reverse().find((match) => (match.handle as RouteHandle)?.titleKey);
  const handle = (current?.handle as RouteHandle) ?? {};

  return (
    <div className="flex h-full overflow-hidden bg-ink-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={handle.titleKey ? t(handle.titleKey) : t('common.appName')}
          subtitle={handle.subtitleKey ? t(handle.subtitleKey) : undefined}
        />
        <main className="scrollbar-thin flex-1 overflow-y-auto px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
