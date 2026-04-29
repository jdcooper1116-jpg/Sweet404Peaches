/**
 * src/lib/intelligence/universalScope.ts
 *
 * Pure intelligence functions for the Universal Scope Collective Dream
 * Intelligence Center. No React, no Firestore, no side effects.
 *
 * All functions take already-fetched data arrays (from quota-capped server
 * routes) and return structured signal objects.
 *
 * Future-ready: UniversalSignal type is designed to eventually map to a
 * stored `universalSignals` Firestore collection, but nothing is written here.
 */

// ─── Raw input types (matching API response shapes) ───────────────────────────

export type RawWindow = {
  id?:            string;
  dreamEntryId?:  string;
  dreamerName?:   string;
  dreamerId?:     string;
  termLabel?:     string;
  number?:        string;
  gameType?:      string;
  activeStart?:   string;
  activeEnd?:     string;
  newHitsSinceLastCheck?: number;
};

export type RawFellRow = {
  termLabel?:   string;
  number?:      string;
  gameType?:    string;
  state?:       string;
  hitCount?:    number;
  straightCount?: number;
  boxedCount?:  number;
  lastHitDate?: string;
  dreamerId?:   string;
  dreamerName?: string;
};

export type RawHit = {
  candidate?:      string;
  state?:          string;
  draw_date?:      string;
  dreamerName?:    string;
  dreamerId?:      string;
  termLabel?:      string;
  game_type?:      string;
  match_type?:     string;
};

export type RawPinnedPlay = {
  id?:          string;
  number?:      string;
  gameType?:    string;
  state?:       string;
  sourceTerms?: string[];
  sourceTerm?:  string;
  status?:      string;
  source?:      string;
  reason?:      string;
  evidenceBadges?: string[];
  dreamerName?: string;
  dreamerId?:   string;
  hitCount?:    number;
  updatedAt?:   string;
};

// ─── Output signal types ──────────────────────────────────────────────────────

/** A window grouped by dreamEntryId — all number/term data merged into arrays */
export type GroupedWindow = {
  dreamEntryId:  string;
  dreamerName:   string;
  dreamerId:     string;
  activeStart:   string;
  activeEnd:     string;
  cash3:         string[];
  cash4:         string[];
  termMap:       Record<string, { cash3: string[]; cash4: string[] }>;
  newHits:       number;
};

/** Fell-before evidence for a specific term::number::gameType key */
export type FellEvidence = {
  states:        string[];
  hitCount:      number;
  lastHitDate:   string;
  stateDetails:  Map<string, { hitCount: number; matchType: string }>;
};

/** A term seen across multiple dreamers/windows — convergence signal */
export type TermSignal = {
  term:          string;
  dreamerIds:    string[];
  dreamerNames:  string[];
  windowCount:   number;
  numbers:       Array<{ num: string; gt: 'cash3' | 'cash4' }>;
  hasFellBefore: boolean;
  fellStates:    string[];
  fellHitCount:  number;
};

/** An exact number seen across multiple terms/dreamers/windows */
export type NumberSignal = {
  number:        string;
  gameType:      'cash3' | 'cash4';
  boxedKey:      string;
  terms:         string[];
  dreamerIds:    string[];
  dreamerNames:  string[];
  windowCount:   number;
  hasFellBefore: boolean;
  fellStates:    string[];
  fellHitCount:  number;
  isPinned:      boolean;
  isSuggested:   boolean;
};

/** Boxed digit-family convergence across terms and dreamers */
export type BoxedSignal = {
  boxedKey:      string;
  gameType:      'cash3' | 'cash4';
  numbers:       string[];
  terms:         string[];
  dreamerIds:    string[];
  dreamerNames:  string[];
  windowCount:   number;
  hasFellBefore: boolean;
  fellStates:    string[];
  fellHitCount:  number;
  strength:      number;
};

/** Fell-before proof for an active term-number pair */
export type FellProofRow = {
  term:          string;
  number:        string;
  gameType:      string;
  states:        string[];
  hitCount:      number;
  lastHitDate:   string;
  dreamerIds:    string[];
  dreamerNames:  string[];
};

