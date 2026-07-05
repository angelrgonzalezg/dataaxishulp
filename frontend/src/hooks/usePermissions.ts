import { useAuthStore } from '@/store/authStore';
import type { Permission } from '@/config/permissions';

export function usePermissions() {
  const permissions = useAuthStore((state) => state.permissions);

  function can(permission?: Permission): boolean {
    if (!permission) return true;
    return permissions.includes(permission);
  }

  return { permissions, can };
}
