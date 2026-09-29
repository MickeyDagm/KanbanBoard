import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

/** Outbound email is off until SMTP_HOST is set in backend/.env. */
export function isEmailConfigured(): boolean {
  // Tests never touch a real mail server; suites that need the "configured"
  // path mock this module instead.
  if (env.isTest) return false;
  return Boolean(env.smtp.host);
}

function fromAddress(): string {
  if (env.smtp.from) return env.smtp.from;
  const sender = env.smtp.user || 'no-reply@localhost';
  return `${env.appName} <${sender}>`;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

export interface InviteEmailInput {
  to: string;
  teamName: string;
  inviterName: string;
  role: 'MEMBER' | 'ADMIN';
  url: string;
  expiresAt: Date | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inviteText({ teamName, inviterName, role, url, expiresAt }: InviteEmailInput): string {
  const lines = [
    `${inviterName} invited you to join the team "${teamName}" on ${env.appName} as ${role === 'ADMIN' ? 'an admin' : 'a member'}.`,
    '',
    `Accept the invite: ${url}`,
  ];
  if (expiresAt) lines.push('', `This link expires on ${expiresAt.toUTCString()}.`);
  lines.push('', "If you didn't expect this, you can ignore this email.");
  return lines.join('\n');
}

function inviteHtml(input: InviteEmailInput): string {
  const { teamName, inviterName, role, url, expiresAt } = input;
  const roleLabel = role === 'ADMIN' ? 'Admin' : 'Member';
  const expires = expiresAt
    ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b;">This link expires on ${escapeHtml(
        expiresAt.toUTCString()
      )}.</p>`
    : '';
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;" cellpadding="0" cellspacing="0">
          <tr><td style="padding:28px 32px;">
            <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(env.appName)}</p>
            <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">You've been invited to ${escapeHtml(teamName)}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">
              <strong>${escapeHtml(inviterName)}</strong> invited you to join the team as
              <strong>${roleLabel}</strong>.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
              <tr>
                <td style="background:#2563eb;border-radius:8px;">
                  <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Accept invitation</a>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b;word-break:break-all;">
              Or copy this link into your browser:<br>${escapeHtml(url)}
            </p>
            ${expires}
          </td>
        </tr>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Sends an invite link by email. Throws when SMTP is not configured or the
 * transport fails — callers decide how to surface it.
 */
export async function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('SMTP is not configured (SMTP_HOST is empty)');
  }
  const sendTask = getTransporter().sendMail({
    from: fromAddress(),
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.teamName} on ${env.appName}`,
    text: inviteText(input),
    html: inviteHtml(input),
  });
  const timeoutTask = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Email server timed out after 9 seconds')), 9000)
  );
  await Promise.race([sendTask, timeoutTask]);
}

export interface OtpEmailInput {
  to: string;
  name: string;
  code: string;
  purpose: 'verify' | 'reset' | 'signup';
}

function otpText({ name, code, purpose, to }: OtpEmailInput): string {
  let headline = `Hi ${name}, confirm your email to finish creating your ${env.appName} account.`;
  if (purpose === 'reset') {
    headline = `Hi ${name}, use this code to choose a new ${env.appName} password for ${to}.`;
  } else if (purpose === 'signup') {
    headline = `Hi ${name}, verify your email to create your ${env.appName} account.`;
  }
  return [
    headline,
    '',
    `Your code: ${code}`,
    '',
    `It expires in ${Math.round(env.otp.ttlSeconds / 60)} minutes and can only be used once.`,
    "If you didn't request this, you can ignore this email.",
  ].join('\n');
}

function otpHtml({ name, code, purpose, to }: OtpEmailInput): string {
  let headline = `Confirm your ${escapeHtml(env.appName)} email`;
  let sub = `Hi ${escapeHtml(name)}, enter this code to finish creating your account.`;

  if (purpose === 'reset') {
    headline = `Reset your ${escapeHtml(env.appName)} password`;
    sub = `Hi ${escapeHtml(name)}, enter this code to choose a new password for ${escapeHtml(to)}.`;
  } else if (purpose === 'signup') {
    headline = `Verify your email for ${escapeHtml(env.appName)}`;
    sub = `Hi ${escapeHtml(name)}, enter this 6-digit code to complete creating your account.`;
  }

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;" cellpadding="0" cellspacing="0">
          <tr><td style="padding:28px 32px;">
            <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(env.appName)}</p>
            <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${headline}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">${sub}</p>
            <p style="margin:24px 0 0;font-size:34px;letter-spacing:.35em;font-weight:700;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;">${escapeHtml(code)}</p>
            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
              This code expires in ${Math.round(env.otp.ttlSeconds / 60)} minutes and can only be used once.
              If you didn't request it, you can ignore this email.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Sends a one-time code (email verification / password reset / signup). */
export async function sendOtpEmail(input: OtpEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('SMTP is not configured (SMTP_HOST is empty)');
  }
  const subject =
    input.purpose === 'reset'
      ? `${input.code} is your ${env.appName} password reset code`
      : `${input.code} is your ${env.appName} verification code`;

  const sendTask = getTransporter().sendMail({
    from: fromAddress(),
    to: input.to,
    subject,
    text: otpText(input),
    html: otpHtml(input),
  });
  const timeoutTask = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Email server timed out after 9 seconds')), 9000)
  );
  await Promise.race([sendTask, timeoutTask]);
}
