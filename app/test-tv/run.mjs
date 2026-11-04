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

// Tuner-Senderliste wie am QE75Q70R (Auszug) – Namen entsprechen channels.yaml (sat.names); tsid = Transponder
// (Zuordnung wie am TV am 1.11.2026 gelesen), scrambled = verschlüsselt (SRG, ORF)
const CHANNELS = [
  { name: 'SRF 1 HD', major: 1, tsid: 12300, scrambled: true }, { name: 'SRF zwei HD', major: 2, tsid: 12300, scrambled: true }, { name: 'SRF info HD', major: 3, tsid: 12300, scrambled: true },
  { name: 'Das Erste HD', major: 4, tsid: 1019 }, { name: 'ZDF HD', major: 5, tsid: 1011 }, { name: 'RTL Television', major: 6, tsid: 1089 },
  { name: 'SAT.1', major: 7, tsid: 1107 }, { name: 'ProSieben', major: 8, tsid: 1107 }, { name: 'VOX', major: 9, tsid: 1089 }, { name: 'RTLZWEI', major: 10, tsid: 1089 },
  { name: 'kabel eins', major: 11, tsid: 1107 }, { name: 'Eurosport 1 Deutschland', major: 12, tsid: 1091 }, { name: 'SPORT1', major: 13, tsid: 33 },
  { name: '3sat HD', major: 14, tsid: 1010 }, { name: 'arte HD', major: 15, tsid: 1019 }, { name: 'phoenix HD', major: 16, tsid: 1025 }, { name: 'DMAX', major: 20, tsid: 33 },
  { name: 'ORF1 HD', major: 448, tsid: 1007, scrambled: true }, { name: 'ServusTV HD Oesterreich', major: 450, tsid: 1008 }, { name: 'ORF2 HD', major: 1107, tsid: 1117, scrambled: true },
];
// Unverschlüsselte Transponder in der Liste (müssen alle von der Sammlung abgestimmt werden)
const TRANSPONDERS = 9;
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
page.on('pageerror', (e) => { errors.push(String(e)); if (process.env.DEBUG_ERR) console.log('PAGEERROR', e.stack); });
// Sammlung im Simulator schnell: 250 ms je Transponder (am TV 10 s); der Simulator «sammelt» Tabellen in 150 ms
await page.addInitScript({ content: `window.__MOCK_CHANNELS__ = ${JSON.stringify(CHANNELS)}; window.__MOCK_EPG__ = ${JSON.stringify(EPG)}; window.__FTG_HARVEST_DWELL__ = 250;` });
await page.addInitScript({ content: readFileSync(join(APP, 'test-tv', 'mock-tizen.js'), 'utf8') });
// Nachsehen: feste Testdaten statt replay.json aus dem Branch «data»
const dayZ = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(now + offset * 86400000));
const TODAY = dayZ(0);
const YESTERDAY = dayZ(-1);
const zt = (day, hm) => new Date(new Date(day + 'T' + hm + ':00Z').getTime() - 60 * 60000).toISOString(); // MEZ
const REPLAY = {
  srf1: [
    { title: 'Meteo', subtitle: 'Abendausgabe', start: zt(TODAY, '00:05'), end: zt(TODAY, '00:10'), urn: 'urn:srf:video:meteo' },
    { title: 'Tagesschau', subtitle: 'Mittagsausgabe', start: zt(TODAY, '00:00'), end: zt(TODAY, '00:05'), urn: 'urn:srf:video:ts' },
    { title: 'Gestern-Sendung', subtitle: null, start: zt(YESTERDAY, '20:05'), end: zt(YESTERDAY, '21:00'), urn: 'urn:srf:video:gestern' },
  ],
  srf2: [{ title: 'Sportflash', subtitle: 'Die Sportnews des Tages', start: zt(TODAY, '00:01'), end: zt(TODAY, '00:03'), urn: 'urn:srf:video:sf' }],
  srfinfo: [{ title: 'Meteo', subtitle: 'Abendausgabe', start: zt(TODAY, '00:30'), end: zt(TODAY, '00:35'), urn: 'urn:srf:video:meteo' }],
};
await page.route('**/replay.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ channels: REPLAY }) }));
await page.addInitScript({ content: `try { localStorage.setItem('ftg:resume:v1', JSON.stringify({ 'urn:srf:video:gestern': { pos: 720, at: 1 } })); } catch (e) {}` });
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(3500); // Daten laden, Tuner lesen, erste EPG-Abrufe (nur jetzt/danach), Sammlung startet nach 2 s

console.log('EPG-Sammlung über die Transponder:');
let st0 = await page.evaluate(() => ({ h: JSON.parse(JSON.stringify(window.ftgDiag().harvest)), log: window.__MOCK_LOG__.slice() }));
check(st0.h.running || st0.h.finishedAt, 'Sammlung läuft nach dem Start von selbst (' + (st0.h.running ? 'läuft ' + st0.h.done + '/' + st0.h.total : 'fertig') + ')');
check(st0.log.indexOf('mute on') >= 0 && st0.log.indexOf('mute on') < st0.log.indexOf('tvwindow.show BEHIND') + 2, 'Ton stumm, TV-Bild hinten (verdeckt): ' + st0.log.slice(0, 4).join(', '));
await page.waitForTimeout(9000);
st0 = await page.evaluate(() => ({ h: JSON.parse(JSON.stringify(window.ftgDiag().harvest)), log: window.__MOCK_LOG__.slice(), counts: window.ftgDiag().tuner.epgCounts, sat: document.documentElement.classList.contains('is-sat') }));
check(!st0.h.running && !st0.h.aborted && st0.h.total === TRANSPONDERS, 'Sammlung fertig, ' + st0.h.total + ' Transponder (erwartet ' + TRANSPONDERS + '), nicht abgebrochen');
const tunes = st0.log.filter((l) => l.indexOf('tune ') === 0);
check(tunes.length >= TRANSPONDERS, 'Je Transponder abgestimmt: ' + tunes.join(', '));
check(!tunes.some((l) => /ORF|SRF/.test(l)), 'Verschlüsselte Transponder (SRG, ORF) nicht abgestimmt');
const lastMute = st0.log.filter((l) => l.indexOf('mute') === 0).pop();
check(lastMute === 'mute off' && st0.log[st0.log.length - 1] === 'mute off' && st0.log[st0.log.length - 2] === 'tvwindow.hide' && !st0.sat, 'Am Ende TV-Bild versteckt, dann Ton zurück, App undurchsichtig: ' + st0.log.slice(-3).join(', '));
const cnt = (id) => (st0.counts.filter((c) => c.id === id)[0] || { n: 0 }).n;
check(cnt('daserste') >= 40 && cnt('zdf') >= 2 && cnt('servustv') >= 1, 'Volles Programm je Transponder: Das Erste ' + cnt('daserste') + ', ZDF ' + cnt('zdf') + ', ServusTV ' + cnt('servustv'));
check(st0.counts.filter((c) => c.id === 'daserste')[0].harvestedAt, 'Sammelzeitpunkt je Sender gespeichert');

console.log('Tuner-Diagnose:');
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(500);
const diag = await page.evaluate(() => Array.from(document.querySelectorAll('.channels-view .note')).map((n) => n.innerText).join(' | '));
console.log('  ' + diag.slice(0, 400));
check(/zugeordnet (1[5-9]|2\d|3\d)/.test(diag), 'Sat-Zuordnung ≥ 15 Sender');
check(/Programm von [1-9]\d* Sat-Sendern/.test(diag), 'Programm von > 0 Sat-Sendern');
check(/Sport-Events aus Sat: [1-9]/.test(diag), 'Sport-Events aus Sat > 0');
check(/Regeln: ja/.test(diag), 'Regeln geladen');
check(/EPG-Sammlung: fertig/.test(diag) && /volles Programm für [1-9]\d* von/.test(diag), 'Diagnose zeigt Sammlung: ' + (diag.match(/EPG-Sammlung: [^|]{0,80}/) || [''])[0]);

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

console.log('Tab Nachsehen:');
await page.click('[data-key="tab:replay"]');
await page.waitForTimeout(400);
const rp = await page.evaluate(() => ({
  filters: Array.from(document.querySelectorAll('.replay .filter')).map((b) => b.innerText),
  rows: Array.from(document.querySelectorAll('.replay .row')).map((r) => r.innerText.replace(/\n/g, ' | ')),
  fits: Array.from(document.querySelectorAll('.replay .filter')).every((b) => b.getBoundingClientRect().bottom <= 1080),
}));
check(rp.filters.join(',').indexOf('Alle,SRF 1,SRF zwei,SRF info,Heute,Gestern') === 0 && rp.filters.length === 11, 'Filter: Sender + 7 Tage: ' + rp.filters.join(', '));
check(rp.fits, 'Alle Filter sichtbar (passen in 1080 px)');
check(rp.rows.length >= 3 && rp.rows.some((r) => /Tagesschau/.test(r)), 'Heute: Sendungen zum Nachsehen (' + rp.rows.length + '): ' + rp.rows.slice(0, 2).join(' ‖ '));
check(rp.rows.filter((r) => /Meteo/.test(r)).length === 1 && rp.rows.some((r) => /Meteo.*SRF 1/.test(r)), 'Gleiche Sendung auf SRF 1 und SRF info nur einmal (Erstausstrahlung SRF 1)');
await page.click('[data-key="rpday:' + YESTERDAY + '"]');
await page.waitForTimeout(300);
const rpY = await page.evaluate(() => Array.from(document.querySelectorAll('.replay .row')).map((r) => r.innerText.replace(/\n/g, ' | ')));
check(rpY.length === 1 && /Gestern-Sendung/.test(rpY[0]) && /weiter ab 12:00/.test(rpY[0]), 'Gestern: 1 Sendung mit gemerkter Position: ' + rpY.join(' ‖ '));
await page.click('[data-key="rpday:' + TODAY + '"]');
await page.click('[data-key="rpch:srf2"]');
await page.waitForTimeout(300);
const rpS2 = await page.evaluate(() => Array.from(document.querySelectorAll('.replay .row')).map((r) => r.innerText.replace(/\n/g, ' | ')));
check(rpS2.length === 1 && /SRF zwei/.test(rpS2[0]), 'Filter SRF zwei: ' + rpS2.join(' ‖ '));
await page.click('[data-key="rpch:all"]');
await page.waitForTimeout(300);
const rowKey = await page.evaluate(() => document.querySelector('.replay .row').getAttribute('data-key'));
await page.evaluate(() => { window.__MOCK_LOG__.length = 0; });
await page.click('[data-key="' + rowKey + '"]');
await page.waitForTimeout(1500);
let vp = await page.evaluate(() => ({ playing: !document.getElementById('player').hidden, info: (document.getElementById('player-info') || {}).innerText || '' }));
check(vp.playing && /SRF 1 · Heute/.test(vp.info) && /Pause/.test(vp.info), 'OK öffnet den Player mit Titel und Spul-Hinweis: ' + vp.info.replace(/\n/g, ' | ').slice(0, 160));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
vp = await page.evaluate(() => ({ playing: !document.getElementById('player').hidden, sat: document.documentElement.classList.contains('is-sat'), picker: document.getElementById('picker').hidden, log: window.__MOCK_LOG__.slice() }));
check(vp.playing && !vp.sat && vp.picker && !vp.log.some((l) => /^tune/.test(l)), 'Pfeiltasten spulen statt zappen (kein Senderwechsel, keine Favoritenleiste)');
await page.keyboard.press('Backspace');
await page.waitForTimeout(500);
vp = await page.evaluate((k) => ({ playing: !document.getElementById('player').hidden, focus: (document.querySelector('.is-focused') || {}).getAttribute && document.querySelector('.is-focused').getAttribute('data-key'), tab: (document.querySelector('.tab.is-active') || {}).innerText }), rowKey);
check(!vp.playing && vp.tab === 'Nachsehen' && vp.focus === rowKey, 'Zurück → Liste, Fokus auf der Sendung');

console.log('Tastenlogger:');
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(300);
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Digit5');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.channels-view .note')).map((n) => n.innerText).filter((x) => /^Tasten/.test(x)).join(''));
check(/5=53/.test(keys) && !/Arrow/.test(keys), 'Tastenlogger zeigt Probetasten, keine Pfeile: ' + keys.slice(0, 80));

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
console.log('Direktwahl im Bild:');
await page.waitForTimeout(1600); // Entprellung
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
let pk = await page.evaluate(() => ({ hidden: document.getElementById('picker').hidden, text: document.getElementById('picker').innerText }));
check(!pk.hidden && /Sat\.1/.test(pk.text) && /ProSieben/.test(pk.text) && /umschalten/.test(pk.text), 'Rechts öffnet Favoritenleiste um Sat.1: ' + pk.text.replace(/\n/g, ' ').slice(0, 90));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
st = await page.evaluate(() => ({ info: (document.getElementById('sat-info') || {}).innerText || '', log: window.__MOCK_LOG__.slice(), picker: document.getElementById('picker').hidden }));
check(/ProSieben/.test(st.info) && st.picker, 'Rechts, OK → ProSieben, Leiste geschlossen: ' + st.info.split('\n')[0]);
await page.waitForTimeout(1600);
await page.keyboard.press('Digit4');
await page.waitForTimeout(1900);
st = await page.evaluate(() => ({ info: (document.getElementById('sat-info') || {}).innerText || '' }));
check(/Das Erste/.test(st.info), 'Ziffer 4 → Favorit 4 (Das Erste): ' + st.info.split('\n')[0]);
await page.waitForTimeout(1600);
await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 10252, bubbles: true })));
await page.waitForTimeout(900);
st = await page.evaluate(() => ({ info: (document.getElementById('sat-info') || {}).innerText || '' }));
check(/ProSieben/.test(st.info), 'Play/Pause → letzter Sender (ProSieben): ' + st.info.split('\n')[0]);
await page.waitForTimeout(1600);
await page.keyboard.press('Digit1');
// Player-Bündel ist schon geladen (Nachsehen): im Simulator ohne SRG-Netz kommt der Stream-Fehler (→ Sat-Reserve) schnell,
// deshalb auf den Zustand warten statt fest 1,9 s
st = await page
  .waitForFunction(() => !document.documentElement.classList.contains('is-sat') && !document.getElementById('player').hidden, null, { timeout: 2500, polling: 50 })
  .then(() => ({ sat: false, playing: true }), () => ({ sat: true, playing: false }));
