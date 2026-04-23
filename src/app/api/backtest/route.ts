import { NextRequest, NextResponse } from 'next/server';

// Vercel max duration — required for all-states fan-out.
// Has no effect on single-state requests.
export const maxDuration = 60;

// ─── Engine URL — do NOT rename this variable ─────────────────────────────────
const ENGINE_URL = process.env.LOTTERY_ENGINE_URL;

// ─── All-states configuration ─────────────────────────────────────────────────
//
// States are split by game type so that pick4 mode never wastes requests
// on pick3-only jurisdictions like AZ or MN.
//
// To add a state to a game type: append its two-letter code to that array.
// To remove a state: delete its code from that array.
// No other code needs to change.

const PICK3_STATES: string[] = [
  'AZ', // Pick 3 only — not in PICK4_STATES
  'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI',
  'MN', // Pick 3 only — not in PICK4_STATES
  'MO', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'TN',
  'TX', 'VT', 'VA', 'WV', 'WI',
];

const PICK4_STATES: string[] = [
  // AZ excluded — Pick 3 only
  'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI',
  // MN excluded — Pick 3 only
  'MO', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'TN',
  'TX', 'VT', 'VA', 'WV', 'WI',
];

// How many states to fetch in parallel at once.
// Raise to 15 only after confirming Railway handles it without rate-limiting.
const CONCURRENCY = 10;

// Per-state request timeout in milliseconds.
const STATE_TIMEOUT_MS = 12_000;

// ─── Helper: select states for a given game_type ──────────────────────────────
// Returns null if the game_type is not supported in all-states mode.
// Add new game types here as the engine expands.

