import type { Request, Response } from 'express';
import { Container } from 'typedi';

import { passwordVersion, verifyToken } from '#src/utils/auth.js';

import RootDataLoader from '#src/graphql/loader/index.js';
import { PrismaService, type CustomerRow, type UserRow } from '#src/service/prisma.js';
import { UserRole } from '#src/graphql/enum.js';

export interface Context {
  user?: UserRow;
  /** Set for users with the Customer role */
  customer?: CustomerRow | null;
  /** Staff session that passed TOTP */
  mfa: boolean;
  prisma: PrismaService;
  req: Request;
  res: Response;
  ip: string;
  dataLoader: RootDataLoader;
  [key: string]: any;
}

export const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? '';

export const context = async ({ req, res }: { req: Request; res: Response }): Promise<Context> => {
  const prisma = Container.get(PrismaService);
  const token = req.headers.authorization?.split(' ')[1];

  let user: UserRow | undefined;
  let customer: CustomerRow | null | undefined;
  let mfa = false;

  if (token) {
    try {
      const payload = verifyToken(token);
      const row = await prisma.orm.User.where({ id: payload.id }).first();
      // Tokens die with the account or a password change
      if (row && !row.deletedAt && passwordVersion(row.password) === payload.pv) {
        user = row;
        mfa = payload.mfa === true;
        if (row.role === UserRole.Customer) {
          customer = await prisma.orm.Customer.where({ userId: row.id }).first();
        }
      }
    } catch {
      // Invalid or expired token: treat as anonymous, authChecker rejects protected fields
    }
  }

  return {
    user,
    customer,
    mfa,
    req,
    res,
    ip: clientIp(req),
    prisma,
    dataLoader: new RootDataLoader(prisma, {}),
  };
};