check(!st.sat && st.playing, 'Ziffer 1 → SRF 1: Sat-Bild zu, Stream-Player offen');
await page.waitForTimeout(1500);
await page.keyboard.press('Backspace');
await page.waitForTimeout(600);

console.log('Verschlüsselter Sender → App-Fallback:');
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(300);
await page.click('[data-key="ch:orf1"]');
await page.waitForTimeout(2600);
st = await page.evaluate(() => ({ sat: document.documentElement.classList.contains('is-sat'), overlay: (document.getElementById('overlay') || {}).innerText || '' }));
check(!st.sat && /Kein Sat-Signal/.test(st.overlay) && /Zattoo öffnen/.test(st.overlay), 'ORF 1 ohne Signal → Dialog mit Zattoo: ' + st.overlay.replace(/\n/g, ' | ').slice(0, 100));
await page.keyboard.press('Backspace');
await page.waitForTimeout(300);

console.log('Diagnose-Zugang:');
const diagObj = await page.evaluate(() => JSON.parse(JSON.stringify(window.ftgDiag())));
check(diagObj.tuner.matched.length >= 15 && diagObj.tuner.events.length >= 4 && Object.keys(diagObj.epg).length >= 5, 'window.ftgDiag() liefert Zuordnung, EPG und Events: ' + diagObj.tuner.matched.length + ' / ' + Object.keys(diagObj.epg).length + ' / ' + diagObj.tuner.events.length);