function getStatesForGameType(game_type: string): string[] | null {
  switch (game_type.toLowerCase()) {
    case 'pick3':
    case 'pick-3':
    case 'cash3':
    case 'cash-3':
      return PICK3_STATES;

    case 'pick4':
    case 'pick-4':
    case 'cash4':
    case 'cash-4':
      return PICK4_STATES;

    default:
      return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SingleStateBody {
  state:          string;
  game_type:      string;
  anchor_date:    string;
  lookahead_days: number;
  candidates:     string[];
  label?:         string;
}

interface EngineHit {
  candidate:      string;
  draw_date:      string;
  draw_time:      string;
  winning_number: string;
  match_type:     string;
  is_verified?:   boolean;
  source_name?:   string;
  [key: string]:  unknown;
}

interface EngineStateResponse {
  hits?:          EngineHit[];
  coverage_gaps?: unknown[];
  total_hits?:    number;
  [key: string]:  unknown;
}

interface MergedHit extends EngineHit {
  // Fields injected by this bridge — not returned by the engine
  state:          string;
  anchor_date:    string;
  lookahead_days: number;
  label:          string;
}

interface AllStatesResponse {
  scope:                  'all-states';
  game_type:              string;
  anchor_date:            string;
  lookahead_days:         number;
  candidates:             string[];
  label:                  string;
  overall_hit_count:      number;
  states_attempted:       number;
  states_succeeded:       number;
  states_with_hits:       string[];
  failed_states:          string[];
  combined_hits:          MergedHit[];
  results_by_state:       Record<string, EngineStateResponse>;
  coverage_gaps_by_state: Record<string, unknown[]>;
}

// ─── Helper: fetch one state from the Railway engine ─────────────────────────

async function fetchOneState(
  body: SingleStateBody
): Promise<EngineStateResponse> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), STATE_TIMEOUT_MS);

  try {
    const res = await fetch(`${ENGINE_URL}/backtest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      cache:   'no-store',
      signal:  controller.signal,
    });

    const text = await res.text();
    let data: EngineStateResponse;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text } as unknown as EngineStateResponse;
    }

    if (!res.ok) {
      throw new Error(`Engine returned HTTP ${res.status} for state ${body.state}`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Helper: run states in parallel batches ───────────────────────────────────

type StateOutcome = {
  state:  string;
  result: EngineStateResponse | null;
  error:  string | null;
};

async function fetchStatesInBatches(
  shared: Omit<SingleStateBody, 'state'>,
  states: string[]
): Promise<StateOutcome[]> {
  const outcomes: StateOutcome[] = [];

  for (let i = 0; i < states.length; i += CONCURRENCY) {
    const batch   = states.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(state =>
        fetchOneState({ ...shared, state })
          .then(result  => ({ state, result, error: null } as StateOutcome))
          .catch((err: unknown) => ({
            state,
            result: null,
            error:  err instanceof Error ? err.message : String(err),
          } as StateOutcome))
      )
    );

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        outcomes.push(item.value);
      } else {
        outcomes.push({ state: 'unknown', result: null, error: String(item.reason) });
      }
    }
  }

  return outcomes;
}

// ─── Helper: merge per-state results into combined response ───────────────────

function mergeResults(
  outcomes: StateOutcome[],
  ctx: {
    game_type:      string;
    anchor_date:    string;
    lookahead_days: number;
    candidates:     string[];
    label:          string;
  }
): AllStatesResponse {
  const combined_hits:           MergedHit[]                       = [];
  const results_by_state:        Record<string, EngineStateResponse> = {};
  const coverage_gaps_by_state:  Record<string, unknown[]>         = {};
  const states_with_hits:        string[]                          = [];
  const failed_states:           string[]                          = [];

  for (const { state, result, error } of outcomes) {
    if (error !== null || result === null) {
      failed_states.push(state);
      continue;
    }

    results_by_state[state]       = result;
    coverage_gaps_by_state[state] = Array.isArray(result.coverage_gaps)
      ? result.coverage_gaps
      : [];

    const hits: EngineHit[] = Array.isArray(result.hits) ? result.hits : [];

    if (hits.length > 0) {
      states_with_hits.push(state);

      for (const hit of hits) {
        combined_hits.push({
          // All engine hit fields first
          ...hit,
          // Provenance fields injected by this bridge.
          // Each stored hit carries full context for personal dictionary use:
          //   candidate, state, draw_date, draw_time, winning_number,
          //   match_type, source_name, anchor_date, lookahead_days, label
          state,
          anchor_date:    ctx.anchor_date,
          lookahead_days: ctx.lookahead_days,
          label:          ctx.label,
        });
      }
    }
  }

  // Sort chronologically for display
  combined_hits.sort((a, b) =>
    a.draw_date < b.draw_date ? -1 : a.draw_date > b.draw_date ? 1 : 0
  );

  return {
    scope:                  'all-states',
    game_type:              ctx.game_type,
    anchor_date:            ctx.anchor_date,
    lookahead_days:         ctx.lookahead_days,
    candidates:             ctx.candidates,
    label:                  ctx.label,
    overall_hit_count:      combined_hits.length,
    states_attempted:       outcomes.length,
    states_succeeded:       outcomes.length - failed_states.length,
    states_with_hits,
    failed_states,
    combined_hits,
    results_by_state,
    coverage_gaps_by_state,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // Parse body once here so both branches can use it
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // ── ALL-STATES BRANCH ───────────────────────────────────────────────────────
  // Activated ONLY when the client sends { "scope": "all-states" }.
  // All other requests fall through to the original single-state logic below.

  if (body.scope === 'all-states') {
    if (!ENGINE_URL) {
      return NextResponse.json(
        { error: 'LOTTERY_ENGINE_URL is not configured.' },
        { status: 500 }
      );
    }

    const { game_type, anchor_date, lookahead_days, candidates, label } = body;

    if (typeof game_type      !== 'string' || !game_type)
      return NextResponse.json({ error: 'game_type is required.'                       }, { status: 400 });
    if (typeof anchor_date    !== 'string' || !anchor_date)
      return NextResponse.json({ error: 'anchor_date is required.'                     }, { status: 400 });
    if (typeof lookahead_days !== 'number' || lookahead_days < 1)
      return NextResponse.json({ error: 'lookahead_days must be a positive number.'    }, { status: 400 });
    if (!Array.isArray(candidates) || candidates.length === 0)
      return NextResponse.json({ error: 'candidates must be a non-empty array.'        }, { status: 400 });

    // Select states based on game_type — returns null if unrecognized
    const targetStates = getStatesForGameType(game_type);

    if (targetStates === null) {
      return NextResponse.json(
        {
          error:            `game_type "${game_type}" is not supported in all-states mode.`,
          supported_values: ['pick3', 'pick4'],
        },
        { status: 400 }
      );
    }

    const resolvedLabel = typeof label === 'string' ? label : '';

    const shared: Omit<SingleStateBody, 'state'> = {
      game_type,
      anchor_date,
      lookahead_days,
      candidates: candidates as string[],
      label:      resolvedLabel || undefined,
    };

    console.log(
      `[backtest/all-states] Starting: ${targetStates.length} states for ${game_type}, ` +
      `${candidates.length} candidate(s), anchor=${anchor_date}, window=${lookahead_days}d`
    );

    const outcomes = await fetchStatesInBatches(shared, targetStates);

    const merged = mergeResults(outcomes, {
      game_type,
      anchor_date,
      lookahead_days,
      candidates: candidates as string[],
      label:      resolvedLabel,
    });

    console.log(
      `[backtest/all-states] Done: ${merged.overall_hit_count} hits, ` +
      `${merged.states_with_hits.length} states hit, ` +
      `${merged.failed_states.length} failed.`
    );

    // ── FIRESTORE HOOK ────────────────────────────────────────────────────────
    //
    // When ready to persist hits to your personal dictionary, add your
    // Firestore write here — before the return statement.
    //
    // merged.combined_hits is a flat array. Each element contains:
    //
    //   hit.candidate       — tracked number          e.g. "297"
    //   hit.state           — US state code           e.g. "GA"
    //   hit.draw_date       — YYYY-MM-DD              e.g. "2024-01-29"
    //   hit.draw_time       — draw time label         e.g. "evening"
    //   hit.winning_number  — actual draw result      e.g. "297"
    //   hit.match_type      — "exact" | "boxed" | etc
    //   hit.source_name     — data source             e.g. "lottery.net"
    //   hit.is_verified     — boolean
    //   hit.anchor_date     — backtest anchor date    e.g. "2024-01-25"
    //   hit.lookahead_days  — window used             e.g. 7
    //   hit.label           — dream/context label     e.g. "Dream Entry"
    //
    // Example (fill in your auth + Firestore logic):
    //
    // if (merged.combined_hits.length > 0) {
    //   const ownerUid = '...';
    //   await persistBacktestHitsToPersonalDictionary(ownerUid, merged.combined_hits);
    // }
    //
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json(merged, { status: 200 });
  }

  // ── ORIGINAL SINGLE-STATE BRANCH ─────────────────────────────────────────
  // Copied byte-for-byte from the current working file.
  // Do NOT modify anything below this line.

  try {
    if (!ENGINE_URL) {
      return NextResponse.json(
        { error: 'LOTTERY_ENGINE_URL is not configured.' },
        { status: 500 }
      );
    }

    const singleBody = body;

    const response = await fetch(`${ENGINE_URL}/backtest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(singleBody),
      cache: 'no-store',
    });

    const text = await response.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Lottery engine request failed.',
          status: response.status,
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Unexpected backtest bridge failure.',
        details: error?.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
