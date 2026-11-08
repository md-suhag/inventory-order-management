import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  isPermission,
  type Permission,
} from '../../src/common/auth/permissions';
import { hasPermission } from '../../src/common/middleware/authorize';
import type { AuthContext } from '../../src/common/types/express';

const ctx = (permissions: Permission[], isAdmin = false): AuthContext => ({
  userId: 'u',
  roleId: 'r',
  roleName: isAdmin ? 'ADMIN' : 'X',
  isAdmin,
  permissions: new Set(permissions),
});

const ADMIN_ONLY: Permission[] = ['users.read', 'users.manage', 'roles.read', 'roles.manage', 'settings.update', 'audit_logs.read'];

describe('default role permissions (FUNCTIONAL_REQUIREMENTS §2)', () => {
  it('ADMIN holds every permission', () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('MANAGER holds everything except administration', () => {
    for (const p of ADMIN_ONLY) expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).not.toContain(p);
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).toHaveLength(ALL_PERMISSIONS.length - ADMIN_ONLY.length);
  });

  it('STAFF cannot see costs, purchase, adjust stock, cancel confirmed orders, discount or view financials', () => {
    const forbidden: Permission[] = [
      ...ADMIN_ONLY,
      'products.view_cost',
      'products.manage',
      'purchases.read',
      'inventory.adjust',
      'orders.cancel',
      'orders.discount',
      'payments.record_supplier',
      'payments.refund',
      'payments.reverse',
      'returns.process',
      'reports.financial',
      'dashboard.financials',
    ];
    for (const p of forbidden) expect(DEFAULT_ROLE_PERMISSIONS.STAFF).not.toContain(p);
  });

  it('STAFF can run the sales counter workflow', () => {
    for (const p of ['orders.manage', 'orders.confirm', 'orders.complete', 'payments.record_customer', 'returns.create'] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS.STAFF).toContain(p);
    }
  });

  it('every default grant is a known permission', () => {
    for (const list of Object.values(DEFAULT_ROLE_PERMISSIONS)) for (const p of list) expect(isPermission(p)).toBe(true);
  });
});

describe('hasPermission', () => {
  it('grants only listed permissions to non-admins', () => {
    expect(hasPermission(ctx(['orders.read']), 'orders.read')).toBe(true);
    expect(hasPermission(ctx(['orders.read']), 'orders.cancel')).toBe(false);
  });

  it('system admin implicitly holds every permission', () => {
    expect(hasPermission(ctx([], true), 'settings.update')).toBe(true);
  });

  it('denies when unauthenticated', () => {
    expect(hasPermission(undefined, 'orders.read')).toBe(false);
  });

  it('isPermission rejects unknown keys', () => {
    expect(isPermission('orders.delete_everything')).toBe(false);
    expect(isPermission('constructor')).toBe(false);
  });
});
