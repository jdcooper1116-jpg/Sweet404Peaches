import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// ─── Engine URL — accept all known env variable names ─────────────────────────
// Add to .env.local whichever name your deployment uses. All are checked.
const ENGINE_URL = (
  process.env.LOTTERY_ENGINE_URL ||
  process.env.LOTTERY_ENGINE_BASE_URL ||
  process.env.ENGINE_BASE_URL ||
  process.env.NEXT_PUBLIC_LOTTERY_ENGINE_URL ||
  process.env.NEXT_PUBLIC_ENGINE_URL ||
  ''
).replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedTermMapping {
  term: string;
  cash3Numbers?: string[];
  cash4Numbers?: string[];
  [key: string]: unknown;
}

interface RailwayHit {
  candidate:      string;
  draw_date:      string;
  draw_time:      string;
  winning_number: string;
  match_type:     string;
  is_verified?:   boolean;
  source_name?:   string;
  canonical_key?: string;
  // 'state' is NOT returned by the current engine /backtest endpoint.
  // It is derived from canonical_key below.
  // If the engine is later patched to include it, it will be used directly.
  state?: string;
}

export interface MappedBacktestHit {
  termLabel:        string;
  number:           string;
  gameType:         'cash3' | 'cash4';
  state:            string;
  drawDate:         string;
  drawTime:         string;
  rawResult:        string;
  normalizedResult: string;
  resultBoxedKey:   string;
  hitType:          'straight' | 'boxed';
  daysFromDream:    number;
  sameDay:          boolean;
  match_type:       string;
  is_verified:      boolean;
  source_name:      string;
  canonical_key:    string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

function daysBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.floor(
      (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime())
      / 86_400_000
    )
  );
}

/**
 * Straight vs boxed is determined by direct digit comparison — never by match_type.
 * When mode="both", the engine returns match_type="both" for all hits, making it
 * useless for classification. We always compare candidate to winning_number.
 */
function toHitType(candidate: string, winning: string): 'straight' | 'boxed' {
  return candidate === winning ? 'straight' : 'boxed';
}

/**
 * Find the dream term that owns this candidate.
 * Returns the first term mapping that contains the candidate in its number list.
 */
function findTermLabel(
  candidate:  string,
  mappings:   ParsedTermMapping[],
  numberKey:  'cash3Numbers' | 'cash4Numbers'
): string {
  for (const m of mappings) {
    const nums = Array.isArray(m[numberKey]) ? (m[numberKey] as string[]) : [];
    if (nums.includes(candidate)) {
      return String(m.term || 'unknown-term').trim() || 'unknown-term';
    }
  }
  return 'unknown-term';
}

/**
 * Derive state from a Railway hit.
 *
 * The current /backtest endpoint does not include a 'state' field in hits
 * (MatchHit dataclass only has candidate, draw_date, draw_time, winning_number,
 * match_type, is_verified, canonical_key, source_name).
 *
 * If the engine is later patched to expose hit.state directly, this function
 * will prefer that. Otherwise it falls back to parsing canonical_key.
 *
 * Known canonical_key formats from the engine DB:
 *   "GA_pick3_2019-04-24_evening"
 *   "GA|pick3|2019-04-24|evening"
 *
 * All observed formats begin with a 2-letter uppercase state code
 * followed by a single non-letter separator character.
 */
function extractState(hit: RailwayHit): string {
  // Prefer explicit state field if present (future engine patch or extended response).
  if (hit.state && typeof hit.state === 'string' && /^[A-Z]{2}$/.test(hit.state)) {
    return hit.state;
  }

  // Derive from canonical_key.
  const key = String(hit.canonical_key || '');
  const match = key.match(/^([A-Z]{2})[^A-Z]/);
  if (match) return match[1];

  // No state derivable — return empty string.
  // Hit is still saved; state will show as empty in the UI.
  return '';
}

/**
 * Call Railway /backtest with state="ALL" for one game type.
 * The Lottery Engine is the authoritative source of which states support each game.
 * Sweet404Peaches does NOT maintain a duplicate state registry.
 *
 * Returns raw Railway hits on success, [] on any failure (error pushed to errors[]).
 */
