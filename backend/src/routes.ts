import type { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { healthRouter } from './modules/health/health.routes';
import { productsRouter } from './modules/products/products.routes';
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
  { path: '/categories', router: categoriesRouter },
  { path: '/products', router: productsRouter },
  { path: '/suppliers', router: suppliersRouter },
  { path: '/customers', router: customersRouter },
];

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Flat list of registered routes, e.g. { method: 'post', path: '/api/v1/auth/login' }. */
export function listRoutes(): { method: string; path: string }[] {
  return apiModules.flatMap(({ path, router }) =>
    (router.stack as unknown as RouteLayer[])
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map((method) => ({
          method,
          path: `${API_PREFIX}${path}${layer.route!.path === '/' ? '' : layer.route!.path}`,
        })),
      ),
  );
}
