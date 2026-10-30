// Lokale Vorschau von app/dist im Browser (1920×1080, Steuerung per Tastatur).
// Aufruf: npm run app:preview  →  http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.xml': 'text/xml' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, path === '/' ? 'index.html' : path);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Nicht gefunden');
  }
}).listen(PORT, () => {
  console.log(`Vorschau: http://localhost:${PORT}  (Fenster 1920×1080; Pfeiltasten, Enter, Backspace = Zurück, 1–4 = Farbtasten)`);
});
