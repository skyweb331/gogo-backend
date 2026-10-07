import crypto from 'node:crypto';
import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import { PrismaService, toJson } from '#src/service/prisma.js';
import { OtpPurpose } from '#src/graphql/enum.js';
import { generateOtp, generateToken, sha256 } from '#src/utils/auth.js';
import { AppError } from '#src/utils/errors.js';

const MAX_ATTEMPTS = 5;

const TTL_MINUTES: Record<OtpPurpose, number> = {
  [OtpPurpose.EmailVerify]: 30,
  [OtpPurpose.PasswordReset]: 60,
  [OtpPurpose.WalletKeyExport]: 10,
  [OtpPurpose.WalletChange]: 10,
};

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/**
 * Email OTPs and reset tokens. Only a SHA-256 hash is stored; issuing a new code
 * invalidates earlier unused codes for the same user and purpose.
 */
@Service()
export class OneTimeCodeService {
  constructor(private readonly prisma: PrismaService) {}

  private async invalidate(userId: number, purpose: OtpPurpose) {
    await this.prisma.orm.OneTimeCode.where((c) =>
      and(c.userId.eq(userId), c.purpose.eq(purpose), c.consumedAt.isNull())
    ).updateAll({ consumedAt: new Date() });
  }

  /** 6-digit numeric code (email verification, wallet re-auth). */
  async issueCode(userId: number, purpose: OtpPurpose, meta: Record<string, unknown> = {}) {
    await this.invalidate(userId, purpose);
    const code = generateOtp(6);
    await this.prisma.orm.OneTimeCode.create({
      userId,
      purpose,
      codeHash: sha256(`${purpose}:${userId}:${code}`),
      meta: toJson(meta),
      attempts: 0,
      expiresAt: new Date(Date.now() + TTL_MINUTES[purpose] * 60_000),
    });
    return code;
  }

  /** Opaque link token (password reset). Lookup is by hash, so no user id is needed. */
  async issueToken(userId: number, purpose: OtpPurpose, meta: Record<string, unknown> = {}) {
    await this.invalidate(userId, purpose);
    const token = generateToken(32);
    await this.prisma.orm.OneTimeCode.create({
      userId,
      purpose,
      codeHash: sha256(`${purpose}:${token}`),
      meta: toJson(meta),
      attempts: 0,
      expiresAt: new Date(Date.now() + TTL_MINUTES[purpose] * 60_000),
    });
    return token;
  }

  /**
   * Verifies and consumes a numeric code. `metaMatch` must equal the stored meta values
   * (e.g. the wallet id the code was issued for).
   */
  async consumeCode(
    userId: number,
    purpose: OtpPurpose,
    code: string,
    metaMatch: Record<string, unknown> = {}
  ) {
    const row = await this.prisma.orm.OneTimeCode.where((c) =>
      and(c.userId.eq(userId), c.purpose.eq(purpose), c.consumedAt.isNull())
    )
      .orderBy((c) => c.id.desc())
      .first();

    const invalid = new AppError('Invalid or expired code', { field: 'otp' });
    if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) throw invalid;

    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const metaOk = Object.entries(metaMatch).every(([k, v]) => meta[k] === v);
    const codeOk = safeEqual(row.codeHash, sha256(`${purpose}:${userId}:${code.trim()}`));

    if (!codeOk || !metaOk) {
      await this.prisma.orm.OneTimeCode.where({ id: row.id }).update({
        attempts: row.attempts + 1,
      });
      throw invalid;
    }

    const consumed = await this.prisma.orm.OneTimeCode.where((c) =>
      and(c.id.eq(row.id), c.consumedAt.isNull())
    ).update({ consumedAt: new Date() });
    if (!consumed) throw invalid;
    return meta;
  }

  /** Verifies and consumes a link token; returns the owning user id. */
  async consumeToken(purpose: OtpPurpose, token: string) {
    const row = await this.prisma.orm.OneTimeCode.where({
      codeHash: sha256(`${purpose}:${token.trim()}`),
      purpose,
    }).first();
    const invalid = new AppError('This link is invalid or has expired', { field: 'token' });
    if (!row || row.consumedAt || row.expiresAt < new Date()) throw invalid;

    const consumed = await this.prisma.orm.OneTimeCode.where((c) =>
      and(c.id.eq(row.id), c.consumedAt.isNull())
    ).update({ consumedAt: new Date() });
    if (!consumed) throw invalid;
    return { userId: row.userId, meta: (row.meta ?? {}) as Record<string, unknown> };
  }
}
