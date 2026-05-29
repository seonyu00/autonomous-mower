import type { Permission, Role } from '../../features/auth/types';

const rolePermissions: Record<Role, Permission[]> = {
  'read-only': ['robots:read', 'telemetry:read', 'history:read', 'logs:read'],
  operator: ['robots:read', 'telemetry:read', 'history:read', 'logs:read', 'control:write'],
  supervisor: [
    'robots:read',
    'telemetry:read',
    'history:read',
    'logs:read',
    'settings:read',
    'control:write',
    'control:takeover',
  ],
  admin: [
    'robots:read',
    'telemetry:read',
    'history:read',
    'logs:read',
    'settings:read',
    'control:write',
    'control:takeover',
  ],
};

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].includes(permission);
}
