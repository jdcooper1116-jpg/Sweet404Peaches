/**
 * src/lib/intelligence/fellBeforeAnalysis.ts
 *
 * Pure analysis helpers for As They Fell Before.
 * No Firestore, no fetch, no writes.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────


function evidenceStrengthFrom(totalHitCount: number, uniqueDreamCount = 0): EvidenceStrength {
  if (totalHitCount >= 3 || uniqueDreamCount >= 2) return 'Power Repeat';
  if (totalHitCount >= 2) return 'Strong Repeat';
  return 'Single Evidence';
}

export function boxedKey(num: string): string {
  return String(num ?? '').split('').sort().join('');
}

// ─── Power Repeats ────────────────────────────────────────────────────────────

export type EvidenceStrength = 'Power Repeat' | 'Strong Repeat' | 'Single Evidence';

export type PowerRepeat = {
  termLabel:        string;
  number:           string;
  gameType:         string;
  state:            string;
  totalHitCount:    number;
  straightCount:    number;
  boxedCount:       number;
  uniqueDreamCount: number;
  uniqueDrawDates:  string[];
  firstHitDate:     string;
  lastHitDate:      string;
  sourceClasses:    string[];
  evidenceStrength: EvidenceStrength;
  backtestDreamIds: string[];
};

export function buildPowerRepeats(rows: any[]): PowerRepeat[] {
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
        uniqueDreamCount: 0, uniqueDrawDates: [], firstHitDate: '',
        lastHitDate: '', sourceClasses: [], backtestDreamIds: [],
        evidenceStrength: 'Single Evidence' as EvidenceStrength,
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

  return Array.from(map.values())
    .map(e => ({
      ...e,
      evidenceStrength: evidenceStrengthFrom(e.totalHitCount, e.uniqueDreamCount),
    }))
    .sort((a, b) => {
      const tier: Record<EvidenceStrength, number> = { 'Power Repeat': 3, 'Strong Repeat': 2, 'Single Evidence': 1 };
      const dt = tier[b.evidenceStrength] - tier[a.evidenceStrength];
      return dt !== 0 ? dt : b.totalHitCount - a.totalHitCount;
    });
}

// ─── Boxed Family Repeats ─────────────────────────────────────────────────────

export type BoxedRepeat = {
  termLabel:     string;
  boxedKey:      string;
  gameType:      string;
  state:         string;
  numbers:       string[];
  totalHitCount: number;
  straightCount: number;
  boxedCount:    number;
  firstHitDate:  string;
  lastHitDate:   string;
  sourceClasses: string[];
};

export function buildBoxedRepeats(rows: any[]): BoxedRepeat[] {
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
  termLabel:     string;
  state:         string;
  totalHitCount: number;
  straightCount: number;
  boxedCount:    number;
  numbers:       string[];
  uniqueDrawDates: string[];
  firstHitDate:  string;
  lastHitDate:   string;
  strengthTier:  EvidenceStrength;
};

export function buildStateHotspots(rows: any[]): StateHotspot[] {
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
        firstHitDate: '', lastHitDate: '', strengthTier: 'Single Evidence',
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
  rows: any[],
  powerRepeats: PowerRepeat[],
  meta: { lookupMode?: string; filtersApplied?: string[] }
): FellSummary {
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
