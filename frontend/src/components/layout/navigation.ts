import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Database,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  UserCog,
} from 'lucide-react';
import type { Permission } from '@/config/permissions';

export interface NavLeaf {
  labelKey: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface NavGroup {
  labelKey: string;
  icon: LucideIcon;
  children: NavLeaf[];
  permission?: Permission;
}

export type NavItem =
  | ({ kind: 'link' } & NavLeaf)
  | ({ kind: 'group' } & NavGroup);

export const navigation: NavItem[] = [
  {
    kind: 'link',
    labelKey: 'nav.support',
    to: '/support',
    icon: LifeBuoy,
    permission: 'support.view',
  },
  {
    kind: 'link',
    labelKey: 'nav.dashboard',
    to: '/',
    icon: LayoutDashboard,
    permission: 'dashboard.view',
  },
  {
    kind: 'link',
    labelKey: 'nav.issues',
    to: '/issues',
    icon: AlertTriangle,
    permission: 'issues.view',
  },
  {
    kind: 'link',
    labelKey: 'nav.systems',
    to: '/systems',
    icon: Database,
    permission: 'systems.view',
  },
  {
    kind: 'group',
    labelKey: 'nav.maintenance',
    icon: Settings,
    permission: 'users.view',
    children: [
      {
        labelKey: 'nav.users',
        to: '/maintenance/users',
        icon: UserCog,
        permission: 'users.view',
      },
    ],
  },
];
