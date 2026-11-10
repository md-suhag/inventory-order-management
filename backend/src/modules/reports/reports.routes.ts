import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as reports from './reports.controller';

export const reportsRouter = Router();

reportsRouter.use(authenticate);

reportsRouter.get('/sales/summary', authorize('reports.sales'), reports.salesSummary);
reportsRouter.get('/sales/by-product', authorize('reports.sales'), reports.salesByProduct);
reportsRouter.get('/sales/by-customer', authorize('reports.sales'), reports.salesByCustomer);
reportsRouter.get('/purchases', authorize('reports.purchases'), reports.purchases);
reportsRouter.get('/inventory/summary', authorize('reports.inventory'), reports.inventorySummary);
reportsRouter.get(
  '/inventory/valuation',
  authorize('reports.inventory'),
  authorize('products.view_cost'),
  reports.inventoryValuation,
);
reportsRouter.get('/financial/summary', authorize('reports.financial'), reports.financialSummary);
reportsRouter.get('/financial/aging', authorize('reports.financial'), reports.financialAging);
