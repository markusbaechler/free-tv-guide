// Datum/Zeit immer in Schweizer Zeit, unabhängig von der TV-Einstellung.
const TZ = 'Europe/Zurich';

function makeFormatter(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('de-CH', Object.assign({ timeZone: TZ }, opts));
  } catch (e) {
    // Ältere ICU-Daten ohne Zeitzonen → lokale Zeit des TVs
    return new Intl.DateTimeFormat('de-CH', opts);
  }
}

const timeFmt = makeFormatter({ hour: '2-digit', minute: '2-digit', hour12: false });
const dateKeyFmt = makeFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' });
const weekdayFmt = makeFormatter({ weekday: 'short' });
const dayMonthFmt = makeFormatter({ day: 'numeric', month: 'numeric' });

export function time(iso: string | Date): string {
  return timeFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** Kalendertag als sortierbarer Schlüssel YYYY-MM-DD (Zürich) */
export function dayKey(iso: string | Date): string {
  const parts = dateKeyFmt.formatToParts(typeof iso === 'string' ? new Date(iso) : iso);
  let y = '';
  let m = '';
  let d = '';
  for (const p of parts) {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
  }
  return y + '-' + m + '-' + d;
}

export function addDaysKey(key: string, n: number): string {
  const d = new Date(key + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** «Heute», «Morgen» oder «Mo 3.11.» */
export function dayLabel(key: string, now: Date): string {
  const today = dayKey(now);
  if (key === today) return 'Heute';
  if (key === addDaysKey(today, 1)) return 'Morgen';
  const d = new Date(key + 'T12:00:00Z');
  return weekdayFmt.format(d).replace('.', '') + ' ' + dayMonthFmt.format(d);
}

export function weekdayShort(d: Date): string {
  return weekdayFmt.format(d).replace('.', '') + ' ' + dayMonthFmt.format(d);
}

/** Restzeit «noch 45 Min.» / «noch 1 Std. 20» */
export function remaining(endIso: string, now: Date): string {
  const min = Math.max(0, Math.round((new Date(endIso).getTime() - now.getTime()) / 60000));
  if (min < 60) return 'noch ' + min + ' Min.';
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return 'noch ' + h + ' Std.' + (rest ? ' ' + (rest < 10 ? '0' : '') + rest : '');
}

/** «in 25 Min.» für Events, die bald beginnen */
export function startsIn(startIso: string, now: Date): string {
  const min = Math.round((new Date(startIso).getTime() - now.getTime()) / 60000);
  if (min <= 1) return 'beginnt gleich';
  if (min < 60) return 'in ' + min + ' Min.';
  return 'ab ' + time(startIso);
}
