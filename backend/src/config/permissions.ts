import type { UserRole } from '../types/database.types';

export const PERMISSIONS = [
  'dashboard.view',
  'support.view',
  'support.edit',
  'issues.view',
  'issues.create',
  'issues.edit',
  'issues.resolve',
  'users.view',
  'users.create',
  'users.edit',
  'systems.view',
  'systems.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ALL,
  agent: [
    'dashboard.view',
    'support.view',
    'support.edit',
    'issues.view',
    'issues.create',
    'issues.edit',
    'issues.resolve',
    'systems.view',
  ],
  viewer: ['dashboard.view', 'support.view', 'issues.view', 'systems.view'],
};

export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
