import nodemailer from 'nodemailer';
import { getEnv } from './env';

let transporterPromise = null;

function getEmailConfig() {
  const host = getEnv('SMTP_HOST');
  const port = Number(getEnv('SMTP_PORT') || '587');
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');
  const from = getEnv('SMTP_FROM', 'SMTP_USER');

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  const config = getEmailConfig();
  if (!config) return null;

  transporterPromise = Promise.resolve(
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    })
  );

  return transporterPromise;
}

export async function sendEmail({ to, subject, text, html }) {
  const config = getEmailConfig();
  const transporter = await getTransporter();

  if (!config || !transporter || !to || !subject) {
    return { ok: false, skipped: true, reason: 'email_not_configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });

    return {
      ok: true,
      messageId: info.messageId || '',
    };
  } catch (error) {
    console.error('[Email] Send failed:', error);
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : 'email_send_failed',
    };
  }
}
