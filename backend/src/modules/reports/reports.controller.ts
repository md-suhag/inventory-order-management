import { handler, sendData } from '../../common/http/handler';
import {
  financialAgingQuerySchema,
  financialSummaryQuerySchema,
  inventorySummaryQuerySchema,
  inventoryValuationQuerySchema,
  purchasesReportQuerySchema,
  salesByCustomerQuerySchema,
  salesByProductQuerySchema,
  salesSummaryQuerySchema,
} from './reports.schemas';
import * as reportsService from './reports.service';

export const salesSummary = handler({ query: salesSummaryQuerySchema }, async ({ query }, _req, res) => {
  sendData(res, await reportsService.getSalesSummary(query));
});

export const salesByProduct = handler({ query: salesByProductQuerySchema }, async ({ query }, req, res) => {
  const canViewCost = req.auth?.permissions.has('products.view_cost') ?? false;
  sendData(res, await reportsService.getSalesByProduct(query, { canViewCost }));
});

export const salesByCustomer = handler({ query: salesByCustomerQuerySchema }, async ({ query }, _req, res) => {
  sendData(res, await reportsService.getSalesByCustomer(query));
});

export const purchases = handler({ query: purchasesReportQuerySchema }, async ({ query }, _req, res) => {
  sendData(res, await reportsService.getPurchasesReport(query));
});

export const inventorySummary = handler(
  { query: inventorySummaryQuerySchema },
  async ({ query }, _req, res) => {
    sendData(res, await reportsService.getInventorySummary(query));
  },
);

export const inventoryValuation = handler(
  { query: inventoryValuationQuerySchema },
  async ({ query }, _req, res) => {
    sendData(res, await reportsService.getInventoryValuation(query));
  },
);

export const financialSummary = handler(
  { query: financialSummaryQuerySchema },
  async ({ query }, _req, res) => {
    sendData(res, await reportsService.getFinancialSummary(query));
  },
);

export const financialAging = handler(
  { query: financialAgingQuerySchema },
  async ({ query }, _req, res) => {
    sendData(res, await reportsService.getFinancialAging(query));
  },
);