/** State focus board entry */
export type StateEntry = {
  state: string;
  plays: Array<{
    number:        string;
    gameType:      string;
    terms:         string[];
    dreamerNames:  string[];
    hitCount:      number;
    hasFellBefore: boolean;
  }>;
};

/**
 * Future-ready universal signal shape — maps 1:1 to a future
 * `universalSignals` Firestore document when we add that collection.
 */
export type UniversalSignal = {
  signalId:        string;
  signalType:      'term' | 'number' | 'boxedFamily' | 'state' | 'dreamer' | 'pinnedCandidate';
  termLabels:      string[];
  numbers:         string[];
  gameType:        'cash3' | 'cash4' | '';
  boxedKey:        string;
  dreamerIds:      string[];
  dreamerNames:    string[];
  states:          string[];
  activeWindowIds: string[];
  fellBeforeHitCount: number;
  recentHitCount:  number;
  pinnedStatus:    string;
  score:           number;
  confidenceTier:  FocusTier;
  reason:          string;
  evidenceBadges:  string[];
};

export type FocusTier = 'Strong Focus' | 'Moderate Focus' | 'Watchlist' | 'Needs More Evidence';

/** A ranked focus recommendation for today */
export type FocusRec = {
  id:            string;
  number:        string;
  gameType:      'cash3' | 'cash4';
  boxedKey:      string;
  terms:         string[];
  dreamerNames:  string[];
  states:        string[];
  score:         number;
  tier:          FocusTier;
  reason:        string;
  evidenceBadges:string[];
  isPinned:      boolean;
  isSuggested:   boolean;
};

