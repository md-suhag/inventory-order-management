import { requestContext } from '../../common/audit/audit';
import { PERMISSIONS } from '../../common/auth/permissions';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import { createRoleSchema, listRolesQuerySchema, updateRoleSchema } from './roles.schemas';
import * as rolesService from './roles.service';

/** Permission catalogue (used by the role editor). */
export const permissions = handler({}, (_input, _req, res) => {
  sendData(
    res,
    Object.entries(PERMISSIONS).map(([key, p]) => ({ key, module: p.module, description: p.description })),
  );
});

export const list = handler({ query: listRolesQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await rolesService.listRoles(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await rolesService.getRole(params.id));
});

export const create = handler({ body: createRoleSchema }, async ({ body }, req, res) => {
  sendData(res, await rolesService.createRole(body, req.auth!, requestContext(req)), 201);
});

export const update = handler({ params: idParamsSchema, body: updateRoleSchema }, async ({ params, body }, req, res) => {
  sendData(res, await rolesService.updateRole(params.id, body, req.auth!, requestContext(req)));
});

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  await rolesService.deleteRole(params.id, requestContext(req));
  res.status(204).end();
});
