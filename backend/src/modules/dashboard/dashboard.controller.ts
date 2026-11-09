import { handler, sendData } from '../../common/http/handler';
import { hasPermission } from '../../common/middleware/authorize';
import { dashboardQuerySchema } from './dashboard.schemas';
import * as dashboardService from './dashboard.service';

export const summary = handler({ query: dashboardQuerySchema }, async ({ query }, req, res) => {
  sendData(
    res,
    await dashboardService.getSummary(query, {
      financials: hasPermission(req.auth, 'dashboard.financials'),
      orders: hasPermission(req.auth, 'orders.read'),
      purchases: hasPermission(req.auth, 'purchases.read'),
    }),
  );
});
