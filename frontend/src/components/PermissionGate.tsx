import type { ReactNode } from 'react';
import type { Permission } from '@/config/permissions';
import { usePermissions } from '@/hooks/usePermissions';

export function PermissionGate({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = usePermissions();
  if (!can(permission)) return null;
  return <>{children}</>;
}
