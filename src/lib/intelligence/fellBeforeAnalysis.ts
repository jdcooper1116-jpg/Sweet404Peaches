/**
 * src/lib/intelligence/fellBeforeAnalysis.ts
 * Note: imports rowSemanticKey from hitClassification to ensure dedup uses the
 * same semantic key as write paths — prevents display-layer count inflation.
 */
// import { rowSemanticKey } from './hitClassification';
// (Inline below to keep helper self-contained — copy must match hitClassification.ts)
/*
 * Pure analysis helpers for As They Fell Before.
 * No Firestore, no fetch, no writes.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function boxedKey(num: string): string {
  return String(num ?? '').split('').sort().join('');
}

// ─── Semantic dedup ──────────────────────────────────────────────────────────────
//
// personalHitMappings may contain duplicate docs for the same semantic memory row
// if different writers used different doc ID formats (e.g. field order swapped).
//
// dedupeAggregateRows groups by semantic key and:
//   - If two docs have matching counts → keep one, flag the other as duplicate.
//   - If counts differ       → keep the higher-count doc, flag integrity warning.
//   - Never sums duplicates blindly.

export type DedupedRow = Record<string, any> & {
  _isDuplicate:       boolean;
  _duplicateDocIds:   string[];
  _needsRepair:       boolean;
  _semanticKey:       string;
};

function rowSemKey(row: Record<string, any>): string {
  const nt = String(row.normalizedTerm ?? '').trim() ||
    String(row.termLabel ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  const did  = String(row.dreamerId  ?? 'owner-self');
  const uid  = String(row.ownerUid   ?? '');
  const num  = String(row.number     ?? row.candidateNumber ?? '');
  const gt   = String(row.gameType   ?? '');
  const state= String(row.state      ?? '');
  return `${uid}|${did}|${nt}|${num}|${gt}|${state}`;
}

export function dedupeAggregateRows(rows: any[]): DedupedRow[] {
  // Exclude rows marked deprecated by audit-hit-counts repair.
  // Deprecated docs represent legacy duplicate doc IDs — canonical doc holds the truth.
  const activeRows = rows.filter(r => !r._deprecated);
  const map = new Map<string, DedupedRow>();

  for (const r of activeRows) {
    const key = rowSemKey(r);
    if (!map.has(key)) {
      map.set(key, {
        ...r,
        _isDuplicate: false, _duplicateDocIds: [], _needsRepair: false, _semanticKey: key,
      });
    } else {
      const existing = map.get(key)!;
      const exHits   = Number(existing.hitCount      ?? 0);
      const newHits  = Number(r.hitCount             ?? 0);
      const exSt     = Number(existing.straightCount ?? 0);
      const newSt    = Number(r.straightCount        ?? 0);
      const exBx     = Number(existing.boxedCount    ?? 0);
      const newBx    = Number(r.boxedCount           ?? 0);

      // Mark as duplicate regardless
      existing._isDuplicate = true;
      if (r.id) existing._duplicateDocIds.push(String(r.id));

      if (exHits === newHits && exSt === newSt && exBx === newBx) {
        // Counts match — exact duplicate, keep existing, no repair needed
      } else {
        // Counts differ — keep the canonical-looking doc (gameType before state in ID)
        // or the higher count doc; flag for repair
        existing._needsRepair = true;
        if (newHits > exHits) {
          // New doc has more evidence — replace but preserve duplicate tracking
          const savedDupIds = [...existing._duplicateDocIds];
          if (existing.id) savedDupIds.push(String(existing.id));
          map.set(key, {
            ...r,
            _isDuplicate: true, _duplicateDocIds: savedDupIds, _needsRepair: true, _semanticKey: key,
          });
        }
        // else keep existing (higher or equal count)
      }
    }
  }

  return Array.from(map.values());
}

// ─── Power Repeats ────────────────────────────────────────────────────────────

// ─── FellBeforeRow — individual event record ─────────────────────────────────

export type FellBeforeRow = {
  id?:                string;
  termLabel:          string;
  normalizedTerm?:    string;
  number:             string;
  candidateNumber?:   string;
  winningNumber?:     string;
  state:              string;
  gameType:           string;
  drawDate:           string;
  drawTime?:          string;
  hitType:            string;
  matchMode?:         string;
  dreamerName?:       string;
  dreamerId?:         string;
  dreamDate?:         string;
  anchorDate?:        string;
  daysFromDream?:     number | null;
  sameDay?:           boolean;
  _sourceClass?:      string;
  source?:            string;
  backtestDreamId?:   string;
  sourceDreamEntryId?:string;
  activeWindowId?:    string;
  createdAt?:         string | null;
  detectedAt?:        string | null;
};

export type EvidenceStrength = 'Power Repeat' | 'Strong Repeat' | 'Single Evidence';

/**
 * Pure helper so callers don't repeat the ternary logic.
 * uniqueDreams >= 2 is treated the same as hitCount >= 3 for Power Repeat.
 */
