// Temporäre Diagnose: welche API-Produkte deckt das Token ab? Gibt KEIN Token/Secret aus.
const id = process.env.SRG_CLIENT_ID!;
const secret = process.env.SRG_CLIENT_SECRET!;
const basic = Buffer.from(`${id}:${secret}`).toString('base64');
const res = await fetch('https://api.srgssr.ch/oauth/v1/accesstoken?grant_type=client_credentials', {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
});
const data = (await res.json()) as Record<string, unknown>;
const token = String(data.access_token);
const safe = Object.fromEntries(Object.entries(data).filter(([k]) => !/token|secret|client_id|refresh/i.test(k)));
console.log(`::notice::Token-Felder (ohne Geheimnisse): ${JSON.stringify(safe).slice(0, 900)}`);
const d = new Date().toISOString().slice(0, 10);
const lines: string[] = [];
for (const p of [`/epg/v3/srf/tv/stations/srf-1?date=${d}`, `/epg/v3/srf/tv/stations/srf-1`, `/epg/v3/srf/tv/stations/srf-1/programs?date=${d}`]) {
  const r = await fetch(`https://api.srgssr.ch${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual' });
  lines.push(`${r.status} ${p} → ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
}
console.log(`::notice::${lines.join('%0A')}`);
