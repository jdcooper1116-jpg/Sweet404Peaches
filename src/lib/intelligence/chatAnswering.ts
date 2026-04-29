/**
 * src/lib/intelligence/chatAnswering.ts
 *
 * Sigil & Slumber Intelligence Assistant — local inference engine.
 * Detects intent, scores system convergence, and generates evidence-backed answers.
 *
 * Convergence scoring (per candidate number + gameType):
 *   +3  active dream window
 *   +3  confirmed As They Fell Before memory (personalHitMappings)
 *   +2  current dream hit within last 7 days
 *   +2  number appears in backtest memory
 *   +2  number mapped under multiple terms
 *   +2  state-specific memory is strong (stateStrengthScore > 5 for any state)
 *   +1  boxed family has 2+ members with hits
 *   +1  number appears across multiple dreamers
 *   +1  fresh dream within current window (activeStart within 3 days)
 *   +1  straight hit history exists
 *
 * Confidence labels:
 *   8+    Strong convergence
 *   5–7   Moderate convergence
 *   3–4   Watchlist
 *   0–2   Weak / informational
 */

import type { ChatContext } from './chatContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function sortedDigits(n: string): string {
  return String(n).split('').sort().join('');
}

function isActiveWindow(w: any, today: string): boolean {
  return (w.activeEnd ?? w.activeWindowEnd ?? '') >= today &&
         (w.activeStart ?? w.activeWindowStart ?? '') <= today;
}

function isFreshWindow(w: any, today: string): boolean {
  const start = w.activeStart ?? w.activeWindowStart ?? '';
  return start >= daysAgo(3) && start <= today;
}

function isRecentHit(h: any, cutoff: string): boolean {
  return (h.draw_date ?? '') >= cutoff;
}

function confidenceLabel(score: number): string {
  if (score >= 8) return 'Strong Focus';
  if (score >= 5) return 'Moderate Focus';
  if (score >= 3) return 'Watchlist';
  return 'Weak / informational';
}

function normalizeQ(q: string): string {
  return q.toLowerCase().trim();
}

// ─── Intent detection ─────────────────────────────────────────────────────────

type Intent =
  | 'system-overview'
  | 'number-recommendation'
  | 'term-question'
  | 'state-question'
  | 'dreamer-question'
  | 'diagnostic'
  | 'results-question'
  | 'help'
  | 'convergence-question'
  | 'pinned-question'
  | 'proof-question';

const US_STATES: Record<string, string> = {
  'georgia': 'GA', 'ga': 'GA', 'florida': 'FL', 'fl': 'FL',
  'south carolina': 'SC', 'sc': 'SC', 'north carolina': 'NC', 'nc': 'NC',
  'texas': 'TX', 'tx': 'TX', 'new york': 'NY', 'ny': 'NY',
  'illinois': 'IL', 'il': 'IL', 'ohio': 'OH', 'oh': 'OH',
  'michigan': 'MI', 'mi': 'MI', 'virginia': 'VA', 'va': 'VA',
  'maryland': 'MD', 'md': 'MD', 'new jersey': 'NJ', 'nj': 'NJ',
  'pennsylvania': 'PA', 'pa': 'PA', 'kentucky': 'KY', 'ky': 'KY',
  'tennessee': 'TN', 'tn': 'TN', 'louisiana': 'LA', 'la': 'LA',
  'mississippi': 'MS', 'ms': 'MS', 'alabama': 'AL', 'al': 'AL',
  'connecticut': 'CT', 'ct': 'CT', 'missouri': 'MO', 'mo': 'MO',
  'indiana': 'IN', 'in': 'IN', 'wisconsin': 'WI', 'wi': 'WI',
  'massachusetts': 'MA', 'ma': 'MA', 'colorado': 'CO', 'co': 'CO',
  'oregon': 'OR', 'or': 'OR', 'washington': 'WA', 'wa': 'WA',
  'kansas': 'KS', 'ks': 'KS', 'delaware': 'DE', 'de': 'DE',
  'rhode island': 'RI', 'ri': 'RI', 'vermont': 'VT', 'vt': 'VT',
  'dc': 'DC', 'washington dc': 'DC',
};

function extractStateFromQuery(q: string): string | null {
  const lq = q.toLowerCase();
  for (const [name, abbr] of Object.entries(US_STATES)) {
    if (lq.includes(name)) return abbr;
  }
  return null;
}

