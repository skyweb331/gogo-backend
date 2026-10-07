// Dev loop: `tsc --watch` plus `node --watch` on the compiled output.
// tsx / esbuild can't be used because type-graphql needs emitDecoratorMetadata.
import { spawn, spawnSync } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: false });

const initial = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
if (initial.status !== 0) {
  console.error('[dev] initial build failed, watching for fixes...');
}
spawnSync('node', ['scripts/copy-assets.mjs'], { stdio: 'inherit' });

const tsc = run('npx', ['tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput']);
const assets = run('node', ['scripts/copy-assets.mjs', '--watch']);
const server = run('node', [
  '--watch-path=dist/src',
  '--watch-preserve-output',
  '--enable-source-maps',
  'dist/src/index.js',
]);

const children = [tsc, assets, server];
const shutdown = (code = 0) => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
for (const child of children) child.on('exit', (code) => code && code !== 0 && shutdown(code));
