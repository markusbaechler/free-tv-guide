// Erzeugt eine eigenständige Vorschau-Seite (eine HTML-Datei) mit eingebettetem Datenstand,
// skaliert auf jede Fenstergrösse. Aufruf: node app/build-preview.mjs <datenordner> <ausgabe.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dataDir, out] = process.argv.slice(2);
const dist = new URL('./dist/', import.meta.url).pathname;
const read = (f) => readFileSync(join(dist, f), 'utf8');
const json = (f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'));

const data = {
  events: json('events.json').events,
  channels: json('channels.json').channels,
  epg: json('epg.json').channels,
  meta: json('meta.json'),
};

// App-CSS: Seitengrösse gilt hier für die TV-Bühne statt für html/body
const appCss = read('style.css').replace('html, body {', '.tv {').replace(/\n\s*margin: 0;\n(\s*width: 1920px;)/, '\n$1');
const body = read('index.html').match(/<body>([\s\S]*?)<script src="app.js"><\/script>/)[1];
const stand = new Date(data.meta.generatedAt).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

const html = `<title>Free-TV Guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Vorschau-Rahmen: die TV-Oberfläche (1920×1080) wird auf die Fensterbreite skaliert. Bewusst nur dunkel wie am TV. */
:root { color-scheme: dark; --page: #071a33; --page-ink: #c9d6e6; --page-key: #f3f7fc; }
html, body { height: 100%; }
body { background: var(--page); color: var(--page-ink); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
.frame { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 12px; }
.help { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 14px; margin: 0 0 10px; }
.help b { color: var(--page-key); font-weight: 600; }
.stage { position: relative; width: 100%; overflow: hidden; border-radius: 6px; }
.stage .tv { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.stage:focus-within, .stage:focus { outline: 2px solid #ffc928; outline-offset: 3px; }
${appCss}
</style>
<div class="frame">
  <p class="help"><span><b>Pfeiltasten</b> bewegen</span><span><b>Enter</b> = OK</span><span><b>Backspace</b> = Zurück</span><span><b>1–4</b> = Farbtasten rot, grün, gelb, blau</span><span>Vorschau mit Datenstand ${stand}. Apps öffnen geht nur am Fernseher.</span></p>
  <div class="stage" id="stage" tabindex="0"><div class="tv">${body}</div></div>
</div>
<script>window.__FTG_DATA__ = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script>
(function () {
  var stage = document.getElementById('stage');
  var tv = stage.querySelector('.tv');
  function fit() {
    var w = stage.clientWidth;
    var maxH = window.innerHeight - stage.getBoundingClientRect().top - 12;
    var s = Math.min(w / 1920, Math.max(maxH, 200) / 1080);
    tv.style.transform = 'scale(' + s + ')';
    stage.style.height = Math.round(1080 * s) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();
  stage.focus();
})();
</script>
<script>${read('app.js').replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync(out, html);
console.log('Vorschau geschrieben:', out, (html.length / 1024).toFixed(0) + ' KB');
