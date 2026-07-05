import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { PermissionGate } from '@/components/PermissionGate';
import { useUsers } from '@/hooks/useUsers';
import type { AppUser, UserRole } from '@/types';

function UserRow({ user, index }: { user: AppUser; index: number }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
      className="flex items-center gap-4 border-b border-ink-100 px-6 py-4 last:border-0 hover:bg-ink-50/60"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-bold text-brand-700">
        {user.username.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900">{user.full_name ?? user.username}</p>
        <p className="truncate text-sm text-ink-500">
          @{user.username} · {user.email}
        </p>
      </div>
      <span className="hidden text-sm text-ink-600 sm:inline">{t(`roles.${user.role}`)}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          user.is_active ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500'
        }`}
      >
        {user.is_active ? t('users.active') : t('users.inactive')}
      </span>
      <PermissionGate permission="users.edit">
        <Link to={`/maintenance/users/${user.user_id}/edit`}>
          <Button size="sm" variant="secondary">
            {t('users.edit')}
          </Button>
        </Link>
      </PermissionGate>
    </motion.div>
  );
}

export function UsersListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      role: role ? (role as UserRole) : undefined,
      is_active: activeFilter === '' ? undefined : activeFilter === 'true',
    }),
    [search, role, activeFilter],
  );

  const { data, isLoading, isError } = useUsers(params);
  const users = data?.users ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="sm:max-w-xs sm:flex-1">
            <Input
              placeholder={t('users.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search style={{ width: 18, height: 18 }} />}
            />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-44">
            <option value="">{t('users.allRoles')}</option>
            {(['admin', 'agent', 'viewer'] as UserRole[]).map((value) => (
              <option key={value} value={value}>
                {t(`roles.${value}`)}
              </option>
            ))}
          </Select>
          <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="sm:w-36">
            <option value="">{t('users.allStatuses')}</option>
            <option value="true">{t('users.active')}</option>
            <option value="false">{t('users.inactive')}</option>
          </Select>
        </div>
        <PermissionGate permission="users.create">
          <Link to="/maintenance/users/new">
            <Button>
              <Plus style={{ width: 18, height: 18 }} />
              {t('users.newUser')}
            </Button>
          </Link>
        </PermissionGate>
      </div>

      <Card>
        {isError && <p className="p-6 text-sm text-red-600">{t('users.loadError')}</p>}
        {isLoading && <p className="p-6 text-sm text-ink-500">{t('common.loading')}</p>}
        {!isLoading && !isError && users.length === 0 && (
          <p className="p-6 text-sm text-ink-500">{t('users.empty')}</p>
        )}
        {users.map((user, index) => (
          <UserRow key={user.user_id} user={user} index={index} />
        ))}
      </Card>
    </div>
  );
}
