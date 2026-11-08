import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authLimiter, passwordResetLimiter } from '../../common/middleware/rate-limit';
import * as auth from './auth.controller';

export const authRouter = Router();

// Public (rate limited)
authRouter.post('/login', authLimiter, auth.login);
authRouter.post('/refresh', authLimiter, auth.refresh);
authRouter.post('/logout', authLimiter, auth.logout);
authRouter.post('/register', authLimiter, auth.register);
authRouter.post('/forgot-password', passwordResetLimiter, auth.forgotPassword);
authRouter.post('/reset-password', authLimiter, auth.resetPassword);

// Authenticated — every user may manage their own account
authRouter.post('/logout-all', authenticate, auth.logoutAll);
authRouter.get('/me', authenticate, auth.me);
authRouter.patch('/me', authenticate, auth.updateProfile);
authRouter.post('/change-password', authenticate, authLimiter, auth.changePassword);
