'use client';

import { useAuth } from '@/context/AuthContext';

export function usePermissions() {
  const { permissions, roles, hasPermission } = useAuth();

  return {
    permissions,
    roles,
    hasPermission,
  };
}
