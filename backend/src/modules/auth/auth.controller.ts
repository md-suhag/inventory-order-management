import { requestContext } from '../../common/audit/audit';
import { handler, sendData } from '../../common/http/handler';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.schemas';
import * as authService from './auth.service';

export const login = handler({ body: loginSchema }, async ({ body }, req, res) => {
  sendData(res, await authService.login(body, requestContext(req, null)));
});

export const refresh = handler({ body: refreshSchema }, async ({ body }, req, res) => {
  sendData(res, await authService.refresh(body.refreshToken, requestContext(req, null)));
});

export const logout = handler({ body: logoutSchema }, async ({ body }, req, res) => {
  await authService.logout(body.refreshToken, requestContext(req, null));
  res.status(204).end();
});

export const logoutAll = handler({}, async (_input, req, res) => {
  await authService.logoutAll(req.auth!.userId, requestContext(req));
  res.status(204).end();
});

export const register = handler({ body: registerSchema }, async ({ body }, req, res) => {
  const user = await authService.register(body, requestContext(req, null));
  sendData(res, { user, message: 'Registration received. An administrator must activate your account.' }, 201);
});

export const forgotPassword = handler({ body: forgotPasswordSchema }, async ({ body }, req, res) => {
  await authService.requestPasswordReset(body.email, requestContext(req, null));
  res.status(202).json({
    data: { message: 'If an active account exists for this email, a password reset link has been sent.' },
  });
});

export const resetPassword = handler({ body: resetPasswordSchema }, async ({ body }, req, res) => {
  await authService.resetPassword(body.token, body.newPassword, requestContext(req, null));
  res.status(204).end();
});

export const me = handler({}, async (_input, req, res) => {
  sendData(res, await authService.getCurrentUser(req.auth!.userId));
});

export const updateProfile = handler({ body: updateProfileSchema }, async ({ body }, req, res) => {
  sendData(res, await authService.updateProfile(req.auth!.userId, body, requestContext(req)));
});

export const changePassword = handler({ body: changePasswordSchema }, async ({ body }, req, res) => {
  sendData(
    res,
    await authService.changePassword(req.auth!.userId, body.currentPassword, body.newPassword, requestContext(req)),
  );
});
