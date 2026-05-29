import { describe, expect, it } from 'vitest';
import { hasPermission } from './permissions';

describe('RBAC permissions', () => {
  it('keeps read-only users away from control permissions', () => {
    expect(hasPermission('read-only', 'robots:read')).toBe(true);
    expect(hasPermission('read-only', 'control:write')).toBe(false);
    expect(hasPermission('read-only', 'control:takeover')).toBe(false);
  });

  it('allows operators to control but not force takeover', () => {
    expect(hasPermission('operator', 'control:write')).toBe(true);
    expect(hasPermission('operator', 'control:takeover')).toBe(false);
  });

  it('allows supervisors and admins to force takeover', () => {
    expect(hasPermission('supervisor', 'control:takeover')).toBe(true);
    expect(hasPermission('admin', 'control:takeover')).toBe(true);
  });
});