async function callRailwayAllStates(
  gameType:      'pick3' | 'pick4',
  dreamDate:     string,
  lookaheadDays: number,
  candidates:    string[],
  label:         string,
  errors:        string[],
): Promise<RailwayHit[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/backtest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state:          'ALL',
        game_type:      gameType,
        anchor_date:    dreamDate,
        lookahead_days: lookaheadDays,
        candidates,
        // Send match_mode via all paths the engine supports.
        match_mode:     'both',
        filters:        { match_mode: 'both' },
        label,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      errors.push(`${gameType} call failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.hits) ? data.hits : [];
  } catch (err) {
    errors.push(
      `${gameType} call error: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/**
 * Map raw Railway hits → MappedBacktestHit ready for Firestore.
 */
function mapHits(
  rawHits:   RailwayHit[],
  dreamDate: string,
  gameType:  'cash3' | 'cash4',
  numberKey: 'cash3Numbers' | 'cash4Numbers',
  mappings:  ParsedTermMapping[],
): MappedBacktestHit[] {
  return rawHits.map(hit => {
    const days  = daysBetween(dreamDate, hit.draw_date);
    const state = extractState(hit);
    return {
      termLabel:        findTermLabel(hit.candidate, mappings, numberKey),
      number:           hit.candidate,
      gameType,
      state,
      drawDate:         hit.draw_date,
      drawTime:         hit.draw_time,
      rawResult:        hit.winning_number,
      normalizedResult: hit.winning_number,
      resultBoxedKey:   sortedDigits(hit.winning_number),
      hitType:          toHitType(hit.candidate, hit.winning_number),
      daysFromDream:    days,
      sameDay:          days === 0,
      match_type:       hit.match_type,
      is_verified:      hit.is_verified  ?? false,
      source_name:      hit.source_name  ?? '',
      canonical_key:    hit.canonical_key ?? '',
    };
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!ENGINE_URL) {
    return NextResponse.json(
      {
        ok:    false,
        error: 'Lottery engine URL is not configured. Set LOTTERY_ENGINE_URL (or LOTTERY_ENGINE_BASE_URL) in your environment.',
      },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const {
    backtestDreamId,
    dreamDate,
    lookaheadDays      = 7,
    cash3Numbers       = [],
    cash4Numbers       = [],
    parsedTermMappings = [],
  } = body as {
    backtestDreamId?:    string;
    dreamDate?:          string;
    lookaheadDays?:      number;
    cash3Numbers?:       string[];
    cash4Numbers?:       string[];
    parsedTermMappings?: ParsedTermMapping[];
  };

  if (!backtestDreamId) {
    return NextResponse.json({ ok: false, error: 'backtestDreamId is required.' }, { status: 400 });
  }
  if (!dreamDate) {
    return NextResponse.json({ ok: false, error: 'dreamDate is required.' }, { status: 400 });
  }

  // Validate and clean candidates.
  const c3 = Array.isArray(cash3Numbers)
    ? cash3Numbers.filter(s => /^\d{3}$/.test(String(s)))
    : [];
  const c4 = Array.isArray(cash4Numbers)
    ? cash4Numbers.filter(s => /^\d{4}$/.test(String(s)))
    : [];
  const mappings = Array.isArray(parsedTermMappings)
    ? (parsedTermMappings as ParsedTermMapping[])
    : [];
  const days  = Number(lookaheadDays) || 7;
  const label = `engine-replay::${backtestDreamId}`;
  const errors: string[] = [];

  if (c3.length === 0 && c4.length === 0) {
    return NextResponse.json(
      {
        ok:    false,
        error: 'No valid candidates found. cash3Numbers must be 3-digit strings, cash4Numbers must be 4-digit strings.',
        debug: {
          cash3_received: Array.isArray(cash3Numbers) ? cash3Numbers.slice(0, 5) : cash3Numbers,
          cash4_received: Array.isArray(cash4Numbers) ? cash4Numbers.slice(0, 5) : cash4Numbers,
          cash3_valid:    c3.length,
          cash4_valid:    c4.length,
        },
      },
      { status: 400 }
    );
  }

  // ── Two Railway calls in parallel: pick3 ALL-states + pick4 ALL-states ────────
  // The engine determines which states support each game type.
  // Sweet404Peaches does not maintain a state registry.
  const [rawPick3, rawPick4] = await Promise.all([
    c3.length > 0
      ? callRailwayAllStates('pick3', dreamDate, days, c3, label, errors)
      : Promise.resolve<RailwayHit[]>([]),
    c4.length > 0
      ? callRailwayAllStates('pick4', dreamDate, days, c4, label, errors)
      : Promise.resolve<RailwayHit[]>([]),
  ]);

  const pick3Hits = mapHits(rawPick3, dreamDate, 'cash3', 'cash3Numbers', mappings);
  const pick4Hits = mapHits(rawPick4, dreamDate, 'cash4', 'cash4Numbers', mappings);
  const allHits   = [...pick3Hits, ...pick4Hits];

  // Sort chronologically.
  allHits.sort((a, b) => {
    const ak = `${a.drawDate} ${a.drawTime}`;
    const bk = `${b.drawDate} ${b.drawTime}`;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  const straightHits = allHits.filter(h => h.hitType === 'straight').length;
  const boxedHits    = allHits.filter(h => h.hitType === 'boxed').length;

  const stateCounts = new Map<string, number>();
  const termCounts  = new Map<string, number>();

  for (const hit of allHits) {
    if (hit.state) stateCounts.set(hit.state, (stateCounts.get(hit.state) ?? 0) + 1);
    termCounts.set(hit.termLabel, (termCounts.get(hit.termLabel) ?? 0) + 1);
  }

  const uniqueStates = Array.from(stateCounts.keys());
  const bestState    = [...stateCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const bestTerm     = [...termCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return NextResponse.json({
    ok:            true,
    backtestDreamId,
    dreamDate,
    lookaheadDays: days,
    totalHits:     allHits.length,
    straightHits,
    boxedHits,
    uniqueStates,
    bestState,
    bestTerm,
    hits:          allHits,
    errors,
    _debug: {
      engineUrl:      ENGINE_URL,
      pick3Candidates: c3.length,
      pick4Candidates: c4.length,
      rawPick3Hits:   rawPick3.length,
      rawPick4Hits:   rawPick4.length,
    },
  });
}
