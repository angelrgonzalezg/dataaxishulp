import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AppBrand } from '@/components/branding/AppBrand';
import { navigation, type NavGroup, type NavLeaf } from './navigation';
import { usePermissions } from '@/hooks/usePermissions';

function LeafLink({ item, nested = false }: { item: NavLeaf; nested?: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          nested && 'pl-4',
          isActive ? 'text-white' : 'text-brand-100/85 hover:bg-white/10 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-xl bg-white/15 shadow-sm ring-1 ring-white/20"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <Icon style={{ width: 18, height: 18 }} className={isActive ? 'text-white' : 'text-brand-200/90'} />
          <span className="flex-1">{label}</span>
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </>
      )}
    </NavLink>
  );
}

function GroupBlock({ group }: { group: NavGroup }) {
  const { t } = useTranslation();
  const location = useLocation();
  const active = group.children.some((child) => location.pathname.startsWith(child.to));
  const [open, setOpen] = useState(active);
  const Icon = group.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
          active ? 'text-white' : 'text-brand-100/90 hover:bg-white/10 hover:text-white',
        )}
      >
        <Icon style={{ width: 18, height: 18 }} className={active ? 'text-white' : 'text-brand-200/90'} />
        <span className="flex-1 text-left">{t(group.labelKey)}</span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight style={{ width: 16, height: 16 }} className="text-brand-200/70" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-white/15 pl-2">
              {group.children.map((child) => (
                <LeafLink key={child.labelKey} item={child} nested />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar() {
  const { can } = usePermissions();

  const visibleNavigation = useMemo(
    () =>
      navigation
        .filter((item) => can(item.permission))
        .map((item) =>
          item.kind === 'group'
            ? { ...item, children: item.children.filter((child) => can(child.permission)) }
            : item,
        )
        .filter((item) => item.kind === 'link' || item.children.length > 0),
    [can],
  );

  return (
    <aside className="flex h-full w-72 flex-col border-r border-brand-800 bg-gradient-to-b from-brand-700 via-brand-800 to-brand-950 shadow-lg">
      <div className="border-b border-white/10 px-4 py-5">
        <AppBrand variant="login" showText onDark linkToHome />
      </div>

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4 pb-6">
        {visibleNavigation.map((item) =>
          item.kind === 'link' ? (
            <LeafLink key={item.labelKey} item={item} />
          ) : (
            <GroupBlock key={item.labelKey} group={item} />
          ),
        )}
      </nav>
    </aside>
  );
}
