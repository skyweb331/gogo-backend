// Copies non-TS assets (pug email templates) from src/ into dist/src/.
import { cpSync, existsSync, mkdirSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';

const assets = [['src/templates', 'dist/src/templates']];

const copyAll = () => {
  for (const [from, to] of assets) {
    if (!existsSync(from)) continue;
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }
};

copyAll();

if (process.argv.includes('--watch')) {
  for (const [from] of assets) {
    if (!existsSync(from)) continue;
    watch(from, { recursive: true }, (_event, file) => {
      if (file) console.log(`[assets] ${join(from, file)} changed`);
      copyAll();
    });
  }
}
