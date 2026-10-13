import 'reflect-metadata';
import './env.js';
import './instrument.js';

import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import {
  ApolloServerPluginInlineTraceDisabled,
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginUsageReportingDisabled,
} from '@apollo/server/plugin/disabled';
import { Kind, type OperationDefinitionNode } from 'graphql';
import { ApolloServer, type ApolloServerPlugin } from '@apollo/server';

import * as tq from 'type-graphql';
import { Container } from 'typedi';

import { config, isProduction } from './config.js';
import { authChecker } from './authChecker.js';
import { type Context, context } from './context.js';
import { formatError } from './formatError.js';
import { GraphQLBigInt } from './graphql/scalar/index.js';
import { assertEnumsMatchContract } from './graphql/enum.js';
import { PrismaService } from './service/prisma.js';
import { resolvers } from './resolvers.js';
import { boot, shutdown } from './boot.js';

/** Every GraphQL response is private and must not be cached (exported keys, balances). */
const noStorePlugin: ApolloServerPlugin<Context> = {
  async requestDidStart() {
    return {
      async willSendResponse({ response }) {
        response.http.headers.set('cache-control', 'no-store');
      },
    };
  },
};

/** Root fields whose responses carry key material. */
const SENSITIVE_FIELDS = new Set(['exportWalletKey']);

const selectsSensitiveField = (operation: OperationDefinitionNode) =>
  operation.selectionSet.selections.some(
    (s) => s.kind === Kind.FIELD && SENSITIVE_FIELDS.has(s.name.value)
  );

/**
 * Exported private keys must never reach Sentry or Apollo traces. Usage reporting and inline
 * traces are disabled outright; for sensitive operations any Sentry event raised while the
 * request runs loses its request data, GraphQL context and breadcrumbs.
 */
const sensitiveOperationPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart() {
    return {
      async didResolveOperation({ operation }) {
        if (!operation || !selectsSensitiveField(operation)) return;
        Sentry.getIsolationScope().addEventProcessor((event) => {
          delete event.request;
          delete event.extra;
          delete event.contexts?.['graphql'];
          event.breadcrumbs = [];
          return event;
        });
      },
    };
  },
};

const app = async () => {
  assertEnumsMatchContract();

  // Required logic for integrating with Express
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Our httpServer handles incoming requests to our Express app.
  // Below, we tell Apollo Server to "drain" this httpServer,
  // enabling our servers to shut down gracefully.
  const httpServer = http.createServer(app);

  const schema = await tq.buildSchema({
    resolvers,
    authChecker,
    scalarsMap: [{ type: BigInt, scalar: GraphQLBigInt }],
    validate: { forbidUnknownValues: false },
    container: Container,
    emitSchemaFile: isProduction ? false : path.resolve(process.cwd(), 'schema.graphql'),
  });

  const server = new ApolloServer<Context>({
    schema,
    formatError,
    introspection: !isProduction,
    includeStacktraceInErrorResponses: !isProduction,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginUsageReportingDisabled(),
      ApolloServerPluginInlineTraceDisabled(),
      noStorePlugin,
      sensitiveOperationPlugin,
      ...(isProduction ? [ApolloServerPluginLandingPageDisabled()] : []),
    ],
  });

  await server.start();
  await boot();

  const allowedOrigins = config.CORS_ORIGINS.length
    ? config.CORS_ORIGINS
    : [config.FRONTEND_URL, config.ADMIN_URL];

  app.use(
    helmet({
      // Apollo Sandbox landing page in development loads remote scripts
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.get('/health', async (_req, res) => {
    try {
      const prisma = Container.get(PrismaService);
      await prisma.orm.AppSetting.limit(1).all();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const { webhookRouter } = await import('./webhook/router.js');
  app.use('/webhooks', webhookRouter);

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: (origin, callback) => {
        // Non-browser clients (no Origin) are allowed; browsers must be on the allowlist
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    express.json({ limit: '1mb' }),
    expressMiddleware(server, { context })
  );

  Sentry.setupExpressErrorHandler(app);

  // Bind IPv4 explicitly. A dual-stack IPv6 listener is not reachable from the
  // Windows host through WSL localhost forwarding.
  await new Promise<void>((resolve) =>
    httpServer.listen({ port: config.PORT, host: '0.0.0.0' }, resolve)
  );
  console.log(`🚀 Server ready at http://localhost:${config.PORT}/graphql`);

  const stop = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref();
    await server.stop();
    await shutdown();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
};

app().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
