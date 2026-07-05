import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/hooks/useAuth';

function initials(name: string | null, username: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  }
  return username.slice(0, 2).toUpperCase();
}

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-ink-200 bg-white/80 px-8 py-4 backdrop-blur-xl">
      <div>
        <h1 className="text-lg font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />

        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-3 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
            {user ? initials(user.full_name, user.username) : '?'}
          </div>
          <div className="pr-1">
            <p className="text-sm font-semibold leading-tight text-ink-900">
              {user?.full_name ?? user?.username}
            </p>
            <p className="text-xs text-ink-400">
              {user ? t(`roles.${user.role}`, { defaultValue: user.role }) : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-200 text-ink-500 transition-colors hover:bg-red-50 hover:text-red-600"
          title={t('common.logout')}
        >
          <LogOut style={{ width: 18, height: 18 }} />
        </button>
      </div>
    </header>
  );
}