export type ScopeStats = {
  activeDreamers:        number;
  activeWindows:         number;
  watchItems:            number;
  repeatedTerms:         number;
  repeatedNumbers:       number;
  hotBoxedFamilies:      number;
  stateSupportedPlays:   number;
  suggestedPinnedPlays:  number;
  recentHits:            number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sort digit characters ascending — preserves leading zeros */
export function boxedKey(num: string): string {
  return num.split('').sort().join('');
}

function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ─── Step 1: Group raw windows by dreamEntryId ────────────────────────────────

export function buildGroupedWindows(
  raw: RawWindow[],
  today: string
): GroupedWindow[] {
  const map = new Map<string, GroupedWindow>();

  for (const row of raw) {
    const eid  = String(row.dreamEntryId || row.id || '');
    const ae   = String(row.activeEnd   || '');
    if (!eid) continue;
    // Active-only: skip expired rows that may have slipped through
    if (ae && ae < today) continue;

    if (!map.has(eid)) {
      map.set(eid, {
        dreamEntryId: eid,
        dreamerName:  String(row.dreamerName || ''),
        dreamerId:    String(row.dreamerId   || 'owner-self'),
        activeStart:  String(row.activeStart || ''),
        activeEnd:    ae,
        cash3: [], cash4: [], termMap: {}, newHits: 0,
      });
    }
    const g   = map.get(eid)!;
    const gt  = String(row.gameType  || '');
    const num = String(row.number    || '').trim();
    const tl  = String(row.termLabel || '').trim().toLowerCase();

    if (num) {
      if (gt === 'cash4') { if (!g.cash4.includes(num)) g.cash4.push(num); }
      else                { if (!g.cash3.includes(num)) g.cash3.push(num); }
    }
    if (tl && num) {
      if (!g.termMap[tl]) g.termMap[tl] = { cash3: [], cash4: [] };
      const bucket = gt === 'cash4' ? g.termMap[tl].cash4 : g.termMap[tl].cash3;
      if (!bucket.includes(num)) bucket.push(num);
    }
    g.newHits += Number(row.newHitsSinceLastCheck ?? 0);
    if (!g.dreamerName && row.dreamerName) g.dreamerName = String(row.dreamerName);
  }

  return Array.from(map.values());
}

// ─── Step 2: Build fell-before index ─────────────────────────────────────────

export function buildFellIndex(rows: RawFellRow[]): Map<string, FellEvidence> {
  const idx = new Map<string, FellEvidence>();

  for (const row of rows) {
    const term  = String(row.termLabel ?? '').trim().toLowerCase();
    const num   = String(row.number   ?? '').trim();
    const gt    = String(row.gameType ?? '').trim();
    const state = String(row.state    ?? '').trim();
    if (!term || !num || !state) continue;

    const key = `${term}::${num}::${gt}`;
    if (!idx.has(key)) idx.set(key, { states: [], hitCount: 0, lastHitDate: '', stateDetails: new Map() });
    const ev = idx.get(key)!;
    if (!ev.states.includes(state)) ev.states.push(state);
    ev.hitCount += Number(row.hitCount ?? 1);
    const lhd = String(row.lastHitDate ?? '');
    if (lhd > ev.lastHitDate) ev.lastHitDate = lhd;

    const sc = Number(row.straightCount ?? 0);
    const bc = Number(row.boxedCount    ?? 0);
    const mt = sc > 0 && bc > 0 ? 'mixed' : sc > 0 ? 'straight' : 'boxed';
    const prev = ev.stateDetails.get(state);
    if (!prev) ev.stateDetails.set(state, { hitCount: Number(row.hitCount ?? 1), matchType: mt });
    else prev.hitCount += Number(row.hitCount ?? 1);
  }

  return idx;
}

// ─── Step 3: Active dreamer stream ────────────────────────────────────────────

export function buildDreamerStream(
  grouped: GroupedWindow[],
  ownerDisplayName: string
): (GroupedWindow & { dreamerLabel: string })[] {
  return grouped.map(g => ({
    ...g,
    dreamerLabel: g.dreamerId === 'owner-self'
      ? (ownerDisplayName || 'Owner / Self')
      : (g.dreamerName || g.dreamerId),
  })).sort((a, b) => (b.activeEnd > a.activeEnd ? 1 : -1));
}

// ─── Step 4: Cross-dreamer term convergence ───────────────────────────────────

export function buildTermConvergence(
  grouped: GroupedWindow[],
  fellIdx: Map<string, FellEvidence>
): TermSignal[] {
  const map = new Map<string, TermSignal>();

  for (const win of grouped) {
    for (const [term, payload] of Object.entries(win.termMap)) {
      if (!map.has(term)) {
        map.set(term, {
          term, dreamerIds: [], dreamerNames: [], windowCount: 0,
          numbers: [], hasFellBefore: false, fellStates: [], fellHitCount: 0,
        });
      }
      const sig = map.get(term)!;
      if (!sig.dreamerIds.includes(win.dreamerId)) {
        sig.dreamerIds.push(win.dreamerId);
        sig.dreamerNames.push(win.dreamerName || win.dreamerId);
      }
      sig.windowCount++;
      for (const n of payload.cash3) {
        if (!sig.numbers.find(x => x.num === n && x.gt === 'cash3'))
          sig.numbers.push({ num: n, gt: 'cash3' });
        const ev = fellIdx.get(`${term}::${n}::cash3`);
        if (ev) { sig.hasFellBefore = true; sig.fellHitCount += ev.hitCount; sig.fellStates = dedup([...sig.fellStates, ...ev.states]); }
      }
      for (const n of payload.cash4) {
        if (!sig.numbers.find(x => x.num === n && x.gt === 'cash4'))
          sig.numbers.push({ num: n, gt: 'cash4' });
        const ev = fellIdx.get(`${term}::${n}::cash4`);
        if (ev) { sig.hasFellBefore = true; sig.fellHitCount += ev.hitCount; sig.fellStates = dedup([...sig.fellStates, ...ev.states]); }
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.dreamerIds.length - a.dreamerIds.length || b.windowCount - a.windowCount);
}

// ─── Step 5: Exact number convergence ────────────────────────────────────────

export function buildNumberConvergence(
  grouped: GroupedWindow[],
  fellIdx: Map<string, FellEvidence>,
  pinned: RawPinnedPlay[]
): NumberSignal[] {
  type Draft = NumberSignal & { winIds: string[] };
  const map = new Map<string, Draft>();

  const pinnedNums = new Set(
    pinned.filter(p => p.status === 'pinned').map(p => `${p.number ?? ''}::${p.gameType ?? ''}`)
  );
  const suggestedNums = new Set(
    pinned.filter(p => p.status === 'suggested').map(p => `${p.number ?? ''}::${p.gameType ?? ''}`)
  );

  for (const win of grouped) {
    for (const [term, payload] of Object.entries(win.termMap)) {
      const addNum = (num: string, gt: 'cash3' | 'cash4') => {
        const key = `${num}::${gt}`;
        if (!map.has(key)) {
          const ev = fellIdx.get(`${term}::${num}::${gt}`);
          map.set(key, {
            number: num, gameType: gt, boxedKey: boxedKey(num),
            terms: [], dreamerIds: [], dreamerNames: [], windowCount: 0,
            hasFellBefore: ev ? ev.states.length > 0 : false,
            fellStates: ev ? [...ev.states] : [],
            fellHitCount: ev?.hitCount ?? 0,
            isPinned: pinnedNums.has(key),
            isSuggested: suggestedNums.has(key),
            winIds: [],
          });
        }
        const sig = map.get(key)!;
        if (!sig.terms.includes(term))            sig.terms.push(term);
        if (!sig.dreamerIds.includes(win.dreamerId)) {
          sig.dreamerIds.push(win.dreamerId);
          sig.dreamerNames.push(win.dreamerName || win.dreamerId);
        }
        if (!sig.winIds.includes(win.dreamEntryId)) { sig.winIds.push(win.dreamEntryId); sig.windowCount++; }
        // Enrich fell-before from other terms too
        const ev = fellIdx.get(`${term}::${num}::${gt}`);
        if (ev && ev.states.length > 0) {
          sig.hasFellBefore = true;
          sig.fellHitCount += ev.hitCount;
          sig.fellStates = dedup([...sig.fellStates, ...ev.states]);
        }
      };
      payload.cash3.forEach(n => addNum(n, 'cash3'));
      payload.cash4.forEach(n => addNum(n, 'cash4'));
    }
  }

  return Array.from(map.values())
    .sort((a, b) => {
      const scoreA = a.terms.length * 3 + a.dreamerIds.length * 2 + (a.hasFellBefore ? a.fellHitCount : 0);
      const scoreB = b.terms.length * 3 + b.dreamerIds.length * 2 + (b.hasFellBefore ? b.fellHitCount : 0);
      return scoreB - scoreA;
    });
}

// ─── Step 6: Boxed family convergence ────────────────────────────────────────

export function buildBoxedSignals(
  grouped: GroupedWindow[],
  fellIdx: Map<string, FellEvidence>
): BoxedSignal[] {
  const map = new Map<string, BoxedSignal>();

  for (const win of grouped) {
    for (const [term, payload] of Object.entries(win.termMap)) {
      const addNum = (num: string, gt: 'cash3' | 'cash4') => {
        const bk  = boxedKey(num);
        const key = `${bk}::${gt}`;
        if (!map.has(key)) {
          map.set(key, {
            boxedKey: bk, gameType: gt, numbers: [], terms: [],
            dreamerIds: [], dreamerNames: [], windowCount: 0,
            hasFellBefore: false, fellStates: [], fellHitCount: 0, strength: 0,
          });
        }
        const sig = map.get(key)!;
        if (!sig.numbers.includes(num)) sig.numbers.push(num);
        if (!sig.terms.includes(term))  sig.terms.push(term);
        if (!sig.dreamerIds.includes(win.dreamerId)) {
          sig.dreamerIds.push(win.dreamerId);
          sig.dreamerNames.push(win.dreamerName || win.dreamerId);
        }
        sig.windowCount = Math.max(sig.windowCount, win.dreamEntryId ? 1 : 0);
        const ev = fellIdx.get(`${term}::${num}::${gt}`);
        if (ev && ev.states.length > 0) {
          sig.hasFellBefore = true;
          sig.fellHitCount += ev.hitCount;
          sig.fellStates = dedup([...sig.fellStates, ...ev.states]);
        }
      };
      payload.cash3.forEach(n => addNum(n, 'cash3'));
      payload.cash4.forEach(n => addNum(n, 'cash4'));
    }
  }

  return Array.from(map.values())
    .map(s => ({
      ...s,
      numbers: [...s.numbers].sort(),
      strength: s.terms.length * 3 + s.dreamerIds.length * 2 + (s.hasFellBefore ? s.fellHitCount : 0),
    }))
    .filter(s => s.terms.length > 0)
    .sort((a, b) => b.strength - a.strength);
}

// ─── Step 7: Fell-before proof for active terms ───────────────────────────────

export function buildFellProof(
  grouped: GroupedWindow[],
  fellIdx: Map<string, FellEvidence>
): FellProofRow[] {
  const map = new Map<string, FellProofRow>();

  for (const win of grouped) {
    for (const [term, payload] of Object.entries(win.termMap)) {
      for (const [gt, nums] of [['cash3', payload.cash3], ['cash4', payload.cash4]] as ['cash3'|'cash4', string[]][]) {
        for (const num of nums) {
          const ev = fellIdx.get(`${term}::${num}::${gt}`);
          if (!ev || ev.states.length === 0) continue;
          const key = `${term}::${num}::${gt}`;
          if (!map.has(key)) {
            map.set(key, {
              term, number: num, gameType: gt,
              states: [...ev.states], hitCount: ev.hitCount,
              lastHitDate: ev.lastHitDate,
              dreamerIds: [], dreamerNames: [],
            });
          }
          const row = map.get(key)!;
          if (!row.dreamerIds.includes(win.dreamerId)) {
            row.dreamerIds.push(win.dreamerId);
            row.dreamerNames.push(win.dreamerName || win.dreamerId);
          }
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.hitCount - a.hitCount);
}

// ─── Step 8: State focus board ────────────────────────────────────────────────

export function buildStateFocus(
  grouped: GroupedWindow[],
  fellIdx: Map<string, FellEvidence>
): StateEntry[] {
  const stateMap = new Map<string, Map<string, StateEntry['plays'][0]>>();

  for (const win of grouped) {
    for (const [term, payload] of Object.entries(win.termMap)) {
      for (const [gt, nums] of [['cash3', payload.cash3], ['cash4', payload.cash4]] as ['cash3'|'cash4', string[]][]) {
        for (const num of nums) {
          const ev = fellIdx.get(`${term}::${num}::${gt}`);
          if (!ev) continue;
          for (const state of ev.states) {
            if (!stateMap.has(state)) stateMap.set(state, new Map());
            const sPlays = stateMap.get(state)!;
            const playKey = `${num}::${gt}`;
            if (!sPlays.has(playKey)) {
              sPlays.set(playKey, { number: num, gameType: gt, terms: [], dreamerNames: [], hitCount: 0, hasFellBefore: true });
            }
            const play = sPlays.get(playKey)!;
            if (!play.terms.includes(term)) play.terms.push(term);
            const dn = win.dreamerName || win.dreamerId;
            if (!play.dreamerNames.includes(dn)) play.dreamerNames.push(dn);
            play.hitCount += ev.stateDetails.get(state)?.hitCount ?? 1;
          }
        }
      }
    }
  }

  return Array.from(stateMap.entries())
    .map(([state, playMap]) => ({ state, plays: Array.from(playMap.values()).sort((a, b) => b.hitCount - a.hitCount) }))
    .sort((a, b) => b.plays.length - a.plays.length)
    .slice(0, 12);
}

// ─── Step 9: Focus recommendations ───────────────────────────────────────────

export function buildFocusRecs(
  numberSignals: NumberSignal[],
  boxedSignals:  BoxedSignal[],
  fellProof:     FellProofRow[],
  hits:          RawHit[]
): FocusRec[] {
  const recentHitNums = new Set(hits.map(h => String(h.candidate || '')));
  const fellProofNums = new Set(fellProof.map(r => `${r.number}::${r.gameType}`));
  const boxedMultiTerm = new Set(boxedSignals.filter(b => b.terms.length > 1).map(b => `${b.boxedKey}::${b.gameType}`));

  const recs: FocusRec[] = [];

  for (const sig of numberSignals) {
    const gtKey = `${sig.number}::${sig.gameType}`;
    let score = 0;
    const badges: string[] = [];
    const reasons: string[] = [];

    if (sig.terms.length >= 2)        { score += 3; badges.push('Multi-Term');      reasons.push(`${sig.terms.length} active terms`); }
    if (sig.dreamerIds.length >= 2)   { score += 2; badges.push('Multi-Dreamer');   reasons.push(`${sig.dreamerIds.length} dreamers`); }
    if (sig.hasFellBefore)            { score += 2; badges.push('Fell Before');      reasons.push(`${sig.fellStates.length} fell-before state${sig.fellStates.length !== 1 ? 's' : ''}`); }
    if (sig.isPinned)                 { score += 2; badges.push('Pinned'); }
    else if (sig.isSuggested)         { score += 2; badges.push('Suggested'); }
    if (recentHitNums.has(sig.number)){ score += 1; badges.push('Recent Hit'); }
    if (sig.windowCount >= 2)         { score += 1; badges.push('Multi-Window'); }
    if (boxedMultiTerm.has(`${sig.boxedKey}::${sig.gameType}`)) { score += 1; badges.push('Hot Boxed Family'); }

    if (score < 1) continue;

    const tier: FocusTier = score >= 8 ? 'Strong Focus' : score >= 5 ? 'Moderate Focus' : score >= 3 ? 'Watchlist' : 'Needs More Evidence';
    const reasonText = buildReasonText(sig.number, sig.gameType, reasons, sig.terms, sig.fellStates, sig.dreamerNames);

    recs.push({
      id:          `num-${sig.number}-${sig.gameType}`,
      number:      sig.number,
      gameType:    sig.gameType,
      boxedKey:    sig.boxedKey,
      terms:       sig.terms,
      dreamerNames:sig.dreamerNames,
      states:      sig.fellStates,
      score, tier,
      reason:      reasonText,
      evidenceBadges: badges,
      isPinned:    sig.isPinned,
      isSuggested: sig.isSuggested,
    });
  }

  return recs.sort((a, b) => b.score - a.score).slice(0, 20);
}

function buildReasonText(
  num: string, gt: string,
  reasons: string[], terms: string[],
  states: string[], dreamers: string[]
): string {
  const parts: string[] = [];
  if (terms.length > 0) parts.push(`active through ${terms.slice(0, 3).join(', ')}${terms.length > 3 ? ` +${terms.length - 3}` : ''}`);
  if (reasons.length > 0) parts.push(reasons.join(', '));
  if (states.length > 0) parts.push(`fell-before in ${states.slice(0, 4).join(', ')}${states.length > 4 ? ` +${states.length - 4}` : ''}`);
  return `${num} (${gt}) is ${parts.join('; ')}.`;
}

// ─── Step 10: Top-level stats ─────────────────────────────────────────────────

export function buildScopeStats(
  grouped:       GroupedWindow[],
  dreamers:      any[],
  termSignals:   TermSignal[],
  numberSignals: NumberSignal[],
  boxedSignals:  BoxedSignal[],
  stateFocus:    StateEntry[],
  pinned:        RawPinnedPlay[],
  hits:          RawHit[]
): ScopeStats {
  const activeDreamerIds = new Set(grouped.map(g => g.dreamerId));
  const watchItems       = grouped.reduce((s, g) => s + g.cash3.length + g.cash4.length, 0);
  const statePlays       = stateFocus.reduce((s, e) => s + e.plays.length, 0);
  const activePins       = pinned.filter(p => p.status === 'suggested' || p.status === 'pinned').length;

  return {
    activeDreamers:       activeDreamerIds.size,
    activeWindows:        grouped.length,
    watchItems,
    repeatedTerms:        termSignals.filter(t => t.dreamerIds.length > 1 || t.windowCount > 1).length,
    repeatedNumbers:      numberSignals.filter(n => n.terms.length > 1 || n.dreamerIds.length > 1).length,
    hotBoxedFamilies:     boxedSignals.filter(b => b.terms.length > 1 || b.hasFellBefore).length,
    stateSupportedPlays:  statePlays,
    suggestedPinnedPlays: activePins,
    recentHits:           hits.length,
  };
}
