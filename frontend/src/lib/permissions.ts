export const PERMISSIONS = [
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'settings.update',
  'audit_logs.read',
  'dashboard.read',
  'dashboard.financials',
  'categories.read',
  'categories.manage',
  'products.read',
  'products.manage',
  'products.view_cost',
  'suppliers.read',
  'suppliers.manage',
  'customers.read',
  'customers.manage',
  'customers.archive',
  'purchases.read',
  'purchases.manage',
  'purchases.confirm',
  'purchases.receive',
  'purchases.cancel',
  'inventory.read',
  'inventory.adjust',
  'orders.read',
  'orders.manage',
  'orders.confirm',
  'orders.complete',
  'orders.cancel',
  'orders.discount',
  'payments.read',
  'payments.record_customer',
  'payments.record_supplier',
  'payments.refund',
  'payments.reverse',
  'returns.read',
  'returns.create',
  'returns.process',
  'reports.sales',
  'reports.purchases',
  'reports.inventory',
  'reports.financial',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function hasPermission(userPermissions: readonly string[] | undefined, permission: Permission): boolean {
  if (!userPermissions) return false;
  return userPermissions.includes(permission);
}

export function hasAnyPermission(
  userPermissions: readonly string[] | undefined,
  required: readonly Permission[],
): boolean {
  if (!userPermissions) return false;
  return required.some((p) => userPermissions.includes(p));
}