export function evidenceStrengthFrom(hitCount: number, uniqueDreams = 0): EvidenceStrength {
  if (hitCount >= 3 || uniqueDreams >= 2) return 'Power Repeat';
  if (hitCount >= 2)                      return 'Strong Repeat';
  return 'Single Evidence';
}

export type PowerRepeat = {
  termLabel:        string;
  number:           string;
  gameType:         string;
  state:            string;
  totalHitCount:    number;
  straightCount:    number;
  boxedCount:       number;
  uniqueDreamCount: number;
  uniqueWindowCount:number;
  uniqueDrawDates:  string[];
  firstHitDate:     string;
  lastHitDate:      string;
  sourceClasses:    string[];
  evidenceStrength: EvidenceStrength;
  backtestDreamIds: string[];
  events:           FellBeforeRow[];  // individual event rows (populated by populateGroupEvents)
};

export function buildPowerRepeats(rows: any[] = [], rawRows: any[]): PowerRepeat[] {
  const map = new Map<string, PowerRepeat>();

  for (const r of rows) {
    const term  = String(r.termLabel ?? '').toLowerCase().trim();
    const num   = String(r.number    ?? r.candidateNumber ?? '').trim();
    const gt    = String(r.gameType  ?? '');
    const state = String(r.state     ?? '');
    if (!term || !num || !state) continue;

    const key = `${term}::${num}::${gt}::${state}`;
    if (!map.has(key)) {
      map.set(key, {
        termLabel: term, number: num, gameType: gt, state,
        totalHitCount: 0, straightCount: 0, boxedCount: 0,
        uniqueDreamCount: 0, uniqueWindowCount: 0,
        uniqueDrawDates: [], firstHitDate: '',
        lastHitDate: '', sourceClasses: [], backtestDreamIds: [],
        evidenceStrength: 'Single Evidence', events: [] as FellBeforeRow[],
      });
    }
    const e = map.get(key)!;
    e.totalHitCount  += Number(r.hitCount      ?? 1);
    e.straightCount  += Number(r.straightCount ?? 0);
    e.boxedCount     += Number(r.boxedCount    ?? 0);

    const dd = String(r.drawDate ?? r.lastHitDate ?? '');
    if (dd && !e.uniqueDrawDates.includes(dd)) e.uniqueDrawDates.push(dd);
    if (dd && (!e.firstHitDate || dd < e.firstHitDate)) e.firstHitDate = dd;
    if (dd && dd > e.lastHitDate) e.lastHitDate = dd;

    const sc = String(r._sourceClass ?? r.source ?? '');
    if (sc && !e.sourceClasses.includes(sc)) e.sourceClasses.push(sc);

    const btid = String(r.backtestDreamId ?? '');
    if (btid && !e.backtestDreamIds.includes(btid)) {
      e.backtestDreamIds.push(btid);
      e.uniqueDreamCount++;
    } else if (!btid) {
      e.uniqueDreamCount++;   // live dream
    }
  }

  // Compute uniqueWindowCount from raw rows per group
  const windowsByKey = new Map<string, Set<string>>();
  for (const r of rows) {
    const term  = String(r.termLabel ?? '').toLowerCase().trim();
    const num   = String(r.number ?? r.candidateNumber ?? '').trim();
    const gt    = String(r.gameType ?? '');
    const state = String(r.state   ?? '');
    const key   = `${term}::${num}::${gt}::${state}`;
    const wid   = String(r.activeWindowId ?? r.dreamWindowId ?? '');
    if (wid) {
      if (!windowsByKey.has(key)) windowsByKey.set(key, new Set());
      windowsByKey.get(key)!.add(wid);
    }
  }

  return Array.from(map.values())
    .map(e => {
      const key = `${e.termLabel}::${e.number}::${e.gameType}::${e.state}`;
      return {
        ...e,
        uniqueWindowCount: windowsByKey.get(key)?.size ?? 0,
        evidenceStrength: (e.totalHitCount >= 3 || e.uniqueDreamCount >= 2)
          ? 'Power Repeat' as EvidenceStrength
          : e.totalHitCount >= 2 ? 'Strong Repeat' as EvidenceStrength : 'Single Evidence' as EvidenceStrength,
      };
    })
    .sort((a, b) => {
      const tier: Record<EvidenceStrength, number> = { 'Power Repeat': 3, 'Strong Repeat': 2, 'Single Evidence': 1 };
      const dt = tier[b.evidenceStrength] - tier[a.evidenceStrength];
      return dt !== 0 ? dt : b.totalHitCount - a.totalHitCount;
    });
}

