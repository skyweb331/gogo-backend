# gogo-backend

GraphQL API for GOGO: Bridge virtual accounts (USD over ACH, EUR over SEPA), conversion to
USDC/EURC, tiered monthly fees and payouts to the customer's wallet.

Stack: Node 22 (ESM), Express 5, Apollo Server 5, type-graphql, typedi, Prisma 8 (release candidate)
on Postgres, pg-boss for jobs, pug + AWS SES for email.

## Requirements

- Node `22.22.3` (`nvm use`)
- Postgres 18 (`brew install postgresql@18`, or the local Docker setup)

## Run without Docker

```bash
nvm use
createdb gogo                    # or use any Postgres 18 database
cp .env.example .env             # fill in DATABASE_URL, JWT_SECRET, BRIDGE_API_KEY ...
npm run keys:generate            # paste the output into WALLET_MASTER_KEYS (development only)
npm ci
npm run db:migrate
npm run db:seed
npm run dev                      # http://localhost:4000/graphql
```

## Scripts

| Script                | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `npm run dev`         | `tsc --watch` + `node --watch` on `dist/`                                 |
| `npm run build`       | Compile to `dist/` and copy email templates                               |
| `npm start`           | Run the compiled server                                                   |
| `npm run typecheck`   | Type-check only                                                           |
| `npm run db:contract` | Re-emit `prisma/contract.json` + `contract.d.ts` from `prisma/schema.prisma` |
| `npm run db:migrate`  | Apply planned migrations to `DATABASE_URL`                                |
| `npm run db:seed`     | Create the super admin and the first fee schedule (idempotent)            |
| `npm run keys:generate` | Print a new random wallet master key (`v1:<base64>`)                    |
| `npm run keys:rewrap` | Re-wrap every wallet data key with `WALLET_MASTER_KEY_CURRENT`            |

## Changing the database schema (Prisma 8)

1. Edit `prisma/schema.prisma`.
2. `npm run db:contract` to re-emit the contract.
3. `npx prisma migration plan --name <slug>` to write a migration under `migrations/app/`.
4. `npm run db:migrate` to apply it.

Prisma Studio is not part of the Prisma 8 CLI; use any Postgres GUI.

### Prisma 8 working notes (verified on 8.0.0-rc.14 / CLI rc.20)

- `prisma.config.ts` sets `output: './prisma'` so the contract emits as `prisma/contract.json` +
  `prisma/contract.d.ts` next to `schema.prisma`. Migrations live in `prisma/migrations/app/`.
- Timestamps use `TimestamptzJsDate(3) @default(now())` and `temporal.updatedAtJsDate()`, which read
  and write JavaScript `Date` (no Temporal polyfill needed at runtime). `DateTime` maps to Temporal.
- `Jsonb` for JSON columns (`Json` maps to plain `json`), `Bytes` reads back as `Uint8Array`,
  `BigInt` reads back as `bigint`.
- Enums: `enum x { @@type("pg/text@1") A = "A" }` (text column plus a generated CHECK constraint).
- **`collection.where(...).update()` / `.delete()` touch a single row.** Use `updateAll`,
  `deleteAll`, `updateAndCount` or `deleteAndCount` for multi-row writes.
- An `update` whose `where` matches nothing returns `null` (used for optimistic version locks).
- Raw SQL: ``db.raw.sql`...`.returnsRow({ col: 'pg/bool@1' }).build()`` and run it with
  `tx.query(plan)` inside `db.transaction(...)`; `pg_advisory_xact_lock` works this way.
- Constraint errors are `SqlQueryError` instances with `sqlState` (`23505` unique, `23503` foreign
  key, `23514` check) and `constraint`; `formatError` maps them.

## GraphQL schema for the frontends

In development the server writes `schema.graphql` to the repo root on startup. The frontends run
`npm run codegen` against that file.

## Wallet master keys

Generated customer wallet keys are sealed with AES-256-GCM using a random data key, which is wrapped
with a versioned master key.

- Production: `WALLET_MASTER_KEYS_FILE` points at a secret file with one `version:base64` per line.
  Inline `WALLET_MASTER_KEYS` is refused when `NODE_ENV=production`.
- `WALLET_MASTER_KEY_CURRENT` selects the version used for new wallets.
- The server decrypts a canary row per version on startup and refuses to start if a key is wrong or
  missing.
- Rotation: add the new version to the key file, set it as current, run `npm run keys:rewrap`,
  then remove the old version.
- **Back up the master key offline (two copies, stored apart from DB backups).** Losing it makes
  every stored wallet key unrecoverable.

## Notes

- `dotenv-expand` is pinned to 13.0.0 rather than 1000.0.0: the 1000.x line adds command
  substitution and encrypted values, which we don't want evaluated from env files.
- Prisma 8 is a release candidate. Upgrade deliberately: read the release notes, run
  `npm run typecheck` and a manual sandbox run-through.