export function detectIntent(q: string): Intent {
  const lq = normalizeQ(q);

  // Results questions first (before general)
  if (/lottery results|what hit today|drawing results|what drew|results for|last draw|winning numbers/.test(lq)) {
    return 'results-question';
  }

  // Diagnostic
  if (/why didn.t|why did.t|not showing|missing hit|broken|debug|are windows|did refresh|last checked|when was refresh|what is wrong|what.s wrong|not working/.test(lq)) {
    return 'diagnostic';
  }

  // Dreamer
  if (/for me$|my windows|my hits|my dreams|show (.+)'s|what is active for|dreamer|jamala|mama/.test(lq)) {
    return 'dreamer-question';
  }

  // State — explicit state mention + recommendation context
  if (extractStateFromQuery(q) && /watch|play|hot|playlist|recommend|what|show|best|strong|active/.test(lq)) {
    return 'state-question';
  }
  if (/which states|hot states|best states|state playlist|states to watch/.test(lq)) {
    return 'state-question';
  }

  // Number recommendation
  if (/give me numbers|recommend numbers|what numbers|which numbers|numbers to play|best numbers|what to play|play today|pick numbers|top plays|strongest plays|suggest numbers/.test(lq)) {
    return 'number-recommendation';
  }

  // Term question
  if (/what does .+ mean|show me .+ numbers|what has .+ done|numbers for|term |the word |dream term|mapped numbers|dictionary for/.test(lq)) {
    return 'term-question';
  }

  // Convergence — what's overlapping
  if (/converging|convergence|overlap|cross-dreamer|multiple terms|repeated|what is strong|what.s converging|what overlap/.test(lq)) {
    return 'convergence-question';
  }

  // Pinned/suggested plays
  if (/pinned|suggested|watchlist|what is pinned|what.s pinned|what should i pin|what to pin|promote/.test(lq)) {
    return 'pinned-question';
  }

  // Fell-before proof
  if (/proof|evidence|fell before|has fallen|fell in|confirmed|what has proven|what has hit|what numbers have proof/.test(lq)) {
    return 'proof-question';
  }

  // Help
  if (/^help$|what can you do|commands|how do i use|available questions/.test(lq)) {
    return 'help';
  }

  // System overview / catch-all
  return 'system-overview';
}

// ─── Convergence candidate builder ───────────────────────────────────────────

export type ConvergenceCandidate = {
  number:       string;
  gameType:     string;
  score:        number;
  label:        string;
  terms:        string[];
  dreamers:     string[];
  states:       string[];
  evidence:     string[];
  stateMemory:  Array<{ state: string; hitCount: number; straight: number; boxed: number }>;
  activeWindowCount: number;
  recentHitCount:    number;
};

