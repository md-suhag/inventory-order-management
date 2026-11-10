import type { Router } from 'express';
import { authenticate } from './common/middleware/authenticate';
import { PERMISSIONS_METADATA, type PermissionProtectedHandler } from './common/middleware/authorize';
import { authRouter } from './modules/auth/auth.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { healthRouter } from './modules/health/health.routes';
import { productsRouter } from './modules/products/products.routes';
import { purchasesRouter } from './modules/purchases/purchases.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { salesReturnsRouter } from './modules/sales-returns/sales-returns.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { auditLogsRouter } from './modules/audit-logs/audit-logs.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { usersRouter } from './modules/users/users.routes';

export const API_PREFIX = '/api/v1';

/** Every API module and its mount path. Used by app.ts and by the OpenAPI coverage test. */
export const apiModules: { path: string; router: Router }[] = [
  { path: '/health', router: healthRouter },
  { path: '/auth', router: authRouter },
  { path: '/users', router: usersRouter },
  { path: '/roles', router: rolesRouter },
  { path: '/dashboard', router: dashboardRouter },
  { path: '/categories', router: categoriesRouter },
  { path: '/products', router: productsRouter },
  { path: '/suppliers', router: suppliersRouter },
  { path: '/customers', router: customersRouter },
  { path: '/purchases', router: purchasesRouter },
  { path: '/inventory', router: inventoryRouter },
  { path: '/orders', router: ordersRouter },
  { path: '/payments', router: paymentsRouter },
  { path: '/sales-returns', router: salesReturnsRouter },
  { path: '/reports', router: reportsRouter },
  { path: '/audit-logs', router: auditLogsRouter },
  { path: '/settings', router: settingsRouter },
];

interface StackLayer {
  handle?: unknown;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle?: unknown }[];
  };
}

export interface RouteSecurityInfo {
  method: string;
  path: string;
  authenticated: boolean;
  permissions: string[];
}

/** Flat list of registered routes, e.g. { method: 'post', path: '/api/v1/auth/login' }. */
export function listRoutes(): { method: string; path: string }[] {
  return apiModules.flatMap(({ path, router }) =>
    (router.stack as unknown as StackLayer[])
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map((method) => ({
          method,
          path: `${API_PREFIX}${path}${layer.route!.path === '/' ? '' : layer.route!.path}`,
        })),
      ),
  );
}

/** Enumerates every registered route along with router + route-level auth/RBAC middleware. */
export function listRouteSecurity(): RouteSecurityInfo[] {
  const results: RouteSecurityInfo[] = [];

  for (const { path, router } of apiModules) {
    let routerAuth = false;
    const routerPermissions: string[] = [];

    for (const layer of router.stack as unknown as StackLayer[]) {
      if (!layer.route) {
        if (layer.handle === authenticate) routerAuth = true;
        const perms = (layer.handle as PermissionProtectedHandler | undefined)?.[PERMISSIONS_METADATA];
        if (perms?.length) routerPermissions.push(...perms);
        continue;
      }

      const routeHandles = layer.route.stack.map((s) => s.handle);
      const authenticated = routerAuth || routeHandles.includes(authenticate);
      const routePerms = routeHandles.flatMap(
        (h) => (h as PermissionProtectedHandler | undefined)?.[PERMISSIONS_METADATA] ?? [],
      );
      const permissions = [...new Set([...routerPermissions, ...routePerms])];
      const fullPath = `${API_PREFIX}${path}${layer.route.path === '/' ? '' : layer.route.path}`;

      for (const method of Object.keys(layer.route.methods)) {
        results.push({ method, path: fullPath, authenticated, permissions });
      }
    }
  }

  return results;
}
