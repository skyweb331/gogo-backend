import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { config } from '#src/config.js';

export interface AccessTokenPayload {
  /** User UUID; an integer in tokens issued before the UUID switch (see `legacyIdOf`). */
  id: string | number;
  /** Bumped when the password changes, invalidating older tokens. */
  pv: number;
  /** Admin session that has passed TOTP. */
  mfa?: boolean;
}

export const createAccessToken = (payload: AccessTokenPayload) => {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, config.JWT_SECRET) as unknown as AccessTokenPayload;
};

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 12);
};

export const verifyPassword = async (password: string, hashedPassword: string) => {
  return bcrypt.compare(password, hashedPassword);
};

/** Short-lived token for the second step of an admin login (TOTP). */
export const createMfaChallengeToken = (userId: string) =>
  jwt.sign({ id: userId, purpose: 'mfa' }, config.JWT_SECRET, { expiresIn: '5m' });

export const verifyMfaChallengeToken = (token: string): string | number => {
  const payload = jwt.verify(token, config.JWT_SECRET) as { id: string | number; purpose?: string };
  if (payload.purpose !== 'mfa') throw new Error('Invalid token');
  return payload.id;
};

/** Numeric one-time code (email OTP). */
export const generateOtp = (digits = 6) =>
  crypto
    .randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');

/** Opaque URL-safe token (password reset links). */
export const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Password version derived from the stored hash, so tokens die when the password changes. */
export const passwordVersion = (hashedPassword: string) =>
  parseInt(sha256(hashedPassword).slice(0, 8), 16);
