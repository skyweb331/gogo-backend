import crypto from 'node:crypto';
import { Service } from 'typedi';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';

import type { Context } from '#src/context.js';
import { isStaff } from '#src/authChecker.js';
import { type UserRow } from '#src/service/prisma.js';
import { MailerService } from '#src/service/mailer.js';
import { RateLimiterService } from '#src/service/rateLimiter.js';
import { sha256, verifyPassword } from '#src/utils/auth.js';
import { AppError } from '#src/utils/errors.js';

import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';

import { UserService } from './user.service.js';
import type { TotpSetup } from './user.type.js';

const MINUTE = 60_000;
const CUSTOMER_ISSUER = 'NxPay';
const BACKUP_CODE_COUNT = 10;
/** Crockford base32, as in transaction references. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type SecondFactor = 'totp' | 'backup';

const newBackupCode = () => {
  let code = '';
  for (const byte of crypto.randomBytes(10)) code += ALPHABET[byte & 31];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
};

const normalizeBackupCode = (code: string) =>
  code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');

const backupHashes = (user: UserRow): string[] =>
  Array.isArray(user.totpBackupCodes) ? (user.totpBackupCodes as string[]) : [];

/** Authenticator-app 2FA for customers. Staff use the mandatory flow in `AuthService`. */
@Service()
export class TwoFactorService {
  constructor(
    private readonly users: UserService,
    private readonly mailer: MailerService,
    private readonly limiter: RateLimiterService,
    private readonly audit: AuditLogService
  ) {}

  async checkTotp(secret: string | null, code: string) {
    if (!secret || !/^\d{6}$/.test(code)) return false;
    const result = await verifyTotp({ secret, token: code, epochTolerance: 30 });
    return result.valid;
  }

  backupCodesRemaining(user: UserRow) {
    return backupHashes(user).length;
  }

  /**
   * Accepts a 6-digit authenticator code or an unused backup code, which is then spent.
   * Callers apply their own rate limit.
   */
  async verify(user: UserRow, code: string): Promise<SecondFactor | null> {
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      return (await this.checkTotp(user.totpSecret, trimmed)) ? 'totp' : null;
    }
    const hash = sha256(normalizeBackupCode(trimmed));
    const hashes = backupHashes(user);
    if (!hashes.includes(hash)) return null;
    await this.users.updateUser(user.id, {
      totpBackupCodes: hashes.filter((h) => h !== hash),
    });
    return 'backup';
  }

  private async issueBackupCodes(userId: string) {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
    await this.users.updateUser(userId, {
      totpBackupCodes: codes.map((c) => sha256(normalizeBackupCode(c))),
    });
    return codes;
  }

  private assertCustomer(user: UserRow) {
    if (isStaff(user.role)) throw new AppError('Staff two-factor is managed in the admin console');
  }

  private async assertPassword(user: UserRow, password: string) {
    this.limiter.consume(`reauth:${user.id}`, 10, 60 * MINUTE);
    if (!(await verifyPassword(password, user.password))) {
      throw new AppError('Password is incorrect', { field: 'password' });
    }
  }

  private async assertCode(user: UserRow, code: string) {
    this.limiter.consume(`totp:${user.id}`, 6, 5 * MINUTE);
    const factor = await this.verify(user, code);
    if (!factor) throw new AppError('Invalid authentication code', { field: 'code' });
    this.limiter.reset(`totp:${user.id}`);
    return factor;
  }

  /** Step 1: a new secret, kept unused until `enable` proves the app has it. */
  async beginSetup(user: UserRow, password: string): Promise<TotpSetup> {
    this.assertCustomer(user);
    if (user.totpEnabled) throw new AppError('Two-factor authentication is already on');
    await this.assertPassword(user, password);
    const secret = generateSecret();
    await this.users.updateUser(user.id, { totpSecret: secret });
    return {
      secret,
      otpauthUrl: generateURI({ issuer: CUSTOMER_ISSUER, label: user.email, secret }),
    };
  }

  /** Step 2: confirms the first code and returns backup codes, shown once. */
  async enable(user: UserRow, code: string, ctx: Context) {
    this.assertCustomer(user);
    if (user.totpEnabled) throw new AppError('Two-factor authentication is already on');
    this.limiter.consume(`totp:${user.id}`, 6, 5 * MINUTE);
    if (!(await this.checkTotp(user.totpSecret, code.trim()))) {
      throw new AppError('Invalid authentication code', { field: 'code' });
    }
    this.limiter.reset(`totp:${user.id}`);

    await this.users.updateUser(user.id, { totpEnabled: true });
    const codes = await this.issueBackupCodes(user.id);
    await this.audit.log(ctx, { action: 'user.totpEnabled', entity: 'User', entityId: user.id });
    this.notify(user, 'Two-factor authentication turned on');
    return codes;
  }

  async regenerateBackupCodes(user: UserRow, code: string, ctx: Context) {
    this.assertCustomer(user);
    if (!user.totpEnabled) throw new AppError('Two-factor authentication is off');
    await this.assertCode(user, code);
    const codes = await this.issueBackupCodes(user.id);
    await this.audit.log(ctx, {
      action: 'user.totpBackupCodesRegenerated',
      entity: 'User',
      entityId: user.id,
    });
    this.notify(user, 'New two-factor backup codes created');
    return codes;
  }

  async disable(user: UserRow, password: string, code: string, ctx: Context) {
    this.assertCustomer(user);
    if (!user.totpEnabled) throw new AppError('Two-factor authentication is off');
    await this.assertPassword(user, password);
    await this.assertCode(user, code);
    const updated = await this.clear(user.id);
    await this.audit.log(ctx, { action: 'user.totpDisabled', entity: 'User', entityId: user.id });
    this.notify(user, 'Two-factor authentication turned off');
    return updated;
  }

  /** Support: the customer lost their phone and their backup codes. */
  async adminReset(user: UserRow, ctx: Context) {
    this.assertCustomer(user);
    const updated = await this.clear(user.id);
    await this.audit.log(ctx, { action: 'customer.resetTotp', entity: 'User', entityId: user.id });
    this.notify(user, 'Two-factor authentication turned off by NxPay support');
    return updated;
  }

  private clear(userId: string) {
    return this.users.updateUser(userId, {
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: null,
    });
  }

  private notify(user: UserRow, change: string) {
    this.mailer.sendSafe({
      to: user.email,
      subject: change,
      template: 'security-alert',
      locals: { name: user.name, change },
    });
  }
}
