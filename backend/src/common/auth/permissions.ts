/**
 * Permission catalogue — the single source of truth for RBAC.
 * The seed syncs this list into the `permissions` table and grants defaults to system roles.
 * The matrix is documented in docs/requirements/FUNCTIONAL_REQUIREMENTS.md §2.
 */
export const PERMISSIONS = {
  'users.read': { module: 'users', description: 'View users' },
  'users.manage': { module: 'users', description: 'Create, update, activate/deactivate users and assign roles' },
  'roles.read': { module: 'roles', description: 'View roles and permissions' },
  'roles.manage': { module: 'roles', description: 'Create, edit and delete custom roles' },
  'settings.update': { module: 'settings', description: 'Change business settings, payment methods and document prefixes' },
  'audit_logs.read': { module: 'audit_logs', description: 'View audit logs' },
  'dashboard.read': { module: 'dashboard', description: 'View operational dashboard' },
  'dashboard.financials': { module: 'dashboard', description: 'View financial dashboard figures' },
  'categories.read': { module: 'categories', description: 'View categories' },
  'categories.manage': { module: 'categories', description: 'Create, edit, archive and delete categories' },
  'products.read': { module: 'products', description: 'View products and stock' },
  'products.manage': { module: 'products', description: 'Create, edit, archive and delete products' },
  'products.view_cost': { module: 'products', description: 'View cost prices, unit costs, valuation and margins' },
  'suppliers.read': { module: 'suppliers', description: 'View suppliers' },
  'suppliers.manage': { module: 'suppliers', description: 'Create, edit and archive suppliers' },
  'customers.read': { module: 'customers', description: 'View customers' },
  'customers.manage': { module: 'customers', description: 'Create and edit customers' },
  'customers.archive': { module: 'customers', description: 'Archive customers' },
  'purchases.read': { module: 'purchases', description: 'View purchases' },
  'purchases.manage': { module: 'purchases', description: 'Create and edit draft purchases' },
  'purchases.confirm': { module: 'purchases', description: 'Confirm purchases (place order with supplier)' },
  'purchases.receive': { module: 'purchases', description: 'Record goods receipts' },
  'purchases.cancel': { module: 'purchases', description: 'Cancel purchases' },
  'inventory.read': { module: 'inventory', description: 'View inventory and movement history' },
  'inventory.adjust': { module: 'inventory', description: 'Make manual stock adjustments' },
  'orders.read': { module: 'orders', description: 'View orders' },
  'orders.manage': { module: 'orders', description: 'Create and edit draft orders, cancel drafts' },
  'orders.confirm': { module: 'orders', description: 'Confirm orders (deducts stock)' },
  'orders.complete': { module: 'orders', description: 'Complete orders' },
  'orders.cancel': { module: 'orders', description: 'Cancel confirmed orders (restores stock)' },
  'orders.discount': { module: 'orders', description: 'Apply line-item and order-level discounts' },
  'payments.read': { module: 'payments', description: 'View payments' },
  'payments.record_customer': { module: 'payments', description: 'Record customer payments' },
  'payments.record_supplier': { module: 'payments', description: 'Record supplier payments' },
  'payments.refund': { module: 'payments', description: 'Record refunds' },
  'payments.reverse': { module: 'payments', description: 'Reverse erroneous payment records' },
  'returns.read': { module: 'returns', description: 'View sales returns' },
  'returns.create': { module: 'returns', description: 'Request sales returns' },
  'returns.process': { module: 'returns', description: 'Approve or reject sales returns' },
  'reports.sales': { module: 'reports', description: 'View sales reports' },
  'reports.purchases': { module: 'reports', description: 'View purchase reports' },
  'reports.inventory': { module: 'reports', description: 'View inventory reports' },
  'reports.financial': { module: 'reports', description: 'View financial reports' },
} as const satisfies Record<string, { module: string; description: string }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SystemRole = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', STAFF: 'STAFF' } as const;
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole];

const ADMIN_ONLY: Permission[] = [
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'settings.update',
  'audit_logs.read',
];

/** Default grants applied when a system role is first created. ADMIN always holds everything. */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS.filter((p) => !ADMIN_ONLY.includes(p)),
  STAFF: [
    'dashboard.read',
    'categories.read',
    'products.read',
    'inventory.read',
    'customers.read',
    'customers.manage',
    'orders.read',
    'orders.manage',
    'orders.confirm',
    'orders.complete',
    'payments.read',
    'payments.record_customer',
    'returns.read',
    'returns.create',
    'reports.sales',
  ],
};

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}