console.log('Zwischenspeicher:');
const cacheRaw = await page.evaluate(() => { try { return localStorage.getItem('ftg:tuner:v1') || ''; } catch (e) { return ''; } });
check(cacheRaw.length > 1000 && /_serviceId/.test(cacheRaw), 'Tuner-Zuordnung und EPG gespeichert (' + cacheRaw.length + ' Zeichen)');
await page.reload();
await page.waitForTimeout(1500); // noch bevor der Tuner nachgelesen hat, muss Programm aus dem Speicher da sein
await page.click('[data-key="tab:channels"]');
await page.waitForTimeout(200);
const tileCached = await page.evaluate(() => (document.querySelector('[data-key="ch:daserste"]') || {}).innerText || '');
check(/Sportschau Bundesliga|Tatort|Sendung/.test(tileCached), 'Nach Neustart sofort Programm aus dem Zwischenspeicher: ' + tileCached.replace(/\n/g, ' | ').slice(0, 80));

await page.click('[data-key="ch:daserste"]');
await page.waitForTimeout(800);
await page.keyboard.press('Backspace');
await page.waitForTimeout(600);
st = await page.evaluate(() => ({ sat: document.documentElement.classList.contains('is-sat'), log: window.__MOCK_LOG__.slice() }));
check(!st.sat && st.log[st.log.length - 1] === 'tvwindow.hide', 'Zurück schliesst Sat-Modus');

