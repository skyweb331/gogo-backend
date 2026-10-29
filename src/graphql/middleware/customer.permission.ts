import type { MiddlewareFn } from 'type-graphql';

import type { Context } from '#src/context.js';
import { isStaff } from '#src/authChecker.js';
import { CustomerStatus } from '#src/graphql/enum.js';
import { ForbiddenError } from '#src/utils/errors.js';

/**
 * List queries: for non-staff users, force `filter.customerId = ctx.customer.id`
 * (same role as limelite's OrganizationPermission). Staff keep their filter.
 */
export const CustomerScope: MiddlewareFn<Context> = async ({ args, context }, next) => {
  const { user, customer } = context;
  if (!user) throw new ForbiddenError();
  if (isStaff(user.role)) return next();
  if (!customer) throw new ForbiddenError('Customer profile not found');

  args['filter'] = { ...(args['filter'] ?? {}), customerId: customer.id };
  return next();
};

/** Requires a customer profile on the context; blocks suspended accounts. */
export const RequireCustomer: MiddlewareFn<Context> = async ({ context }, next) => {
  if (!context.customer) throw new ForbiddenError('Customer profile not found');
  if (context.customer.status === CustomerStatus.Suspended) {
    throw new ForbiddenError('Your account is suspended. Please contact support.');
  }
  return next();
};

/** Requires a fully onboarded (Active) customer. */
export const RequireActiveCustomer: MiddlewareFn<Context> = async ({ context }, next) => {
  if (!context.customer) throw new ForbiddenError('Customer profile not found');
  if (context.customer.status !== CustomerStatus.Active) {
    throw new ForbiddenError(
      context.customer.status === CustomerStatus.Suspended
        ? 'Your account is suspended. Please contact support.'
        : 'Please complete onboarding first'
    );
  }
  return next();
};

/** Field middleware: staff-only fields resolve to null for everyone else instead of erroring. */
export const StaffOnlyField: MiddlewareFn<Context> = async ({ context }, next) => {
  if (!context.user || !isStaff(context.user.role) || !context.mfa) return null;
  return next();
};

/** Ensures a record loaded by id belongs to the caller (staff bypass). */
export function assertOwnership(
  context: Context,
  record: { customerId: string } | null | undefined
) {
  if (!record) return;
  if (context.user && isStaff(context.user.role)) return;
  if (!context.customer || record.customerId !== context.customer.id) {
    throw new ForbiddenError('Not allowed');
  }
}
