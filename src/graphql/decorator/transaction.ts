import { createMethodMiddlewareDecorator } from 'type-graphql';

import type { Context } from '#src/context.js';

export function Transaction() {
  return createMethodMiddlewareDecorator<Context>(async ({ context }, next) => {
    return context.prisma.transaction(async () => {
      const res = await next();
      return res;
    });
  });
}