console.log('EPG-Sammlung: kein zweiter Durchgang, Abbruch durch den Zuschauer:');
await page.waitForTimeout(3500); // Tuner nachgelesen + 2 s Verzögerung: gesammeltes Programm ist jünger als 12 h → nichts zu tun
st = await page.evaluate(() => ({ h: JSON.parse(JSON.stringify(window.ftgDiag().harvest)), n: window.ftgDiag().tuner.epgCounts.filter((c) => c.id === 'daserste')[0].n }));
check(!st.h.running && st.h.startedAt === null && st.n >= 40, 'Nach Neustart keine neue Sammlung (Sammelzeitpunkt aus dem Speicher), Programm bleibt voll: ' + st.n);
// Von Hand gestartet, sofort Sat-Sender gewählt: Sammlung bricht ab, räumt auf (Ton zurück, Bild versteckt), dann erst Umschalten
const started = await page.evaluate(() => { window.__MOCK_LOG__.length = 0; return window.ftgHarvest(); });
console.log('  ftgHarvest(): ' + started);
console.log('  ' + await page.evaluate(() => JSON.stringify({ m: window.ftgDiag().tuner.matched.length, tp: window.ftgDiag().transponders.length, sample: window.ftgDiag().tuner.matched[3] })));
await page.waitForTimeout(120);
await page.click('[data-key="ch:daserste"]');
await page.waitForTimeout(1500);
st = await page.evaluate(() => ({ h: JSON.parse(JSON.stringify(window.ftgDiag().harvest)), log: window.__MOCK_LOG__.slice(), sat: document.documentElement.classList.contains('is-sat'), info: (document.getElementById('sat-info') || {}).innerText || '' }));
const iOff = st.log.indexOf('mute off');
const iShow = st.log.lastIndexOf('tvwindow.show BEHIND');
check(st.h.aborted && !st.h.running, 'Sammlung abgebrochen: ' + st.h.log.slice(0, 2).join(' · '));
check(iOff >= 0 && iShow > iOff && st.log.indexOf('tvwindow.hide') < iShow && st.log[st.log.length - 1] === 'tune Das Erste HD', 'Erst aufräumen (Ton, Bild), dann Sat-Bild und Umschalten: ' + st.log.join(', '));
check(st.sat && /Das Erste/.test(st.info), 'Sat-Bild offen auf Das Erste');
await page.keyboard.press('Backspace');
await page.waitForTimeout(600);

await page.screenshot({ path: '/tmp/tv-sim.png' });
await browser.close();
server.close();
console.log(errors.length ? 'JS-Fehler: ' + errors.join(' / ') : 'Keine JS-Fehler');
if (errors.length) fails.push('JS-Fehler');
console.log(fails.length ? `\n${fails.length} Prüfungen fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(fails.length ? 1 : 0);
