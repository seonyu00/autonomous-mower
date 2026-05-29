export type Role = 'read-only' | 'operator' | 'supervisor' | 'admin';

export type Permission =
  | 'robots:read'
  | 'telemetry:read'
  | 'history:read'
  | 'logs:read'
  | 'settings:read'
  | 'control:write'
  | 'control:takeover';

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
};
