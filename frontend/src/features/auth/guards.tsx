import type { PropsWithChildren, ReactNode } from 'react';
import type { Permission } from './types';
import { useAuth } from '../../app/providers/authContext';
import { hasPermission } from '../../shared/lib/permissions';

type PermissionGateProps = PropsWithChildren<{
  permission: Permission;
  fallback?: ReactNode;
}>;

export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const { user } = useAuth();

  if (!user || !hasPermission(user.role, permission)) {
    return fallback;
  }

  return children;
}