// ─── Boxed Family Repeats ─────────────────────────────────────────────────────

export type BoxedRepeat = {
  termLabel:        string;
  boxedKey:         string;
  gameType:         string;
  state:            string;
  numbers:          string[];
  totalHitCount:    number;
  straightCount:    number;
  boxedCount:       number;
  uniqueDreamCount: number;
  uniqueWindowCount:number;
  firstHitDate:     string;
  lastHitDate:      string;
  sourceClasses:    string[];
  events:           FellBeforeRow[];
};

export function buildBoxedRepeats(rows: any[] = [], rawRows: any[]): BoxedRepeat[] {
  const map = new Map<string, BoxedRepeat>();

  for (const r of rows) {
    const term  = String(r.termLabel ?? '').toLowerCase().trim();
    const num   = String(r.number    ?? '').trim();
    const gt    = String(r.gameType  ?? '');
    const state = String(r.state     ?? '');
    if (!term || !num || num.length < 3) continue;

    const bk  = boxedKey(num);
    const key = `${term}::${bk}::${gt}::${state}`;
    if (!map.has(key)) {
      map.set(key, {
        termLabel: term, boxedKey: bk, gameType: gt, state,
        numbers: [], totalHitCount: 0, straightCount: 0, boxedCount: 0,
        uniqueDreamCount: 0, uniqueWindowCount: 0, events: [],
        firstHitDate: '', lastHitDate: '', sourceClasses: [],
      });
    }
    const e = map.get(key)!;
    if (!e.numbers.includes(num)) e.numbers.push(num);
    e.totalHitCount  += Number(r.hitCount      ?? 1);
    e.straightCount  += Number(r.straightCount ?? 0);
    e.boxedCount     += Number(r.boxedCount    ?? 0);
    const dd = String(r.drawDate ?? r.lastHitDate ?? '');
    if (dd && (!e.firstHitDate || dd < e.firstHitDate)) e.firstHitDate = dd;
    if (dd && dd > e.lastHitDate) e.lastHitDate = dd;
    const sc = String(r._sourceClass ?? r.source ?? '');
    if (sc && !e.sourceClasses.includes(sc)) e.sourceClasses.push(sc);
  }

  return Array.from(map.values())
    .filter(e => e.numbers.length >= 1)       // show all, page filters for >1
    .sort((a, b) => b.totalHitCount - a.totalHitCount);
}

// ─── State Hotspots ───────────────────────────────────────────────────────────

export type StateHotspot = {
  termLabel:        string;
  state:            string;
  totalHitCount:    number;
  straightCount:    number;
  boxedCount:       number;
  numbers:          string[];
  uniqueDrawDates:  string[];
  uniqueDreamCount: number;
  uniqueWindowCount:number;
  firstHitDate:     string;
  lastHitDate:   string;
  strengthTier:  EvidenceStrength;
};

export function buildStateHotspots(rows: any[] = [], rawRows: any[]): StateHotspot[] {
  const map = new Map<string, StateHotspot>();

  for (const r of rows) {
    const term  = String(r.termLabel ?? '').toLowerCase().trim();
    const state = String(r.state     ?? '');
    const num   = String(r.number    ?? '').trim();
    if (!term || !state) continue;

    const key = `${term}::${state}`;
    if (!map.has(key)) {
      map.set(key, {
        termLabel: term, state, totalHitCount: 0, straightCount: 0,
        boxedCount: 0, numbers: [], uniqueDrawDates: [],
        uniqueDreamCount: 0, uniqueWindowCount: 0,
        firstHitDate: '', lastHitDate: '', strengthTier: 'Single Evidence' as EvidenceStrength,
      });
    }
    const e = map.get(key)!;
    e.totalHitCount  += Number(r.hitCount      ?? 1);
    e.straightCount  += Number(r.straightCount ?? 0);
    e.boxedCount     += Number(r.boxedCount    ?? 0);
    if (num && !e.numbers.includes(num)) e.numbers.push(num);
    const dd = String(r.drawDate ?? r.lastHitDate ?? '');
    if (dd && !e.uniqueDrawDates.includes(dd)) e.uniqueDrawDates.push(dd);
    if (dd && (!e.firstHitDate || dd < e.firstHitDate)) e.firstHitDate = dd;
    if (dd && dd > e.lastHitDate) e.lastHitDate = dd;
  }

  return Array.from(map.values())
    .map(e => ({
      ...e,
      strengthTier: evidenceStrengthFrom(e.totalHitCount, e.uniqueDrawDates.length >= 2 ? 2 : 0),
    }))
    .sort((a, b) => b.totalHitCount - a.totalHitCount);
}

