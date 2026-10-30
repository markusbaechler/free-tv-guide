export const TZ = 'Europe/Zurich';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zurichParts(d: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Kalenderdatum in Zürich, "YYYY-MM-DD" */
export function zurichDate(d: Date): string {
  const p = zurichParts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Offset von Zürich zu UTC in Minuten für einen Zeitpunkt (z. B. +60 / +120) */
function offsetMinutes(d: Date): number {
  const p = zurichParts(d);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return Math.round((asUtc - d.getTime()) / 60000);
}

/** "YYYY-MM-DD HH:MM" in Zürcher Lokalzeit → ISO-UTC */
export function zurichLocalToUtc(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) throw new Error(`Ungültige Lokalzeit ${JSON.stringify(local)}, erwartet "YYYY-MM-DD HH:MM"`);
  const naive = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  // Zweimal iterieren, damit Zeiten rund um die Zeitumstellung stimmen
  let ts = naive - offsetMinutes(new Date(naive)) * 60000;
  ts = naive - offsetMinutes(new Date(ts)) * 60000;
  return new Date(ts).toISOString();
}

/** Beliebigen Zeitstring mit Offset → ISO-UTC, null wenn ungültig */
export function toUtc(v: unknown): string | null {
  if (typeof v !== 'string' || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