export function buildConvergenceCandidates(ctx: ChatContext): ConvergenceCandidate[] {
  const today  = todayIso();
  const cutoff = daysAgo(7);

  // Seed candidates from all three live data sources
  type Builder = {
    score:        number;
    terms:        Set<string>;
    dreamers:     Set<string>;
    states:       Set<string>;
    evidence:     string[];
    stateMemory:  Map<string, { hitCount: number; straight: number; boxed: number }>;
    windowCount:  number;
    recentHits:   number;
    hasMemory:    boolean;
    hasRecentHit: boolean;
    hasBacktest:  boolean;
    hasStraight:  boolean;
    familyKey:    string;
  };

  const candidates = new Map<string, Builder>();

  function getOrCreate(number: string, gameType: string): Builder {
    const key = `${number}::${gameType}`;
    if (!candidates.has(key)) {
      candidates.set(key, {
        score: 0, terms: new Set(), dreamers: new Set(), states: new Set(),
        evidence: [], stateMemory: new Map(),
        windowCount: 0, recentHits: 0,
        hasMemory: false, hasRecentHit: false, hasBacktest: false, hasStraight: false,
        familyKey: sortedDigits(number),
      });
    }
    return candidates.get(key)!;
  }

  // Active windows → +3 each, +1 if fresh
  for (const w of ctx.windows) {
    if (!isActiveWindow(w, today)) continue;
    const num = String(w.number ?? '').trim();
    const gt  = String(w.gameType ?? '').trim();
    if (!num || !gt) continue;

    const c = getOrCreate(num, gt);
    c.score += 3;
    c.windowCount++;
    if (w.termLabel) c.terms.add(String(w.termLabel));
    if (w.dreamerName) c.dreamers.add(String(w.dreamerName));
    if (c.windowCount === 1) { // only add evidence once per window group
      c.evidence.push(`Active dream window — term: "${w.termLabel || '?'}" (${w.dreamerName || 'owner-self'})`);
      c.evidence.push(`Window: ${w.activeStart ?? w.activeWindowStart} → ${w.activeEnd ?? w.activeWindowEnd}`);
    }
    if (isFreshWindow(w, today)) {
      c.score += 1;
      c.evidence.push('Fresh dream within current window');
    }
  }

  // personalHitMappings → +3 for memory, +1 straight, +2 strong state
  for (const m of ctx.mappings) {
    const num = String(m.number ?? '').trim();
    const gt  = String(m.gameType ?? '').trim();
    if (!num || !gt) continue;

    const c = getOrCreate(num, gt);
    if (m.termLabel) c.terms.add(String(m.termLabel));
    if (m.dreamerName) c.dreamers.add(String(m.dreamerName));
    if (m.state) c.states.add(String(m.state));

    const hc = Number(m.hitCount ?? 0);
    const sc = Number(m.straightCount ?? 0);
    const bc = Number(m.boxedCount ?? 0);
    const ss = Number(m.stateStrengthScore ?? 0);

    if (hc > 0) {
      if (!c.hasMemory) {
        c.hasMemory = true;
        c.score += 3;
        c.evidence.push(`As They Fell Before memory: ${hc} hit${hc !== 1 ? 's' : ''} (${m.termLabel || '?'})`);
      }
      if (sc > 0 && !c.hasStraight) {
        c.hasStraight = true;
        c.score += 1;
        c.evidence.push(`Straight hit history exists`);
      }
      if (ss > 5) {
        c.score += 2;
        c.evidence.push(`Strong state memory in ${m.state} (strength: ${ss})`);
      }
    }

    // Build state memory map
    const state = String(m.state ?? 'Unknown');
    const existing = c.stateMemory.get(state);
    if (existing) {
      existing.hitCount += hc;
      existing.straight += sc;
      existing.boxed    += bc;
    } else {
      c.stateMemory.set(state, { hitCount: hc, straight: sc, boxed: bc });
    }
  }

  // Current dream hits → +2 each (capped once per number)
  for (const h of ctx.hits) {
    const num = String(h.candidate ?? '').trim();
    const gt  = String(h.game_type ?? h.gameType ?? '').trim();
    if (!num || !gt) continue;
    if (!isRecentHit(h, cutoff)) continue;

    const c = getOrCreate(num, gt);
    if (!c.hasRecentHit) {
      c.hasRecentHit = true;
      c.score += 2;
      const t = h.match_type === 'exact' ? 'straight' : 'boxed';
      c.evidence.push(`Recent current hit: ${h.state} ${num} ${t} (${h.draw_date})`);
    }
    c.recentHits++;
    if (h.state) c.states.add(String(h.state));
  }

  // Backtest memory → +2 if number appears as bestTerm number in a completed backtest
  const backtestTerms = new Set<string>();
  for (const bt of ctx.backtests) {
    if (bt.bestTerm) backtestTerms.add(String(bt.bestTerm).toLowerCase());
  }
  for (const [, c] of candidates) {
    for (const term of c.terms) {
      if (backtestTerms.has(term.toLowerCase()) && !c.hasBacktest) {
        c.hasBacktest = true;
        c.score += 2;
        c.evidence.push(`Backtest memory supports term "${term}"`);
        break;
      }
    }
  }

  // Post-process: multi-term +2, multi-dreamer +1, boxed family +1
  const familyMap = new Map<string, string[]>();
  for (const [key, c] of candidates) {
    const fk = c.familyKey;
    if (!familyMap.has(fk)) familyMap.set(fk, []);
    familyMap.get(fk)!.push(key);
  }

  for (const [, c] of candidates) {
    if (c.terms.size >= 2) {
      c.score += 2;
      c.evidence.push(`Number appears under ${c.terms.size} different terms: ${Array.from(c.terms).slice(0, 3).join(', ')}`);
    }
    if (c.dreamers.size >= 2) {
      c.score += 1;
      c.evidence.push(`Appears across ${c.dreamers.size} dreamers`);
    }
    const siblings = familyMap.get(c.familyKey) ?? [];
    if (siblings.length >= 2 && c.hasMemory) {
      c.score += 1;
      c.evidence.push(`Box family ${c.familyKey} has ${siblings.length} members with activity`);
    }
  }

  // Convert to output array, sort by score
  return Array.from(candidates.entries())
    .map(([key, c]) => {
      const [number, gameType] = key.split('::');
      return {
        number,
        gameType,
        score:   c.score,
        label:   confidenceLabel(c.score),
        terms:   Array.from(c.terms),
        dreamers: Array.from(c.dreamers),
        states:  Array.from(c.states),
        evidence: c.evidence,
        stateMemory: Array.from(c.stateMemory.entries())
          .map(([state, m]) => ({ state, hitCount: m.hitCount, straight: m.straight, boxed: m.boxed }))
          .sort((a, b) => b.hitCount - a.hitCount),
        activeWindowCount: c.windowCount,
        recentHitCount:    c.recentHits,
      };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ─── Answer generators ────────────────────────────────────────────────────────

function formatCandidate(c: ConvergenceCandidate, rank?: number): string {
  const lines: string[] = [];
  const rankStr = rank !== undefined ? `#${rank} ` : '';
  lines.push(`**${rankStr}${c.number} (${c.gameType})**  ·  ${c.label} (${c.score} pts)`);

  if (c.terms.length)     lines.push(`Terms: ${c.terms.join(', ')}`);
  if (c.dreamers.length)  lines.push(`Dreamer(s): ${c.dreamers.join(', ')}`);

  lines.push('Evidence:');
  for (const e of c.evidence.slice(0, 6)) lines.push(`  • ${e}`);

  if (c.stateMemory.length > 0) {
    const top = c.stateMemory.slice(0, 3);
    lines.push(`Top states: ${top.map(s => `${s.state} (${s.hitCount} hits, ${s.straight}S/${s.boxed}B)`).join(' · ')}`);
  }
  return lines.join('\n');
}

function answerSystemOverview(ctx: ChatContext): string {
  const today   = todayIso();
  const cutoff  = daysAgo(7);
  const liveWin = ctx.windows.filter(w => isActiveWindow(w, today));
  const recentH = ctx.hits.filter(h => isRecentHit(h, cutoff));
  const candidates = buildConvergenceCandidates(ctx).slice(0, 5);

  const latestDream = ctx.dreams.length > 0 ? ctx.dreams[0] : null;
  const activeDreamers = [...new Set(liveWin.map(w => w.dreamerName || w.dreamerId).filter(Boolean))];

  const lines: string[] = [
    `**Sigil & Slumber System Status — ${today}**`,
    '',
    `Active dream windows: **${liveWin.length}**`,
    `Recent hits (last 7 days): **${recentH.length}**`,
    `Personal memory rows: **${ctx.mappings.length}**`,
    `Dictionary mappings: **${ctx.dictionaryTerms.length}**`,
    `Backtest records: **${ctx.backtests.length}**`,
    latestDream ? `Latest dream: ${latestDream.dreamDate} (${latestDream.dreamerName || 'owner-self'})` : 'No dreams saved yet.',
    activeDreamers.length ? `Active dreamers: ${activeDreamers.slice(0, 5).join(', ')}` : '',
    ctx.engineStatus
      ? `Engine: ${ctx.engineStatus.is_current ? '✓ Current' : '⚠ Stale'} — last ingest: ${ctx.engineStatus.last_run_at ? new Date(ctx.engineStatus.last_run_at).toLocaleString() : '—'}`
      : 'Engine status: not loaded',
    '',
  ];

  if (candidates.length === 0) {
    lines.push('No converging candidates found yet. Add current dreams and run Refresh Now to populate the system.');
  } else {
    lines.push(`**Top ${candidates.length} Converging Candidates:**`);
    lines.push('');
    candidates.forEach((c, i) => {
      lines.push(formatCandidate(c, i + 1));
      lines.push('');
    });
  }

  return lines.filter(l => l !== undefined).join('\n');
}

function answerNumberRecommendation(ctx: ChatContext): string {
  const candidates = buildConvergenceCandidates(ctx).slice(0, 10);
  if (candidates.length === 0) {
    return 'No converging candidates found. Make sure you have active dream windows — go to New Dream Entry and save a parsed dream, then run Refresh Now from the Dashboard.';
  }

  const lines = [
    `**Top ${candidates.length} Recommended Candidates by System Convergence**`,
    '',
    'These are ranked by how much system evidence supports each number — not by lottery probability.',
    '',
  ];

  candidates.forEach((c, i) => {
    lines.push(formatCandidate(c, i + 1));
    lines.push('');
  });

  return lines.join('\n');
}

function answerTermQuestion(q: string, ctx: ChatContext): string {
  const today  = todayIso();
  const cutoff = daysAgo(7);

  // Extract term name from question
  const patterns = [
    /what does (.+?) mean/i,
    /show me (.+?) numbers/i,
    /what has (.+?) done/i,
    /numbers for (.+)/i,
    /dictionary for (.+)/i,
    /term (.+)/i,
    /about (.+)/i,
  ];
  let termQuery = '';
  for (const p of patterns) {
    const m = q.match(p);
    if (m) { termQuery = m[1].trim().toLowerCase(); break; }
  }
  if (!termQuery) termQuery = q.toLowerCase().replace(/show|me|what|does|mean|numbers|for|term|the|word/g, '').trim();

  const matchingMappings = ctx.mappings.filter(m =>
    String(m.termLabel ?? '').toLowerCase().includes(termQuery)
  );
  const matchingDict = ctx.dictionaryTerms.filter(d =>
    String(d.termLabel ?? '').toLowerCase().includes(termQuery)
  );
  const matchingWindows = ctx.windows.filter(w =>
    String(w.termLabel ?? '').toLowerCase().includes(termQuery) && isActiveWindow(w, today)
  );
  const matchingHits = ctx.hits.filter(h =>
    String(h.termLabel ?? '').toLowerCase().includes(termQuery) && isRecentHit(h, cutoff)
  );

  if (matchingMappings.length === 0 && matchingDict.length === 0 && matchingWindows.length === 0) {
    return `No data found for term "${termQuery}". Try a different spelling or check the Universal Dictionary.`;
  }

  const lines: string[] = [`**Term: "${termQuery}"**`, ''];

  // Active windows
  if (matchingWindows.length > 0) {
    lines.push(`**Active Windows (${matchingWindows.length}):**`);
    for (const w of matchingWindows.slice(0, 5)) {
      lines.push(`  • ${w.number} (${w.gameType}) — ${w.dreamerName || 'owner-self'} — window: ${w.activeStart ?? w.activeWindowStart} → ${w.activeEnd ?? w.activeWindowEnd}`);
    }
    lines.push('');
  }

  // Dictionary (all mapped numbers)
  const dictNumbers = [...new Set(matchingDict.filter(d => d.number).map(d => `${d.number} (${d.gameType})`))];;
  if (dictNumbers.length > 0) {
    lines.push(`**Mapped Numbers in Universal Dictionary:**`);
    lines.push(dictNumbers.slice(0, 10).join(', '));
    lines.push('');
  }

  // As They Fell Before (confirmed hits)
  if (matchingMappings.length > 0) {
    lines.push(`**As They Fell Before Memory (${matchingMappings.length} rows):**`);
    const byNumber = new Map<string, { states: string[]; hits: number; straight: number; boxed: number }>();
    for (const m of matchingMappings) {
      const key = `${m.number}__${m.gameType}`;
      const ex  = byNumber.get(key);
      const hc  = Number(m.hitCount ?? 0);
      const sc  = Number(m.straightCount ?? 0);
      const bc  = Number(m.boxedCount ?? 0);
      if (!ex) {
        byNumber.set(key, { states: [m.state], hits: hc, straight: sc, boxed: bc });
      } else {
        ex.hits     += hc; ex.straight += sc; ex.boxed += bc;
        if (m.state && !ex.states.includes(m.state)) ex.states.push(m.state);
      }
    }
    Array.from(byNumber.entries()).slice(0, 8).forEach(([key, v]) => {
      const [num, gt] = key.split('__');
      lines.push(`  • ${num} (${gt}) — ${v.hits} hit${v.hits !== 1 ? 's' : ''} — ${v.straight}S/${v.boxed}B — states: ${v.states.slice(0, 4).join(', ')}`);
    });
    lines.push('');
  }

  // Recent hits
  if (matchingHits.length > 0) {
    lines.push(`**Recent Hits (last 7 days):**`);
    for (const h of matchingHits.slice(0, 5)) {
      const t = h.match_type === 'exact' ? 'straight' : 'boxed';
      lines.push(`  • ${h.candidate} → ${h.winning_number} in ${h.state} (${t}, ${h.draw_date})`);
    }
  }

  return lines.join('\n');
}

function answerStateQuestion(q: string, ctx: ChatContext): string {
  const today  = todayIso();
  const cutoff = daysAgo(7);
  const stateCode = extractStateFromQuery(q);

  if (!stateCode) {
    // "which states are hot" — rank states by activity
    const stateScore = new Map<string, number>();
    for (const m of ctx.mappings) {
      if (!m.state) continue;
      stateScore.set(m.state, (stateScore.get(m.state) ?? 0) + Number(m.stateStrengthScore ?? 0));
    }
    for (const h of ctx.hits.filter(h => isRecentHit(h, cutoff))) {
      stateScore.set(h.state, (stateScore.get(h.state) ?? 0) + 5);
    }
    const ranked = Array.from(stateScore.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!ranked.length) return 'No state activity data yet. Run a dream refresh to detect hits by state.';
    const lines = ['**Hottest States by System Activity:**', ''];
    ranked.forEach(([state, score], i) => {
      lines.push(`#${i + 1} ${state} — strength score: ${score}`);
    });
    return lines.join('\n');
  }

  // Build playlist for specific state
  const winCands  = ctx.windows.filter(w => isActiveWindow(w, today));
  const memByNum  = new Map<string, any>();
  for (const m of ctx.mappings) {
    if (String(m.state ?? '').toUpperCase() !== stateCode) continue;
    const key = `${m.number}::${m.gameType}`;
    const ex  = memByNum.get(key);
    if (!ex || Number(m.stateStrengthScore ?? 0) > Number(ex.stateStrengthScore ?? 0)) {
      memByNum.set(key, m);
    }
  }

  const allNums = new Set([
    ...winCands.map(w => `${w.number}::${w.gameType}`),
    ...memByNum.keys(),
  ]);

  type Entry = { number: string; gameType: string; term: string; dreamer: string; hitCount: number; straight: number; boxed: number; isActive: boolean };
  const entries: Entry[] = [];

  for (const key of allNums) {
    const [number, gameType] = key.split('::');
    const win = winCands.find(w => w.number === number && w.gameType === gameType);
    const mem = memByNum.get(key);
    entries.push({
      number, gameType,
      term:    win?.termLabel ?? mem?.termLabel ?? '—',
      dreamer: win?.dreamerName ?? mem?.dreamerName ?? '—',
      hitCount: Number(mem?.hitCount ?? 0),
      straight: Number(mem?.straightCount ?? 0),
      boxed:    Number(mem?.boxedCount ?? 0),
      isActive: !!win,
    });
  }

  entries.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || b.hitCount - a.hitCount);

  if (!entries.length) {
    return `No candidates found for ${stateCode}. Either no active windows target this state or no hit memory exists for it.`;
  }

  const lines: string[] = [`**${stateCode} State Playlist (${entries.length} candidates)**`, ''];
  entries.slice(0, 15).forEach((e, i) => {
    const badge = e.isActive ? '⚡ ACTIVE' : '📖 Memory';
    const mem   = e.hitCount > 0 ? ` — ${e.hitCount} hit${e.hitCount !== 1 ? 's' : ''} (${e.straight}S/${e.boxed}B)` : '';
    lines.push(`#${i + 1} ${e.number} (${e.gameType}) ${badge} — term: ${e.term} — dreamer: ${e.dreamer}${mem}`);
  });

  return lines.join('\n');
}

function answerDreamerQuestion(q: string, ctx: ChatContext): string {
  const lq = normalizeQ(q);

  // Try to find a matching dreamer by name
  let targetDreamer = ctx.dreamers.find(d =>
    lq.includes(String(d.displayName ?? '').toLowerCase())
  );

  // Fall back to owner-self
  const dreamerFilter = targetDreamer?.id ?? 'owner-self';
  const dreamerName   = targetDreamer?.displayName ?? 'Owner / Self';

  const today   = todayIso();
  const myWindows = ctx.windows.filter(w =>
    isActiveWindow(w, today) &&
    (w.dreamerId === dreamerFilter || (dreamerFilter === 'owner-self' && (!w.dreamerId || w.dreamerId === 'owner-self')))
  );
  const myMappings = ctx.mappings.filter(m =>
    m.dreamerId === dreamerFilter || (dreamerFilter === 'owner-self' && (!m.dreamerId || m.dreamerId === 'owner-self'))
  );

  const lines: string[] = [`**${dreamerName} — System Profile**`, ''];
  lines.push(`Active windows: ${myWindows.length}`);
  lines.push(`Personal dictionary rows: ${myMappings.length}`);
  lines.push('');

  if (myWindows.length > 0) {
    lines.push('**Active Candidates:**');
    myWindows.slice(0, 8).forEach(w => {
      lines.push(`  • ${w.number} (${w.gameType}) — term: "${w.termLabel}" — ${w.activeStart ?? w.activeWindowStart} → ${w.activeEnd ?? w.activeWindowEnd}`);
    });
    lines.push('');
  }

  if (myMappings.length > 0) {
    const termHits = new Map<string, number>();
    for (const m of myMappings) {
      if (m.termLabel) termHits.set(m.termLabel, (termHits.get(m.termLabel) ?? 0) + Number(m.hitCount ?? 0));
    }
    const topTerms = Array.from(termHits.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topTerms.length > 0) {
      lines.push('**Strongest Terms (by hits):');
      topTerms.forEach(([term, hits]) => lines.push(`  • ${term} — ${hits} hit${hits !== 1 ? 's' : ''}`));
    }
  }

  return lines.join('\n');
}

function answerDiagnostic(ctx: ChatContext): string {
  const today   = todayIso();
  const cutoff  = daysAgo(7);
  const liveWin = ctx.windows.filter(w => isActiveWindow(w, today));
  const recentH = ctx.hits.filter(h => isRecentHit(h, cutoff));

  // Find most recent lastCheckedAt across windows
  let lastChecked = '';
  for (const w of ctx.windows) {
    const lc = String(w.lastCheckedAt ?? '');
    if (lc > lastChecked) lastChecked = lc;
  }

  const issues: string[] = [];
  if (ctx.windows.length === 0)     issues.push('⚠ No active windows found — have you saved any current dreams?');
  else if (liveWin.length === 0)    issues.push('⚠ All windows are expired — save a new dream to create fresh windows.');
  if (!lastChecked)                 issues.push('⚠ No refresh has run yet — click Refresh Now from the Dashboard.');
  else {
    const hoursAgo = Math.round((Date.now() - new Date(lastChecked).getTime()) / 3_600_000);
    if (hoursAgo > 6) issues.push(`⚠ Last refresh was ${hoursAgo}h ago — consider refreshing to catch recent draws.`);
  }
  if (ctx.hits.length === 0)        issues.push('ℹ No current dream hits yet — hits appear after a refresh finds matching draws.');
  if (ctx.mappings.length === 0)    issues.push('⚠ No personal hit memory (As They Fell Before is empty) — run promote-hits or an engine backtest.');

  const lines: string[] = ['**System Diagnostic**', ''];
  lines.push(`Active windows: ${liveWin.length} of ${ctx.windows.length} total`);
  lines.push(`Last refresh: ${lastChecked ? lastChecked.slice(0, 16).replace('T', ' ') + ' UTC' : 'never'}`);
  lines.push(`Current dream hits: ${ctx.hits.length} total, ${recentH.length} in last 7 days`);
  lines.push(`Personal memory rows: ${ctx.mappings.length}`);
  lines.push(`Dictionary mappings: ${ctx.dictionaryTerms.length}`);
  lines.push(`Dreamers: ${ctx.dreamers.length + 1} (including owner-self)`);
  lines.push(`Backtest records: ${ctx.backtests.length}`);

  if (ctx.engineStatus) {
    lines.push(`Engine: ${ctx.engineStatus.is_current ? '✓ Current' : '⚠ Stale'} — last ingest: ${ctx.engineStatus.last_run_at ? new Date(ctx.engineStatus.last_run_at).toLocaleString() : '—'}`);
  } else {
    lines.push('Engine status: not available from chat context');
  }

  if (issues.length > 0) {
    lines.push('');
    lines.push('**Issues detected:**');
    issues.forEach(i => lines.push(i));
  } else {
    lines.push('');
    lines.push('✓ System appears healthy. All data sources are populated.');
  }

  return lines.join('\n');
}

function answerHelp(): string {
  return `**Sigil & Slumber Intelligence Chat**

I can answer questions about your dream intelligence system using live data from your active windows, hit memory, and personal dictionary.

**What you can ask:**

*System overview:*
  • "What's going on today?"
  • "What's converging right now?"
  • "Give me today's strongest plays."

*Number recommendations:*
  • "What numbers should I play?"
  • "Show me the top candidates."
  • "Recommend numbers for this week."

*Term questions:*
  • "What does 'sister' mean in my dictionary?"
  • "Show me fear numbers."
  • "What has mountain done before?"

*State questions:*
  • "What should I watch in Georgia?"
  • "Which states are hottest?"
  • "Build me a South Carolina playlist."

*Dreamer questions:*
  • "What is active for me?"
  • "What is active for Jamala?"
  • "Show my personal dictionary."

*Diagnostics:*
  • "Are my windows active?"
  • "Did the refresh run?"
  • "Why are no hits showing?"

*Important:* I never claim guaranteed wins. Confidence labels reflect system convergence across dreams, memory, and hits — not lottery probability.`;
}

// ─── Convergence, pinned, proof answer functions ──────────────────────────────

function answerConvergence(ctx: ChatContext): string {
  const sb = ctx.scopeBundle;
  if (!sb) return 'No active signals yet. Write a dream and run a refresh to see convergence.';

  const lines: string[] = ['**Cross-Dreamer Convergence Summary**', ''];
  lines.push(`Active dreamers: ${sb.activeDreamers} · Active windows: ${sb.activeWindows}`);
  lines.push(`Watch items: ${sb.watchItems}`);
  lines.push('');
  if (sb.repeatedTerms.length > 0) {
    lines.push(`**Terms appearing across multiple windows:** ${sb.repeatedTerms.join(', ')}`);
  }
  if (sb.topNumbers.length > 0) {
    lines.push(`**Numbers with fell-before evidence:** ${sb.topNumbers.join(', ')}`);
  }
  if (sb.topStates.length > 0) {
    lines.push(`**Top states with evidence:** ${sb.topStates.join(', ')}`);
  }
  lines.push('');
  lines.push(`Top signal tier: **${sb.topFocusTier}**`);
  lines.push('');
  lines.push('See /universal-scope for full convergence details or /playlists for state-specific candidates.');
  return lines.join('\n');
}

function answerPinned(ctx: ChatContext): string {
  const active = ctx.pinnedPlays.filter((p: any) => p.status === 'pinned' || p.status === 'suggested');
  if (active.length === 0) return 'No pinned or suggested plays yet. Visit Hot Families or State Playlists to promote candidates.';

  const lines: string[] = ['**Pinned & Suggested Plays**', ''];
  const pinned    = active.filter((p: any) => p.status === 'pinned');
  const suggested = active.filter((p: any) => p.status === 'suggested');

  if (pinned.length > 0) {
    lines.push(`**Pinned (${pinned.length}):**`);
    for (const p of pinned.slice(0, 6)) {
      const terms = [...new Set([p.sourceTerm, ...(p.sourceTerms ?? [])].filter(Boolean))].join(', ') || '—';
      lines.push(`  • ${p.number ?? '—'} (${p.gameType ?? '—'})${p.state ? ` · ${p.state}` : ''} — ${terms}`);
    }
    lines.push('');
  }
  if (suggested.length > 0) {
    lines.push(`**Suggested (${suggested.length}):**`);
    for (const p of suggested.slice(0, 6)) {
      lines.push(`  • ${p.number ?? '—'} (${p.gameType ?? '—'})${p.state ? ` · ${p.state}` : ''}`);
    }
  }
  lines.push('');
  lines.push('Manage at /pinned-plays.');
  return lines.join('\n');
}

function answerProof(ctx: ChatContext): string {
  const byTerm = new Map<string, { states: string[]; hitCount: number }>();
  for (const m of ctx.mappings) {
    const k = String(m.termLabel ?? '').trim().toLowerCase();
    if (!k) continue;
    if (!byTerm.has(k)) byTerm.set(k, { states: [], hitCount: 0 });
    const ev = byTerm.get(k)!;
    const st = String(m.state ?? '');
    if (st && !ev.states.includes(st)) ev.states.push(st);
    ev.hitCount += Number(m.hitCount ?? 1);
  }

  if (byTerm.size === 0) return 'No fell-before proof memory yet. Run a refresh or engine backtest to build evidence.';

  const sorted = Array.from(byTerm.entries())
    .sort((a, b) => b[1].hitCount - a[1].hitCount)
    .slice(0, 12);

  const lines = ['**Fell-Before Proof — Terms with Evidence**', ''];
  for (const [term, ev] of sorted) {
    lines.push(`**${term}** — ${ev.hitCount} hit${ev.hitCount !== 1 ? 's' : ''} · States: ${ev.states.slice(0, 6).join(', ')}`);
  }
  lines.push('');
  lines.push('Full state-level evidence at /fell-before.');
  return lines.join('\n');
}

// ─── Main answer dispatcher ───────────────────────────────────────────────────

export function answerQuestion(question: string, ctx: ChatContext): string {
  const intent = detectIntent(question);

  if (!ctx.ownerUid) {
    return 'System data is still loading. Please wait a moment and try again.';
  }

  switch (intent) {
    case 'system-overview':        return answerSystemOverview(ctx);
    case 'number-recommendation':  return answerNumberRecommendation(ctx);
    case 'term-question':          return answerTermQuestion(question, ctx);
    case 'state-question':         return answerStateQuestion(question, ctx);
    case 'dreamer-question':       return answerDreamerQuestion(question, ctx);
    case 'diagnostic':             return answerDiagnostic(ctx);
    case 'convergence-question':   return answerConvergence(ctx);
    case 'pinned-question':        return answerPinned(ctx);
    case 'proof-question':         return answerProof(ctx);
    case 'results-question':
      return 'Results are engine-backed in the Results Log (`/results`). This chat summarizes your saved dreams, hits, and personal hit memory — not raw lottery draws. Head to Results Log to browse draws by state and date.';
    case 'help':
      return answerHelp();
    default:
      return answerSystemOverview(ctx);
  }
}
