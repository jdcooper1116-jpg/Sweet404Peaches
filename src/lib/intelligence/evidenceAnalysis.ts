/**
 * src/lib/intelligence/evidenceAnalysis.ts
 *
 * Pure helper for the Evidence Tracker and Performance pages.
 * No Firestore, no fetch, no side effects — transforms capped API arrays.
 */

import { boxedKey } from './universalScope';
import type { FocusTier } from './universalScope';

// ─── Input types ──────────────────────────────────────────────────────────────

export type FellRow = {
  id?:           string;
  termLabel?:    string;
  normalizedTerm?: string;
  number?:       string;
  gameType?:     string;
  state?:        string;
  hitCount?:     number;
  straightCount?:number;
  boxedCount?:   number;
  lastHitDate?:  string;
  drawDate?:     string;
  drawTime?:     string;
  dreamerName?:  string;
  dreamerId?:    string;
  source?:       string;
};

export type ActiveWindow = {
  id?:          string;
  termLabel?:   string;
  number?:      string;
  gameType?:    string;
  dreamerId?:   string;
  dreamerName?: string;
  activeEnd?:   string;
};

export type PinnedPlay = {
  id?:          string;
  number?:      string;
  gameType?:    string;
  state?:       string;
  status?:      string;
  sourceTerm?:  string;
  sourceTerms?: string[];
  dreamerName?: string;
  dreamerId?:   string;
};

export type HitRow = {
  id?:          string;
  candidate?:   string;
  number?:      string;
  winningNumber?:string;
  gameType?:    string;
  state?:       string;
  drawDate?:    string;
  drawTime?:    string;
  hitType?:     string;
  termLabel?:   string;
  dreamerName?: string;
  dreamerId?:   string;
  source?:      string;
  detectedAt?:  string;
};

// ─── Output types ─────────────────────────────────────────────────────────────

export type EvidenceSummary = {
  totalFellBeforeRows:  number;
  totalDetectedHits:    number;
  termsWithProof:       number;
  numbersWithProof:     number;
  statesWithProof:      number;
  dreamersWithProof:    number;
  straightCount:        number;
  boxedCount:           number;
  topTier:              FocusTier;
};

export type TermEvidence = {
  termLabel:      string;
  dreamerIds:     string[];
  dreamerNames:   string[];
  numbers:        string[];
  states:         string[];
  hitCount:       number;
  straightCount:  number;
  boxedCount:     number;
  strongestState: string;
  latestHitDate:  string;
  tier:           FocusTier;
};

export type NumberEvidence = {
  number:         string;
  gameType:       string;
  boxedKey:       string;
  terms:          string[];
  dreamerIds:     string[];
  dreamerNames:   string[];
  states:         string[];
  hitCount:       number;
  straightCount:  number;
  boxedCount:     number;
  latestHitDate:  string;
  isActiveNow:    boolean;
  isPinned:       boolean;
  isSuggested:    boolean;
  tier:           FocusTier;
};

export type StateEvidence = {
  state:          string;
  numbers:        string[];
  terms:          string[];
  dreamerIds:     string[];
  dreamerNames:   string[];
  hitCount:       number;
  straightCount:  number;
  boxedCount:     number;
  latestHitDate:  string;
};

export type SuggestionEvidence = {
  number:         string;
  gameType:       string;
  state:          string;
  status:         string;
  sourceTerms:    string[];
  dreamerName:    string;
  fellBeforeCount:number;
  fellBeforeStates:string[];
  isActiveNow:    boolean;
  tier:           FocusTier;
  reason:         string;
};

