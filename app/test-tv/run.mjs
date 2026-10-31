// Ende-zu-Ende-Test der TV-Logik im Fernseher-Simulator (Playwright + mock-tizen.js).
// Aufruf: npm run app:build && node app/test-tv/run.mjs   (Daten live aus dem Branch «data»)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
import { createServer } from 'node:http';
import { readFile, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(APP, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0]));
  const file = join(DIST, path === '/' ? 'index.html' : path);
  readFile(file, (e, body) => {
    if (e) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  });
}).listen(0);
const port = server.address().port;

// Tuner-Senderliste wie am QE75Q70R (Auszug) – Namen entsprechen channels.yaml (sat.names)
const CHANNELS = [
  { name: 'SRF 1 HD', major: 1 }, { name: 'SRF zwei HD', major: 2 }, { name: 'SRF info HD', major: 3 },
  { name: 'Das Erste HD', major: 4 }, { name: 'ZDF HD', major: 5 }, { name: 'RTL Television', major: 6 },
  { name: 'SAT.1', major: 7 }, { name: 'ProSieben', major: 8 }, { name: 'VOX', major: 9 }, { name: 'RTLZWEI', major: 10 },
  { name: 'kabel eins', major: 11 }, { name: 'Eurosport 1 Deutschland', major: 12 }, { name: 'SPORT1', major: 13 },
  { name: '3sat HD', major: 14 }, { name: 'arte HD', major: 15 }, { name: 'phoenix HD', major: 16 }, { name: 'DMAX', major: 20 },
  { name: 'ORF1 HD', major: 448 }, { name: 'ServusTV HD Oesterreich', major: 450 }, { name: 'ORF2 HD', major: 1107 },
];
const now = Date.now();
const at = (h) => new Date(now + h * 3600 * 1000).toISOString();
// Programm: Formen wie am TV (detailedDescription + title; Dauer fehlt teils)
const EPG = {
  'Das Erste HD': [
    { title: 'Tagesschau', description: 'Nachrichten', start: at(-0.5), durationSec: 900 },
    { title: 'Sportschau Bundesliga', description: 'Die Spiele des 9. Spieltags', start: at(-0.25) },
    { title: 'Tatort', description: 'Krimi', start: at(1.5) },
  ].concat(
    // 5 Tage Füllprogramm (≈ 40 Einträge) + Bundesliga-Spiel am Tag 3 → nur mit Weiterlesen auffindbar
    Array.from({ length: 40 }, (_, i) => ({ title: i === 25 ? 'Bundesliga: Relegation Hinspiel' : 'Sendung ' + i, description: '', start: at(3 + i * 3) })),
  ),
  'ZDF HD': [{ title: 'heute journal', description: '', start: at(-0.2) }, { title: 'Das aktuelle Sportstudio', description: 'Bundesliga, 9. Spieltag', start: at(2) }],
  'SAT.1': [{ title: 'Promi Big Brother', description: 'Folge 5 Nach der Nominierung lockt eine wilde Halloweenparty', start: at(-1), durationSec: 7200 }],
  'SPORT1': [{ title: 'Bundesliga Pur', description: 'Der Tag', start: at(-0.5) }, { title: 'Darts', description: 'World Grand Prix', start: at(2) }],
  'Eurosport 1 Deutschland': [{ title: 'Snooker', description: 'Live', start: at(-1), durationSec: 10800 }],
  'ServusTV HD Oesterreich': [{ title: 'MotoGP: Grand Prix von Malaysia', description: 'Das Rennen live aus Sepang', start: at(12), durationSec: 7200 }],
  'DMAX': [{ title: 'Steel Buddies', description: '', start: at(-0.3) }],
  'RTL Television': [],
};

const fails = [];
const check = (cond, msg) => (cond ? console.log('  ok   ' + msg) : (fails.push(msg), console.log('  FAIL ' + msg)));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript({ content: `window.__MOCK_CHANNELS__ = ${JSON.stringify(CHANNELS)}; window.__MOCK_EPG__ = ${JSON.stringify(EPG)};` });
await page.addInitScript({ content: readFileSync(join(APP, 'test-tv', 'mock-tizen.js'), 'utf8') });
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(6000); // Daten laden, Tuner lesen, EPG je Sender (30 × ~10 ms)

console.log('Tuner-Diagnose:');
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(500);
const diag = await page.evaluate(() => Array.from(document.querySelectorAll('.channels-view .note')).map((n) => n.innerText).join(' | '));
console.log('  ' + diag.slice(0, 400));
check(/zugeordnet (1[5-9]|2\d|3\d)/.test(diag), 'Sat-Zuordnung ≥ 15 Sender');
check(/Programm von [1-9]\d* Sat-Sendern/.test(diag), 'Programm von > 0 Sat-Sendern');
check(/Sport-Events aus Sat: [1-9]/.test(diag), 'Sport-Events aus Sat > 0');
check(/Regeln: ja/.test(diag), 'Regeln geladen');

