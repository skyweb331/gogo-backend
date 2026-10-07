import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (): string {
  return this.toString();
};

/**
 * Initialize environment variables.
 *
 * Files on the left have more priority than files on the right:
 * .env.${NODE_ENV}.local, .env.${NODE_ENV}, .env.local, .env
 *
 * Variables already present in process.env (Docker env_file, the host) always win.
 */
const NODE_ENV = process.env.NODE_ENV || 'development';

const envPath = path.resolve(process.cwd(), '.env');

const dotenvFiles = [
  `${envPath}.${NODE_ENV}.local`,
  `${envPath}.${NODE_ENV}`,
  NODE_ENV !== 'test' && `${envPath}.local`,
  envPath,
].filter(Boolean) as string[];

dotenvFiles.forEach((dotenvFile) => {
  if (fs.existsSync(dotenvFile)) {
    dotenvExpand.expand(dotenv.config({ path: dotenvFile, quiet: true }));
  }
});
