import { Router } from 'express';
import { PERMISSIONS } from '../../common/auth/permissions';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { handler, sendData } from '../../common/http/handler';

export const rolesRouter = Router();

/** Permission catalogue (used by the role editor). Role CRUD is added in Phase 3. */
rolesRouter.get(
  '/permissions',
  authenticate,
  authorize('roles.read'),
  handler({}, (_input, _req, res) => {
    sendData(
      res,
      Object.entries(PERMISSIONS).map(([key, p]) => ({ key, module: p.module, description: p.description })),
    );
  }),
);
