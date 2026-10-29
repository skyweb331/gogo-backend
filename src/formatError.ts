import * as Sentry from '@sentry/node';
import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';

import { isProduction } from '#src/config.js';
import { AppError, isSqlQueryError } from '#src/utils/errors.js';

// Unique violations (23505) by constraint name.
// `path` is used by the frontends to attach the message to a form field.
const UNIQUE_MESSAGES: Record<string, { message: string; path?: string[] }> = {
  users_email_key: { message: 'Email already exists', path: ['email'] },
  wallets_customerId_chain_address_key: {
    message: 'This wallet address is already added',
    path: ['address'],
  },
  wallets_one_generated_per_chain: { message: 'A generated wallet already exists for this chain' },
  fee_schedules_one_per_period: {
    message: 'A fee schedule is already published for this month',
    path: ['effectivePeriod'],
  },
  fee_tiers_feeScheduleId_position_key: { message: 'Duplicate tier position', path: ['tiers'] },
  customers_userId_key: { message: 'Customer profile already exists' },
};

// Foreign key violations (23503) by table
const FOREIGN_KEY_MESSAGES: Record<string, string> = {
  customers: 'Customer can not be deleted. It has related records',
  users: 'User can not be deleted. It has related records',
  custodial_wallets: 'Custodial wallet is used by virtual accounts',
  fee_schedules: 'Fee schedule is used by transactions',
};

// Never echo secrets back, even inside error messages
const SECRET_PATTERN = /(0x[0-9a-fA-F]{64})|([1-9A-HJ-NP-Za-km-z]{80,90})/g;
const redact = (message: string) => message.replace(SECRET_PATTERN, '[redacted]');

export const formatError = (
  formattedError: GraphQLFormattedError,
  error: unknown
): GraphQLFormattedError => {
  const originalError = unwrapResolverError(error);

  if (originalError instanceof AppError) {
    return {
      message: redact(originalError.message),
      // Important as frontend will use this field to display error stats on form field
      // Original path concept is to show path for graphql query, but we can use it for form field path
      path: originalError.field ? [originalError.field] : formattedError.path,
      extensions: { code: originalError.extensions['code'] },
    };
  }

  if (isSqlQueryError(originalError)) {
    if (originalError.sqlState === '23505') {
      const known = originalError.constraint && UNIQUE_MESSAGES[originalError.constraint];
      if (known) {
        return { message: known.message, path: known.path, extensions: { code: 'CONFLICT' } };
      }
      return { message: 'Record already exists', extensions: { code: 'CONFLICT' } };
    }

    // For foreign key constraint errors, we can provide a more user-friendly message
    if (originalError.sqlState === '23503') {
      const message =
        (originalError.table && FOREIGN_KEY_MESSAGES[originalError.table]) ||
        'Related record not found or still in use';
      return { message, extensions: { code: 'CONFLICT' } };
    }

    if (originalError.sqlState === '23514') {
      return { message: 'Invalid value', extensions: { code: 'BAD_USER_INPUT' } };
    }

    // Malformed id (not a UUID) in an argument or filter
    if (originalError.sqlState === '22P02') {
      return { message: 'Record not found', extensions: { code: 'NOT_FOUND' } };
    }
  }

  // class-validator input errors: first message, field as path (limelite form convention)
  const validationErrors =
    (originalError as { validationErrors?: unknown[] })?.validationErrors ??
    (formattedError.extensions?.['validationErrors'] as unknown[] | undefined);
  if (Array.isArray(validationErrors) && validationErrors.length) {
    let first = validationErrors[0] as {
      property: string;
      constraints?: Record<string, string>;
      children?: unknown[];
    };
    while (!first.constraints && first.children?.length) {
      first = first.children[0] as typeof first;
    }
    const message = first.constraints ? Object.values(first.constraints)[0] : 'Invalid input';
    return { message: message!, path: [first.property], extensions: { code: 'BAD_USER_INPUT' } };
  }

  const code = formattedError.extensions?.['code'];

  // GraphQL validation / auth errors are safe to pass through
  if (code && code !== 'INTERNAL_SERVER_ERROR') {
    return { ...formattedError, message: redact(formattedError.message) };
  }

  // Unexpected errors: report and hide details in production
  Sentry.captureException(originalError);
  if (isProduction) {
    return {
      message: 'Something went wrong. Please try again.',
      path: formattedError.path,
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    };
  }
  console.error(originalError);
  return {
    ...formattedError,
    message: redact(formattedError.message),
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
};
