import { type AuthChecker } from 'type-graphql';

import { type Context } from './context.js';
import { UserRole } from './graphql/enum.js';

export const isStaff = (role?: string) => role === UserRole.Admin || role === UserRole.Support;

/**
 * - `@Authorized()`: any signed-in user (staff included before TOTP, so 2FA setup works).
 * - `@Authorized([UserRole.Customer])`: customers only. Staff never pass, which keeps
 *   wallet key export/removal out of reach for Admin and Support.
 * - `@Authorized([UserRole.Support])`: Support and Admin.
 * - `@Authorized([UserRole.Admin])`: Admin only.
 * Staff roles must have passed TOTP (`mfa` claim) for any role-restricted field.
 */
export const authChecker: AuthChecker<Context> = async ({ context: { user, mfa } }, roles) => {
  try {
    // Check user
    if (!user) {
      // No user, restrict access
      return false;
    }

    // Check '@Authorized()'
    if (roles.length === 0) {
      // Only authentication required
      return true;
    }

    if (isStaff(user.role) && !mfa) {
      return false;
    }

    if (roles.includes(user.role)) {
      return true;
    }

    // Admin can do everything Support can
    if (user.role === UserRole.Admin && roles.includes(UserRole.Support)) {
      return true;
    }

    return false;
  } catch (err) {
    throw new Error('Not authenticated');
  }
};
