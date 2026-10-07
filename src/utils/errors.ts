import { GraphQLError } from 'graphql';

/**
 * An error whose message is safe to show to the user.
 * `field` becomes the GraphQL error `path` so forms can attach it to an input
 * (same convention as limelite's formatError).
 */
export class AppError extends GraphQLError {
  readonly field?: string;

  constructor(message: string, options: { field?: string; code?: string } = {}) {
    super(message, { extensions: { code: options.code ?? 'BAD_USER_INPUT' } });
    this.field = options.field;
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Record') {
    super(`${what} not found`, { code: 'NOT_FOUND' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(message, { code: 'FORBIDDEN' });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, { code: 'UNAUTHENTICATED' });
  }
}

export interface SqlQueryErrorLike extends Error {
  name: 'SqlQueryError';
  sqlState?: string;
  constraint?: string;
  table?: string;
}

// `SqlQueryError` isn't exported by the @prisma/orm-postgres facade, so match by shape
export const isSqlQueryError = (error: unknown): error is SqlQueryErrorLike =>
  error instanceof Error && error.name === 'SqlQueryError';

/** e.g. `isSqlError(e, '23505')` for a unique violation, optionally on one constraint. */
export const isSqlError = (error: unknown, sqlState: string, constraint?: string) =>
  isSqlQueryError(error) &&
  error.sqlState === sqlState &&
  (constraint === undefined || error.constraint === constraint);

export class RateLimitError extends AppError {
  constructor(message = 'Too many attempts. Please try again later.') {
    super(message, { code: 'RATE_LIMITED' });
  }
}
