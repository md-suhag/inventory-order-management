import type { Request } from 'express';
import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  createAdjustmentSchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
} from './inventory.schemas';
import * as inventoryService from './inventory.service';

function viewerOf(req: Request): inventoryService.Viewer {
  return {
    canViewCost:
      req.auth?.isAdmin || (req.auth?.permissions.has('products.view_cost') ?? false),
  };
}

export const list = handler({ query: listInventoryQuerySchema }, async ({ query }, req, res) => {
  sendPage(res, await inventoryService.listInventory(query, viewerOf(req)));
});

export const lowStock = handler({}, async (_input, req, res) => {
  sendData(res, await inventoryService.getLowStock(viewerOf(req)));
});

export const adjust = handler({ body: createAdjustmentSchema }, async ({ body }, req, res) => {
  const result = await inventoryService.createAdjustment(
    body,
    requestContext(req),
    viewerOf(req),
    req.idempotencyKey,
  );
  if (result.replayed) {
    res.setHeader('Idempotent-Replayed', 'true');
    sendData(res, result.movement, 200);
  } else {
    sendData(res, result.movement, 201);
  }
});

export const movements = handler({ query: listMovementsQuerySchema }, async ({ query }, req, res) => {
  sendPage(res, await inventoryService.listMovements(query, viewerOf(req)));
});

export const getMovement = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await inventoryService.getMovement(params.id, viewerOf(req)));
});