// ─── Day-window distribution ──────────────────────────────────────────────────

export type DayWindow = { label: string; count: number };

export function buildDayWindows(rows: any[]): DayWindow[] {
  const buckets: Record<string, number> = {
    'Same Day': 0, 'Day 1': 0, 'Day 2–3': 0, 'Day 4–7': 0, 'Unknown': 0,
  };
  for (const r of rows) {
    const d = Number(r.daysFromDream ?? -1);
    if (d === 0) buckets['Same Day']++;
    else if (d === 1)          buckets['Day 1']++;
    else if (d >= 2 && d <= 3) buckets['Day 2–3']++;
    else if (d >= 4 && d <= 7) buckets['Day 4–7']++;
    else                       buckets['Unknown']++;
  }
  return Object.entries(buckets).map(([label, count]) => ({ label, count })).filter(b => b.count > 0);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export type FellSummary = {
  rowCount:        number;
  states:          string[];
  numbers:         string[];
  powerRepeats:    number;
  strongRepeats:   number;
  singleEvidence:  number;
  straightTotal:   number;
  boxedTotal:      number;
  lookupMode:      string;
  filtersApplied:  string[];
};

export function buildFellSummary(
  rawRows: any[],
  powerRepeats: PowerRepeat[],
  meta: { lookupMode?: string; filtersApplied?: string[] }
): FellSummary {
  const rows = dedupeAggregateRows(rawRows);
  const states  = [...new Set(rows.map(r => r.state  ?? '').filter(Boolean))];
  const numbers = [...new Set(rows.map(r => r.number ?? '').filter(Boolean))];
  return {
    rowCount:       rows.length,
    states, numbers,
    powerRepeats:   powerRepeats.filter(p => p.evidenceStrength === 'Power Repeat').length,
    strongRepeats:  powerRepeats.filter(p => p.evidenceStrength === 'Strong Repeat').length,
    singleEvidence: powerRepeats.filter(p => p.evidenceStrength === 'Single Evidence').length,
    straightTotal:  rows.reduce((s, r) => s + Number(r.straightCount ?? 0), 0),
    boxedTotal:     rows.reduce((s, r) => s + Number(r.boxedCount    ?? 0), 0),
    lookupMode:     meta.lookupMode     ?? '',
    filtersApplied: meta.filtersApplied ?? [],
  };
}

// ─── populateGroupEvents ──────────────────────────────────────────────────────

/**
 * Given a flat array of individual event rows (from /api/fell-before/events),
 * populate the events[] arrays on power repeats, boxed repeats, and state hotspots.
 *
 * This is called on the client after the on-demand events fetch completes.
 * Pure — no side effects, returns new arrays.
 */
export function populateGroupEvents(
  events:       FellBeforeRow[],
  powerRepeats: PowerRepeat[],
  boxedRepeats: BoxedRepeat[],
  stateHotspots: StateHotspot[],
): {
  powerRepeats:  PowerRepeat[];
  boxedRepeats:  BoxedRepeat[];
  stateHotspots: StateHotspot[];
} {
  const sorted = [...events].sort((a, b) => {
    const ak = `${a.drawDate ?? ''}|${a.drawTime ?? ''}`;
    const bk = `${b.drawDate ?? ''}|${b.drawTime ?? ''}`;
    return ak.localeCompare(bk);
  });

  return {
    powerRepeats: powerRepeats.map(p => ({
      ...p,
      events: sorted.filter(e =>
        e.number === p.number &&
        String(e.gameType ?? '') === p.gameType &&
        String(e.state    ?? '') === p.state
      ),
    })),
    boxedRepeats: boxedRepeats.map(b => ({
      ...b,
      events: sorted.filter(e =>
        b.numbers.includes(String(e.number ?? '')) &&
        String(e.state ?? '') === b.state
      ),
    })),
    stateHotspots: stateHotspots.map(s => ({
      ...s,
      events: sorted.filter(e => String(e.state ?? '') === s.state),
    })),
  };
}
