import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pug from 'pug';
import { Service } from 'typedi';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

import { config, isProduction } from '#src/config.js';

const TEMPLATE_DIR = fileURLToPath(new URL('../templates/email/', import.meta.url));

/** Gmail and Outlook do not render SVG, so the logo is a PNG attached inline. */
const LOGO_CID = 'nxpay-logo';
let logoPng: Promise<Buffer> | undefined;
const loadLogo = () => (logoPng ??= fs.readFile(path.join(TEMPLATE_DIR, 'assets/logo.png')));

export type EmailTemplate =
  | 'verify-email'
  | 'password-reset'
  | 'staff-invite'
  | 'otp'
  | 'wallet-alert'
  | 'wallet-key-exported'
  | 'kyc-approved'
  | 'kyc-rejected'
  | 'deposit-received'
  | 'payout-completed'
  | 'payout-failed'
  | 'fee-schedule-published'
  | 'support-reply'
  | 'ops-alert';

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: EmailTemplate;
  locals?: Record<string, unknown>;
}

const htmlToText = (html: string) =>
  html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

/**
 * Transactional email.
 * - `MAIL_TRANSPORT=ses`: AWS SES v2 (the only AWS service NxPay uses).
 * - `MAIL_TRANSPORT=log`: prints the email and writes the HTML to `tmp/mail/` (local only).
 */
@Service()
export class MailerService {
  private readonly templates = new Map<string, pug.compileTemplate>();
  private ses?: SESv2Client;

  assertConfigured() {
    if (isProduction && config.MAIL_TRANSPORT !== 'ses') {
      throw new Error('MAIL_TRANSPORT=log is not allowed in production');
    }
  }

  private render(template: EmailTemplate, locals: Record<string, unknown>) {
    let fn = this.templates.get(template);
    if (!fn) {
      fn = pug.compileFile(path.join(TEMPLATE_DIR, `${template}.pug`), { basedir: TEMPLATE_DIR });
      if (isProduction) this.templates.set(template, fn);
    }
    return fn({
      appName: 'NxPay',
      frontendUrl: config.FRONTEND_URL,
      adminUrl: config.ADMIN_URL,
      logoCid: LOGO_CID,
      year: new Date().getUTCFullYear(),
      ...locals,
    });
  }

  async send({ to, subject, template, locals = {} }: SendEmailOptions): Promise<void> {
    const html = this.render(template, { subject, ...locals });
    const text = htmlToText(html);
    const logo = await loadLogo();

    if (config.MAIL_TRANSPORT === 'log') {
      const dir = path.resolve(process.cwd(), 'tmp/mail');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${template}.html`);
      await fs.writeFile(
        file,
        html.replaceAll(`cid:${LOGO_CID}`, `data:image/png;base64,${logo.toString('base64')}`)
      );
      console.log(
        `[mail] to=${to} subject="${subject}" template=${template} file=${path.relative(process.cwd(), file)}\n${text}\n`
      );
      return;
    }

    this.ses ??= new SESv2Client({
      region: config.AWS_REGION,
      ...(config.AWS_ACCESS_KEY_ID && {
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        },
      }),
    });

    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: config.MAIL_FROM,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              Text: { Data: text, Charset: 'UTF-8' },
            },
            Attachments: [
              {
                RawContent: logo,
                FileName: 'nxpay-logo.png',
                ContentType: 'image/png',
                ContentDisposition: 'INLINE',
                ContentId: LOGO_CID,
              },
            ],
          },
        },
      })
    );
  }

  /** Fire-and-forget variant: email failures never fail the caller. */
  sendSafe(options: SendEmailOptions) {
    this.send(options).catch((error) => {
      console.error(`[mail] failed to send ${options.template} to ${options.to}`, error);
    });
  }

  opsAlert(subject: string, lines: string[]) {
    this.sendSafe({
      to: config.OPS_ALERT_EMAIL,
      subject: `[NxPay ops] ${subject}`,
      template: 'ops-alert',
      locals: { lines },
    });
  }
}
