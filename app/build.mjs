// Baut die Tizen-Web-App nach app/dist und prüft die Syntax für Chromium ~63.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDist } from './check-syntax.mjs';

const APP = dirname(fileURLToPath(import.meta.url));
const DIST = join(APP, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

await build({
  entryPoints: [join(APP, 'src', 'main.ts')],
  outfile: join(DIST, 'app.js'),
  bundle: true,
  format: 'iife',
  // es2017 senkt alles Neuere ab (Spread, ?., ??); chrome63 als zusätzliche Grenze
  target: ['es2017', 'chrome63'],
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});

for (const f of ['index.html', 'style.css', 'config.xml', 'icon.png']) {
  copyFileSync(join(APP, f), join(DIST, f));
}

const problems = checkDist(DIST);
if (problems.length) {
  console.error('Syntax-Prüfung fehlgeschlagen:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('app/dist gebaut, Syntax-Prüfung (ES2017 / Chromium 63) bestanden.');
