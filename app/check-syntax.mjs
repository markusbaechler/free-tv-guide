// Prüft app/dist auf Syntax und APIs, die Chromium ~63 (Tizen 5.0) nicht kennt.
import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// APIs, die erst nach Chromium 63 kamen (Laufzeitfehler statt Syntaxfehler → nur per Muster erkennbar)
const JS_FORBIDDEN = [
  [/\bglobalThis\b/, 'globalThis (Chrome 71)'],
  [/\.flat(Map)?\(/, 'Array.prototype.flat/flatMap (Chrome 69)'],
  [/Object\.fromEntries/, 'Object.fromEntries (Chrome 73)'],
  [/\.replaceAll\(/, 'String.prototype.replaceAll (Chrome 85)'],
  [/\.matchAll\(/, 'String.prototype.matchAll (Chrome 73)'],
  [/Promise\.allSettled|Promise\.any/, 'Promise.allSettled/any (Chrome 76/85)'],
  [/\.trimStart\(|\.trimEnd\(/, 'trimStart/trimEnd (Chrome 66)'],
  [/structuredClone|queueMicrotask/, 'structuredClone/queueMicrotask'],
  [/\?\.|\?\?/, 'Optional Chaining / Nullish (Chrome 80)'],
];

const CSS_FORBIDDEN = [
  [/(^|[^-\w])gap\s*:/m, 'gap (für Flexbox erst Chrome 84) – grid-gap verwenden'],
  [/(^|[;{\s])inset\s*:/m, 'inset (Chrome 87)'],
  [/aspect-ratio/, 'aspect-ratio (Chrome 88)'],
  [/:focus-visible|:is\(|:where\(|:has\(/, 'neue Pseudoklassen'],
  [/\b(clamp|min|max)\(/, 'CSS clamp()/min()/max() (Chrome 79)'],
  [/@container|@layer/, '@container/@layer'],
];

/** Kommentare und Strings entfernen, damit Muster nicht in Texten anschlagen */
function stripJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""');
}

export function checkDist(dist) {
  const problems = [];
  const js = readFileSync(join(dist, 'app.js'), 'utf8');
  try {
    parse(js, { ecmaVersion: 2017, sourceType: 'script' });
  } catch (e) {
    problems.push(`app.js ist kein gültiges ES2017: ${e.message}`);
  }
  const code = stripJs(js);
  for (const [re, label] of JS_FORBIDDEN) if (re.test(code)) problems.push(`app.js: ${label}`);
  if (/^\s*(import|export)\s/m.test(code)) problems.push('app.js: ES-Module im Output');

  const css = readFileSync(join(dist, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [re, label] of CSS_FORBIDDEN) if (re.test(css)) problems.push(`style.css: ${label}`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkDist(process.argv[2] || 'app/dist');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Syntax-Prüfung bestanden.');
}
