// Einmaliges Diagnose-Skript: ermittelt den gültigen EPG-Pfad der SRG-API.
// Gibt nur Pfad, HTTP-Status und Anfang der Antwort aus (keine Zugangsdaten).
import { getToken } from './sources/srg.ts';

const id = process.env.SRG_CLIENT_ID!;
const secret = process.env.SRG_CLIENT_SECRET!;
const token = await getToken(id, secret);
const d = new Date().toISOString().slice(0, 10);

const paths = [
  // Vergleich: andere APIs desselben Produkts → zeigt, ob das Token generell Rechte hat
  `/videometadata/v2/tv_channels?bu=srf`,
  `/polis-api/v2/votations/1?lang=de`,
  `/audiometadata/v2/livestreams?bu=srf`,
  // EPG nochmals mit Radio und RTS/RSI
  `/epg/v3/srf/radio/stations/srf-3?date=${d}`,
  `/epg/v3/rts/tv/stations/rts-1?date=${d}`,
  `/epg/v3/rsi/tv/stations/la-1?date=${d}`,
];

// Run-Logs sind von hier aus nicht lesbar, Annotationen schon → Ergebnisse als ::notice:: (max. 10 pro Schritt)
const lines: string[] = [];
for (const p of paths) {
  try {
    const res = await fetch(`https://api.srgssr.ch${p}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
    });
    const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 250);
    lines.push(`${res.status} ${p} → ${body}`);
  } catch (e) {
    lines.push(`ERR ${p} ${(e as Error).message}`);
  }
}
for (let i = 0; i < lines.length; i += 3) {
  console.log(`::notice::${lines.slice(i, i + 3).join('%0A').replace(/\r?\n/g, ' ')}`);
}
