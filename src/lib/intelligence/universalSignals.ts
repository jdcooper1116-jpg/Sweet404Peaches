/**
 * src/lib/intelligence/universalSignals.ts
 *
 * Future-ready Universal Signal type and pure computation helpers.
 *
 * These signals are NOT yet stored in Firestore. They are computed on the fly
 * from capped API data by buildUniversalSignalsFromScopeData().
 *
 * When we add a `universalSignals` Firestore collection, these types and
 * functions map directly to that schema — no refactoring needed.
 */

import type { FocusTier } from './universalScope';
import { boxedKey as computeBoxedKey } from './universalScope';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalType =
  | 'term'
  | 'exactNumber'
  | 'boxedFamily'
  | 'state'
  | 'dreamer'
  | 'pinnedCandidate'
  | 'symbolFamily';

export type UniversalSignal = {
  signalId:         string;
  signalType:       SignalType;
  termLabels:       string[];
  numbers:          string[];
  gameType:         'cash3' | 'cash4' | '';
  boxedKey:         string;
  dreamerIds:       string[];
  dreamerNames:     string[];
  states:           string[];
  activeWindowIds:  string[];
  fellBeforeHitCount: number;
  recentHitCount:   number;
  replayHitCount:   number;
  pinnedStatus:     'pinned' | 'suggested' | 'none';
  sourceWorkflows:  string[];   // e.g. ['live-dream', 'backtest-replay']
  score:            number;
  confidenceTier:   FocusTier;
  reason:           string;
  createdAt?:       string;
  updatedAt?:       string;
};

// ─── Input types (from existing scope data) ──────────────────────────────────

type ScopeNumber = {
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

type RecentHit = { candidate?: string; state?: string; dreamerName?: string };

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Score a single signal based on its evidence depth.
 * Same weights as buildFocusRecs in universalScope.ts for consistency.
 */
export function scoreUniversalSignal(sig: Partial<UniversalSignal>): number {
  let score = 0;
  if ((sig.termLabels?.length ?? 0) >= 2)  score += 3;  // multi-term
  if ((sig.dreamerIds?.length ?? 0) >= 2)  score += 2;  // multi-dreamer
  if ((sig.fellBeforeHitCount ?? 0) > 0)   score += 2;  // fell-before evidence
  if (sig.pinnedStatus === 'pinned')        score += 2;  // pinned
  else if (sig.pinnedStatus === 'suggested') score += 2; // suggested
  if ((sig.recentHitCount ?? 0) > 0)       score += 1;  // recent hit
  if ((sig.activeWindowIds?.length ?? 0) >= 2) score += 1; // multi-window
  if ((sig.states?.length ?? 0) >= 2)      score += 1;  // multi-state evidence
  return score;
}

export function tierFromScore(score: number): FocusTier {
  if (score >= 8) return 'Strong Focus';
  if (score >= 5) return 'Moderate Focus';
  if (score >= 3) return 'Watchlist';
  return 'Needs More Evidence';
}

// ─── Explanation ──────────────────────────────────────────────────────────────

export function explainUniversalSignal(sig: UniversalSignal): string {
  const parts: string[] = [];
  const n = sig.numbers[0] ?? '';
  const gt = sig.gameType ? ` (${sig.gameType})` : '';

  if (sig.termLabels.length > 1)
    parts.push(`active through ${sig.termLabels.slice(0, 3).join(', ')}`);
  else if (sig.termLabels.length === 1)
    parts.push(`active through ${sig.termLabels[0]}`);

  if (sig.dreamerIds.length > 1)
    parts.push(`across ${sig.dreamerIds.length} dreamers`);

  if (sig.fellBeforeHitCount > 0)
    parts.push(`fell-before evidence in ${sig.states.slice(0, 3).join(', ')}`);

  if (sig.pinnedStatus === 'pinned') parts.push('already pinned');
  else if (sig.pinnedStatus === 'suggested') parts.push('suggested by system');

  if (parts.length === 0) return `${n}${gt} is tracked.`;
  return `${n}${gt} is ${parts.join('; ')}.`;
}

// ─── Build from scope data ────────────────────────────────────────────────────

/**
 * Build UniversalSignal array from already-computed scope data.
 * Reuses the number signals from buildNumberConvergence() — no new reads needed.
 */
export function buildUniversalSignalsFromScopeData(
  numberSignals: ScopeNumber[],
  hits:          RecentHit[],
  options?: { maxSignals?: number }
): UniversalSignal[] {
  const recentHitNums = new Set(hits.map(h => String(h.candidate ?? '')));
  const max = options?.maxSignals ?? 30;

  return numberSignals
    .slice(0, max * 2) // over-compute, then rank
    .map((ns, i): UniversalSignal => {
      const recent = recentHitNums.has(ns.number) ? 1 : 0;
      const partial: Partial<UniversalSignal> = {
        termLabels:        ns.terms,
        dreamerIds:        ns.dreamerIds,
        numbers:           [ns.number],
        activeWindowIds:   [],  // enriched separately if needed
        fellBeforeHitCount: ns.fellHitCount,
        recentHitCount:    recent,
        states:            ns.fellStates,
        pinnedStatus:      ns.isPinned ? 'pinned' : ns.isSuggested ? 'suggested' : 'none',
      };
      const score = scoreUniversalSignal(partial);
      const tier  = tierFromScore(score);
      const sig: UniversalSignal = {
        signalId:         `us-${ns.number}-${ns.gameType}-${i}`,
        signalType:       'exactNumber',
        termLabels:       ns.terms,
        numbers:          [ns.number],
        gameType:         ns.gameType,
        boxedKey:         computeBoxedKey(ns.number),
        dreamerIds:       ns.dreamerIds,
        dreamerNames:     ns.dreamerNames,
        states:           ns.fellStates,
        activeWindowIds:  [],
        fellBeforeHitCount: ns.fellHitCount,
        recentHitCount:   recent,
        replayHitCount:   0,
        pinnedStatus:     ns.isPinned ? 'pinned' : ns.isSuggested ? 'suggested' : 'none',
        sourceWorkflows:  ['live-dream'],
        score,
        confidenceTier:   tier,
        reason:           '',
      };
      sig.reason = explainUniversalSignal(sig);
      return sig;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

// ─── Group helpers ────────────────────────────────────────────────────────────

export function groupSignalsByDreamer(
  signals: UniversalSignal[]
): Map<string, UniversalSignal[]> {
  const map = new Map<string, UniversalSignal[]>();
  for (const sig of signals) {
    for (const id of sig.dreamerIds) {
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(sig);
    }
  }
  return map;
}

export function groupSignalsByState(
  signals: UniversalSignal[]
): Map<string, UniversalSignal[]> {
  const map = new Map<string, UniversalSignal[]>();
  for (const sig of signals) {
    for (const state of sig.states) {
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(sig);
    }
  }
  return map;
}

export function rankUniversalSignals(signals: UniversalSignal[]): UniversalSignal[] {
  return [...signals].sort((a, b) => b.score - a.score);
}
