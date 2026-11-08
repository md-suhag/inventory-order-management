import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from '../../config/env';
import { logger } from '../../config/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** In test runs messages are captured here instead of being sent. */
export const sentMessages: MailMessage[] = [];

let transporter: Transporter | undefined;
function getTransporter(): Transporter | undefined {
  if (isTest || !env.SMTP_HOST) return undefined;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (isTest) {
    sentMessages.push(message);
    return;
  }
  const t = getTransporter();
  if (!t) {
    // Development without SMTP: never silently drop; production requires SMTP_HOST (env validation).
    logger.warn({ to: message.to, subject: message.subject }, 'SMTP not configured; email not sent');
    logger.info({ text: message.text }, 'email content (development only)');
    return;
  }
  await t.sendMail({ from: env.MAIL_FROM, ...message });
}
