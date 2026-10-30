// Einmaliges Diagnose-Skript: ermittelt den gültigen EPG-Pfad der SRG-API.
// Gibt nur Pfad, HTTP-Status und Anfang der Antwort aus (keine Zugangsdaten).
import { getToken } from './sources/srg.ts';

const id = process.env.SRG_CLIENT_ID!;
const secret = process.env.SRG_CLIENT_SECRET!;
const token = await getToken(id, secret);
const d = new Date().toISOString().slice(0, 10);

const paths = [
  `/epg/v3/srf/tv/stations/srf-1?date=${d}`,
  `/epg/v3/srf/tv/stations/srf1?date=${d}`,
  `/epg/v3/srf/tv/stations?date=${d}`,
  `/epg/v3/srf/tv/stations`,
  `/epg/v3/srf/stations/srf-1?date=${d}`,
  `/epg/v3/srf/tv/programs?station=srf-1&date=${d}`,
  `/epg/v3/srf/programs?channel=srf-1&date=${d}`,
  `/epg/v3/programs?bu=srf&channel=srf-1&date=${d}`,
  `/epg/v3/srf/tv/schedules/srf-1?date=${d}`,
  `/epg/v3/srf/tv/channels/srf-1?date=${d}`,
  `/epg/v2/srf/tv/stations/srf-1?date=${d}`,
  `/epg/v2/programs?bu=srf&channel=srf1&date=${d}`,
  `/epg/v1/srf/tv/stations/srf-1?date=${d}`,
  `/srgssr-epg/v3/srf/tv/stations/srf-1?date=${d}`,
  `/rts-epg/v1/schedules/day?date=${d}`,
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