export type BoxedFamilyEvidence = {
  boxedKey:       string;
  gameType:       string;
  numbers:        string[];
  terms:          string[];
  dreamerIds:     string[];
  dreamerNames:   string[];
  states:         string[];
  hitCount:       number;
  isActiveNow:    boolean;
  isPinnedOrSuggested: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dedup<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function tierFromHits(hitCount: number): FocusTier {
  if (hitCount >= 10) return 'Strong Focus';
  if (hitCount >= 4)  return 'Moderate Focus';
  if (hitCount >= 2)  return 'Watchlist';
  return 'Needs More Evidence';
}

function latestDate(dates: string[]): string {
  return dates.filter(Boolean).sort().at(-1) ?? '';
}

// ─── Evidence Summary ─────────────────────────────────────────────────────────

export function buildEvidenceSummary(
  fell:  FellRow[],
  hits:  HitRow[]
): EvidenceSummary {
  const terms    = new Set(fell.map(r => r.termLabel ?? '').filter(Boolean));
  const numbers  = new Set(fell.map(r => r.number   ?? '').filter(Boolean));
  const states   = new Set(fell.map(r => r.state    ?? '').filter(Boolean));
  const dreamers = new Set(fell.map(r => r.dreamerId ?? '').filter(Boolean));
  const straight = fell.reduce((s, r) => s + Number(r.straightCount ?? 0), 0);
  const boxed    = fell.reduce((s, r) => s + Number(r.boxedCount    ?? 0), 0);
  const total    = fell.reduce((s, r) => s + Number(r.hitCount      ?? 1), 0);

  return {
    totalFellBeforeRows:  fell.length,
    totalDetectedHits:    hits.length,
    termsWithProof:       terms.size,
    numbersWithProof:     numbers.size,
    statesWithProof:      states.size,
    dreamersWithProof:    dreamers.size,
    straightCount:        straight,
    boxedCount:           boxed,
    topTier:              tierFromHits(total / Math.max(terms.size, 1)),
  };
}

// ─── Term Evidence Board ──────────────────────────────────────────────────────

export function buildTermEvidence(fell: FellRow[]): TermEvidence[] {
  const map = new Map<string, TermEvidence>();

  for (const r of fell) {
    const term = String(r.termLabel ?? '').trim().toLowerCase();
    if (!term) continue;
    if (!map.has(term)) {
      map.set(term, { termLabel: term, dreamerIds: [], dreamerNames: [], numbers: [],
        states: [], hitCount: 0, straightCount: 0, boxedCount: 0,
        strongestState: '', latestHitDate: '', tier: 'Needs More Evidence' });
    }
    const e = map.get(term)!;
    const num   = String(r.number ?? '');
    const state = String(r.state  ?? '');
    const did   = String(r.dreamerId ?? '');
    const dname = String(r.dreamerName ?? '');
    if (num   && !e.numbers.includes(num))       e.numbers.push(num);
    if (state && !e.states.includes(state))      e.states.push(state);
    if (did   && !e.dreamerIds.includes(did))  { e.dreamerIds.push(did); e.dreamerNames.push(dname); }
    e.hitCount      += Number(r.hitCount      ?? 1);
    e.straightCount += Number(r.straightCount ?? 0);
    e.boxedCount    += Number(r.boxedCount    ?? 0);
    const hDate = String(r.lastHitDate ?? r.drawDate ?? '');
    if (hDate > e.latestHitDate) e.latestHitDate = hDate;
  }

  return Array.from(map.values())
    .map(e => {
      // Find strongest state by hitCount
      const stateHits = new Map<string, number>();
      fell.filter(r => (r.termLabel ?? '').toLowerCase() === e.termLabel)
          .forEach(r => { const s = r.state ?? ''; stateHits.set(s, (stateHits.get(s) ?? 0) + Number(r.hitCount ?? 1)); });
      const strongestState = [...stateHits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return { ...e, strongestState, tier: tierFromHits(e.hitCount) };
    })
    .sort((a, b) => b.hitCount - a.hitCount);
}

// ─── Number Evidence Board ────────────────────────────────────────────────────

export function buildNumberEvidence(
  fell:    FellRow[],
  windows: ActiveWindow[],
  pinned:  PinnedPlay[]
): NumberEvidence[] {
  const map = new Map<string, NumberEvidence>();

  const activeNums = new Set(windows.map(w => `${w.number ?? ''}::${w.gameType ?? ''}`));
  const pinnedSet  = new Set(pinned.filter(p => p.status === 'pinned').map(p => `${p.number ?? ''}::${p.gameType ?? ''}`));
  const suggestSet = new Set(pinned.filter(p => p.status === 'suggested').map(p => `${p.number ?? ''}::${p.gameType ?? ''}`));

  for (const r of fell) {
    const num  = String(r.number   ?? '').trim();
    const gt   = String(r.gameType ?? '').trim();
    const key  = `${num}::${gt}`;
    if (!num) continue;
    if (!map.has(key)) {
      map.set(key, { number: num, gameType: gt, boxedKey: boxedKey(num), terms: [],
        dreamerIds: [], dreamerNames: [], states: [], hitCount: 0, straightCount: 0,
        boxedCount: 0, latestHitDate: '', isActiveNow: activeNums.has(key),
        isPinned: pinnedSet.has(key), isSuggested: suggestSet.has(key),
        tier: 'Needs More Evidence' });
    }
    const e = map.get(key)!;
    const term  = String(r.termLabel ?? '').trim().toLowerCase();
    const state = String(r.state     ?? '');
    const did   = String(r.dreamerId ?? '');
    const dname = String(r.dreamerName ?? '');
    if (term  && !e.terms.includes(term))        e.terms.push(term);
    if (state && !e.states.includes(state))      e.states.push(state);
    if (did   && !e.dreamerIds.includes(did))  { e.dreamerIds.push(did); e.dreamerNames.push(dname); }
    e.hitCount      += Number(r.hitCount      ?? 1);
    e.straightCount += Number(r.straightCount ?? 0);
    e.boxedCount    += Number(r.boxedCount    ?? 0);
    const hDate = String(r.lastHitDate ?? r.drawDate ?? '');
    if (hDate > e.latestHitDate) e.latestHitDate = hDate;
  }

  return Array.from(map.values())
    .map(e => ({ ...e, tier: tierFromHits(e.hitCount) }))
    .sort((a, b) => b.hitCount - a.hitCount);
}

// ─── State Evidence Board ─────────────────────────────────────────────────────

export function buildStateEvidence(fell: FellRow[]): StateEvidence[] {
  const map = new Map<string, StateEvidence>();

  for (const r of fell) {
    const state = String(r.state ?? '').trim();
    if (!state) continue;
    if (!map.has(state)) {
      map.set(state, { state, numbers: [], terms: [], dreamerIds: [],
        dreamerNames: [], hitCount: 0, straightCount: 0, boxedCount: 0, latestHitDate: '' });
    }
    const e = map.get(state)!;
    const num  = String(r.number    ?? '');
    const term = String(r.termLabel ?? '').toLowerCase();
    const did  = String(r.dreamerId ?? '');
    const dn   = String(r.dreamerName ?? '');
    if (num  && !e.numbers.includes(num))       e.numbers.push(num);
    if (term && !e.terms.includes(term))        e.terms.push(term);
    if (did  && !e.dreamerIds.includes(did)) { e.dreamerIds.push(did); e.dreamerNames.push(dn); }
    e.hitCount      += Number(r.hitCount      ?? 1);
    e.straightCount += Number(r.straightCount ?? 0);
    e.boxedCount    += Number(r.boxedCount    ?? 0);
    const hd = String(r.lastHitDate ?? r.drawDate ?? '');
    if (hd > e.latestHitDate) e.latestHitDate = hd;
  }

  return Array.from(map.values()).sort((a, b) => b.hitCount - a.hitCount);
}

// ─── Suggestion Evidence ──────────────────────────────────────────────────────

export function buildSuggestionEvidence(
  pinned:  PinnedPlay[],
  fell:    FellRow[],
  windows: ActiveWindow[]
): SuggestionEvidence[] {
  const activeNums = new Set(windows.map(w => `${w.number ?? ''}::${w.gameType ?? ''}`));

  return pinned
    .filter(p => p.status === 'pinned' || p.status === 'suggested')
    .map(p => {
      const num  = String(p.number   ?? '');
      const gt   = String(p.gameType ?? '');
      const key  = `${num}::${gt}`;
      const terms = dedup([p.sourceTerm ?? '', ...(p.sourceTerms ?? [])].filter(Boolean));

      const fellMatches = fell.filter(r =>
        String(r.number ?? '') === num &&
        String(r.gameType ?? '') === gt
      );
      const fellCount  = fellMatches.reduce((s, r) => s + Number(r.hitCount ?? 1), 0);
      const fellStates = dedup(fellMatches.map(r => r.state ?? '').filter(Boolean));

      const score = (fellCount > 0 ? 3 : 0)
                  + (activeNums.has(key) ? 2 : 0)
                  + (terms.length > 1 ? 1 : 0);
      const tier = score >= 5 ? 'Strong Focus' : score >= 3 ? 'Moderate Focus' : score >= 1 ? 'Watchlist' : 'Needs More Evidence';

      const reasons: string[] = [];
      if (fellCount > 0)       reasons.push(`fell-before in ${fellStates.slice(0, 3).join(', ')}`);
      if (activeNums.has(key)) reasons.push('currently active');
      if (terms.length > 0)    reasons.push(`via ${terms.slice(0, 2).join(', ')}`);

      return {
        number: num, gameType: gt, state: p.state ?? '',
        status: p.status ?? 'suggested',
        sourceTerms: terms,
        dreamerName: p.dreamerName ?? '',
        fellBeforeCount: fellCount,
        fellBeforeStates: fellStates,
        isActiveNow: activeNums.has(key),
        tier, reason: reasons.join('; ') || 'No current evidence.',
      } as SuggestionEvidence;
    })
    .sort((a, b) => b.fellBeforeCount - a.fellBeforeCount);
}

// ─── Boxed Family Evidence ────────────────────────────────────────────────────

export function buildBoxedFamilyEvidence(
  fell:    FellRow[],
  windows: ActiveWindow[],
  pinned:  PinnedPlay[]
): BoxedFamilyEvidence[] {
  const map = new Map<string, BoxedFamilyEvidence>();

  const activeNums    = new Set(windows.map(w => w.number ?? ''));
  const pinnedNums    = new Set(pinned.filter(p => p.status === 'pinned' || p.status === 'suggested').map(p => p.number ?? ''));

  for (const r of fell) {
    const num  = String(r.number   ?? '');
    const gt   = String(r.gameType ?? '');
    if (!num) continue;
    const bk  = boxedKey(num);
    const key = `${bk}::${gt}`;
    if (!map.has(key)) {
      map.set(key, { boxedKey: bk, gameType: gt, numbers: [], terms: [],
        dreamerIds: [], dreamerNames: [], states: [], hitCount: 0,
        isActiveNow: false, isPinnedOrSuggested: false });
    }
    const e = map.get(key)!;
    const term  = String(r.termLabel  ?? '').toLowerCase();
    const state = String(r.state      ?? '');
    const did   = String(r.dreamerId  ?? '');
    const dn    = String(r.dreamerName ?? '');
    if (num  && !e.numbers.includes(num))        e.numbers.push(num);
    if (term && !e.terms.includes(term))         e.terms.push(term);
    if (state && !e.states.includes(state))      e.states.push(state);
    if (did   && !e.dreamerIds.includes(did)) { e.dreamerIds.push(did); e.dreamerNames.push(dn); }
    e.hitCount += Number(r.hitCount ?? 1);
    if (activeNums.has(num)) e.isActiveNow = true;
    if (pinnedNums.has(num)) e.isPinnedOrSuggested = true;
  }

  return Array.from(map.values())
    .filter(e => e.hitCount > 0)
    .sort((a, b) => b.hitCount - a.hitCount);
}
