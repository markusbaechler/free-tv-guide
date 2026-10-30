// Offizielle SRG-Livestream-Kennungen (URNs) je Sender aus der «SRGSSR Video»-API.
//   GET https://api.srgssr.ch/videometadata/v2/livestreams?bu={srf|rts|rsi}
// Die SRG sieht ausdrücklich vor, diese IDs mit ihrem Player «Pillarbox» in eigenen Apps abzuspielen.
// Die Pipeline speichert nur die URN, keine Stream-URLs: Die eigentliche Wiedergabe-Adresse holt
// Pillarbox zur Laufzeit am Fernseher (Geoblocking Schweiz greift dort ganz normal).

const BASE = 'https://api.srgssr.ch/videometadata/v2';

export interface LiveStream {
  bu: string;
  urn: string;
  title: string;
}

/** Normalisierte Sendernamen → Kanal-IDs aus channels.yaml */
const ALIASES: Record<string, string[]> = {
  srf1: ['srf1', 'srfeins'],
  srf2: ['srfzwei', 'srf2'],
  srfinfo: ['srfinfo'],
  rts1: ['rts1', 'rtsun'],
  rts2: ['rts2', 'rtsdeux'],
  rsila1: ['rsila1', 'la1'],
  rsila2: ['rsila2', 'la2'],
};

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/^(livestream|live)\s+(für|de|di|von)?\s*/i, '')
    .replace(/\s+(live|en direct|in diretta)$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function matchChannel(title: string): string | null {
  const n = normalizeTitle(title);
  for (const [id, names] of Object.entries(ALIASES)) {
    if (names.includes(n)) return id;
  }
  return null;
}

export function extractLivestreams(bu: string, payload: unknown): LiveStream[] {
  const list = (payload as { mediaList?: unknown[] } | null)?.mediaList;
  if (!Array.isArray(list)) return [];
  const out: LiveStream[] = [];
  for (const m of list) {
    const o = m as Record<string, unknown>;
    const urn = typeof o.urn === 'string' ? o.urn : null;
    const title = typeof o.title === 'string' ? o.title : null;
    if (urn && title && o.mediaType !== 'AUDIO') out.push({ bu, urn, title });
  }
  return out;
}

export async function fetchLivestreams(token: string, bu: string): Promise<LiveStream[]> {
  const res = await fetch(`${BASE}/livestreams?bu=${bu}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Livestreams ${bu}: HTTP ${res.status}`);
  return extractLivestreams(bu, await res.json());
}
