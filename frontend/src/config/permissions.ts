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