console.log('Tab Sender:');
const tileErste = await page.evaluate(() => (document.querySelector('[data-key="ch:daserste"]') || {}).innerText || '');
check(/Sportschau Bundesliga/.test(tileErste), 'Das Erste zeigt laufende Sendung aus Sat-EPG: ' + tileErste.replace(/\n/g, ' | '));
const tileOrf = await page.evaluate(() => (document.querySelector('[data-key="ch:orf1"]') || {}).innerText || '');
check(/Sat · Kanal 448/.test(tileOrf), 'ORF 1 zugeordnet (Kanal 448)');

console.log('Tab Jetzt:');
await page.click('[data-key="tab:live"]');
await page.waitForTimeout(500);
const jetzt = await page.evaluate(() => document.querySelector('.live-view').innerText);
check(/Sport läuft jetzt/.test(jetzt), '«Sport läuft jetzt» vorhanden (Sportschau Bundesliga läuft)');
check(/SPORT1|Sport1/.test(jetzt) && /Bundesliga Pur/.test(jetzt), 'Sport1-Zeile mit Programm');
check(/Promi Big Brother/.test(jetzt), 'Sat.1-Zeile mit Programm');

console.log('Tab Sport:');
await page.click('[data-key="tab:sport"]');
await page.waitForTimeout(300);
await page.click('[data-key="period:week"]');
await page.waitForTimeout(300);
const sport = await page.evaluate(() => document.querySelector('.board').innerText);
if (process.env.DEBUG) console.log(sport);
check(/ServusTV/.test(sport) && /Malaysia/.test(sport), 'MotoGP Malaysia auf ServusTV im Sport-Tab');
check(/Das Erste/.test(sport) && /Sportschau Bundesliga/.test(sport), 'Sportschau Bundesliga (Das Erste) im Sport-Tab');
check(/Relegation Hinspiel/.test(sport), 'Bundesliga-Spiel am Tag 3 gefunden (EPG in Fenstern weitergelesen, 12er-Limit je Abruf)');
check(/Sat-EPG-Einträge: (4[0-9]|[5-9][0-9])/.test(diag), 'EPG-Einträge ≥ 40 trotz 12er-Limit je Abruf: ' + (diag.match(/Sat-EPG-Einträge: \d+/) || [''])[0]);
check(!/Snooker/.test(sport), 'Snooker (keine Zielsportart) nicht im Sport-Tab');

console.log('Tastenlogger:');
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(300);
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.channels-view .note')).map((n) => n.innerText).filter((x) => /^Tasten/.test(x)).join(''));
check(/ArrowRight=39/.test(keys) && /ArrowLeft=37/.test(keys), 'Tastenlogger zeigt Taste=Code: ' + keys.slice(0, 80));

console.log('Sat-Sichtmodus und Zappen:');
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(300);
await page.click('[data-key="ch:daserste"]');
await page.waitForTimeout(800);
let st = await page.evaluate(() => ({ sat: document.documentElement.classList.contains('is-sat'), info: (document.getElementById('sat-info') || {}).innerText || '', log: window.__MOCK_LOG__.slice() }));
check(st.sat, 'App im Sat-Modus (transparent)');
check(/Das Erste/.test(st.info) && /Sportschau/.test(st.info), 'Info-Leiste zeigt Sender und Sendung: ' + st.info.replace(/\n/g, ' | ').slice(0, 120));
check(st.log.some((l) => l === 'tvwindow.show BEHIND') && st.log.some((l) => l === 'tune Das Erste HD'), 'TV-Fenster hinten, dann Tune: ' + st.log.join(', '));
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(900);
st = await page.evaluate(() => ({ info: (document.getElementById('sat-info') || {}).innerText || '', log: window.__MOCK_LOG__.slice() }));
check(/ZDF/.test(st.info) && st.log[st.log.length - 1] === 'tune ZDF HD', 'Runter → ZDF (nächster Favorit): ' + st.log.slice(-2).join(', '));
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(2000); // Entprellung 1,5 s
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(900);
st = await page.evaluate(() => ({ info: (document.getElementById('sat-info') || {}).innerText || '', log: window.__MOCK_LOG__.slice() }));
check(/Sat\.1/.test(st.info), 'Runter, Runter → Sat.1 (RTL übersprungen? nein: RTL ist zugeordnet) – aktuell: ' + st.info.split('\n')[0]);
await page.keyboard.press('Backspace');
await page.waitForTimeout(600);
st = await page.evaluate(() => ({ sat: document.documentElement.classList.contains('is-sat'), log: window.__MOCK_LOG__.slice() }));
check(!st.sat && st.log[st.log.length - 1] === 'tvwindow.hide', 'Zurück schliesst Sat-Modus');

await page.screenshot({ path: '/tmp/tv-sim.png' });
await browser.close();
server.close();
console.log(errors.length ? 'JS-Fehler: ' + errors.join(' / ') : 'Keine JS-Fehler');
if (errors.length) fails.push('JS-Fehler');
console.log(fails.length ? `\n${fails.length} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(fails.length ? 1 : 0);
