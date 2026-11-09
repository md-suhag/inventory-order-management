import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './users.schemas';
import * as usersService from './users.service';

export const list = handler({ query: listUsersQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await usersService.listUsers(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await usersService.getUser(params.id));
});

export const create = handler({ body: createUserSchema }, async ({ body }, req, res) => {
  sendData(res, await usersService.createUser(body, req.auth!, requestContext(req)), 201);
});

export const update = handler({ params: idParamsSchema, body: updateUserSchema }, async ({ params, body }, req, res) => {
  sendData(res, await usersService.updateUser(params.id, body, req.auth!, requestContext(req)));
});

export const activate = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await usersService.setUserActive(params.id, true, req.auth!, requestContext(req)));
});

export const deactivate = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await usersService.setUserActive(params.id, false, req.auth!, requestContext(req)));
});
