// Applies planned Prisma 8 migrations (migrations/app/*) to DATABASE_URL.
// New migrations are planned with: npx prisma migration plan --name <slug>
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['prisma', 'db', 'migrate', '--db', url, '--yes', '--no-interactive'],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
