import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as dashboard from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', authenticate, authorize('dashboard.read'), dashboard.summary);
