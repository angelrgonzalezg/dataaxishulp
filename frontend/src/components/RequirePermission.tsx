import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Permission } from '@/config/permissions';
import { usePermissions } from '@/hooks/usePermissions';

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = usePermissions();
  if (!can(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
