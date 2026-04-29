/**
 * src/lib/intelligence/replayLearning.ts
 *
 * Pure helper for computing learning summaries from backtesting/replay evidence.
 * No Firestore reads. No network calls.
 *
 * Input: arrays of backtestDreams (from /api/backtest/list-dreams)
 *        and personalHitMappings rows (from /api/fell-before).
 *
 * Output: structured reliability summaries that strengthen Universal Scope,
 * Forecast Board, Intelligence Hub, Chat, and Dreamer Profiles.
 */

import type { FocusTier } from './universalScope';

// ─── Input types ──────────────────────────────────────────────────────────────

export type BacktestDream = {
  id?:            string;
  backtestDreamId?: string;
  dreamerId?:     string;
  dreamerName?:   string;
  dreamDate?:     string;
  totalHits?:     number;
  straightHits?:  number;
  boxedHits?:     number;
  bestState?:     string;
  bestTerm?:      string;
  uniqueStates?:  string[];
  status?:        string;
  replaySource?:  string;
};

export type FellRow = {
  termLabel?:   string;
  number?:      string;
  gameType?:    string;
  state?:       string;
  hitCount?:    number;
  straightCount?: number;
  boxedCount?:  number;
  dreamerId?:   string;
  dreamerName?: string;
  backtestDreamId?: string;
  replaySource?:   string;
};

// ─── Output types ─────────────────────────────────────────────────────────────

export type TermReliability = {
  termLabel:        string;
  hitCount:         number;
  straightCount:    number;
  boxedCount:       number;
  states:           string[];
  dreamers:         string[];
  replayCount:      number;
  confidenceTier:   FocusTier;
  reason:           string;
};

export type NumberReliability = {
  number:           string;
  gameType:         string;
  termLabels:       string[];
  hitCount:         number;
  straightCount:    number;
  boxedCount:       number;
  states:           string[];
  dreamers:         string[];
  confidenceTier:   FocusTier;
};

export type StateReliability = {
  state:            string;
  hitCount:         number;
  straightCount:    number;
  topTerms:         string[];
  topNumbers:       string[];
  dreamers:         string[];
  confidenceTier:   FocusTier;
};

export type DreamerReliability = {
  dreamerId:        string;
  dreamerName:      string;
  replayCount:      number;
  totalHits:        number;
  straightHits:     number;
  boxedHits:        number;
  hitRate:          number;   // hits / replay, 0-1
  topTerm:          string;
  topState:         string;
  confidenceTier:   FocusTier;
};

export type ReplayLearningSummary = {
  termReliability:    TermReliability[];
  numberReliability:  NumberReliability[];
  stateReliability:   StateReliability[];
  dreamerReliability: DreamerReliability[];
  topTerm:            string;
  topState:           string;
  topDreamer:         string;
  totalReplays:       number;
  totalHits:          number;
};

// ─── Tier from hit count ──────────────────────────────────────────────────────

function tierFromHits(hitCount: number, replayCount: number): FocusTier {
  const rate = replayCount > 0 ? hitCount / replayCount : hitCount;
  if (hitCount >= 10 || rate >= 3) return 'Strong Focus';
  if (hitCount >= 5  || rate >= 1) return 'Moderate Focus';
  if (hitCount >= 2)               return 'Watchlist';
  return 'Needs More Evidence';
}

function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Build a full ReplayLearningSummary from available data.
 *
 * @param backtests  — list of backtestDreams records (from list-dreams route)
 * @param fellRows   — personalHitMappings rows (from fell-before route)
 *
 * Notes:
 * - Only fell-before rows with `replaySource = 'lottery-engine'` or
 *   `backtestDreamId` set are treated as replay evidence.
 * - All other rows are live-dream evidence.
 * - If the fell-before route doesn't return replaySource, all rows are used.
 */
export function buildReplayLearningSummary(
  backtests: BacktestDream[],
  fellRows:  FellRow[]
): ReplayLearningSummary {
  // Separate replay evidence from live evidence
  const replayRows = fellRows.filter(r =>
    r.replaySource === 'lottery-engine' || Boolean(r.backtestDreamId)
  );
  const useRows = replayRows.length > 0 ? replayRows : fellRows;

  // ── Term reliability ────────────────────────────────────────────────────────
  const termMap = new Map<string, TermReliability>();
  for (const row of useRows) {
    const term = String(row.termLabel ?? '').trim().toLowerCase();
    if (!term) continue;
    if (!termMap.has(term)) {
      termMap.set(term, {
        termLabel: term, hitCount: 0, straightCount: 0, boxedCount: 0,
        states: [], dreamers: [], replayCount: 0,
        confidenceTier: 'Needs More Evidence', reason: '',
      });
    }
    const e = termMap.get(term)!;
    e.hitCount      += Number(row.hitCount     ?? 1);
    e.straightCount += Number(row.straightCount ?? 0);
    e.boxedCount    += Number(row.boxedCount    ?? 0);
    if (row.state      && !e.states.includes(row.state))       e.states.push(row.state);
    if (row.dreamerId  && !e.dreamers.includes(row.dreamerId)) e.dreamers.push(row.dreamerId);
  }
  // Add replayCount from backtests
  for (const bt of backtests) {
    const term = String(bt.bestTerm ?? '').toLowerCase();
    if (term && termMap.has(term)) {
      termMap.get(term)!.replayCount++;
    }
  }
  const termReliability = Array.from(termMap.values())
    .map(e => ({
      ...e,
      confidenceTier: tierFromHits(e.hitCount, e.replayCount),
      reason: `${e.hitCount} hit${e.hitCount !== 1 ? 's' : ''} across ${e.states.length} state${e.states.length !== 1 ? 's' : ''}` +
              (e.straightCount > 0 ? `, ${e.straightCount} straight` : '') +
              (e.boxedCount > 0    ? `, ${e.boxedCount} boxed`      : ''),
    }))
    .sort((a, b) => b.hitCount - a.hitCount);

  // ── Number reliability ──────────────────────────────────────────────────────
  const numMap = new Map<string, NumberReliability>();
  for (const row of useRows) {
    const num = String(row.number ?? '').trim();
    const gt  = String(row.gameType ?? '');
    const key = `${num}::${gt}`;
    if (!num) continue;
    if (!numMap.has(key)) {
      numMap.set(key, {
        number: num, gameType: gt, termLabels: [], hitCount: 0,
        straightCount: 0, boxedCount: 0, states: [], dreamers: [],
        confidenceTier: 'Needs More Evidence',
      });
    }
    const e = numMap.get(key)!;
    e.hitCount      += Number(row.hitCount     ?? 1);
    e.straightCount += Number(row.straightCount ?? 0);
    e.boxedCount    += Number(row.boxedCount    ?? 0);
    if (row.state     && !e.states.includes(row.state))         e.states.push(row.state);
    if (row.termLabel && !e.termLabels.includes(row.termLabel)) e.termLabels.push(row.termLabel);
    if (row.dreamerId && !e.dreamers.includes(row.dreamerId))   e.dreamers.push(row.dreamerId);
  }
  const numberReliability = Array.from(numMap.values())
    .map(e => ({ ...e, confidenceTier: tierFromHits(e.hitCount, 0) }))
    .sort((a, b) => b.hitCount - a.hitCount);

  // ── State reliability ───────────────────────────────────────────────────────
  const stateMap = new Map<string, StateReliability>();
  for (const row of useRows) {
    const state = String(row.state ?? '').trim();
    if (!state) continue;
    if (!stateMap.has(state)) {
      stateMap.set(state, {
        state, hitCount: 0, straightCount: 0,
        topTerms: [], topNumbers: [], dreamers: [],
        confidenceTier: 'Needs More Evidence',
      });
    }
    const e = stateMap.get(state)!;
    e.hitCount      += Number(row.hitCount     ?? 1);
    e.straightCount += Number(row.straightCount ?? 0);
    if (row.termLabel && !e.topTerms.includes(row.termLabel))   e.topTerms.push(row.termLabel);
    if (row.number    && !e.topNumbers.includes(row.number))    e.topNumbers.push(row.number);
    if (row.dreamerId && !e.dreamers.includes(row.dreamerId))   e.dreamers.push(row.dreamerId);
  }
  const stateReliability = Array.from(stateMap.values())
    .map(e => ({ ...e, confidenceTier: tierFromHits(e.hitCount, 0) }))
    .sort((a, b) => b.hitCount - a.hitCount);

  // ── Dreamer reliability ─────────────────────────────────────────────────────
  const dreamerMap = new Map<string, DreamerReliability>();
  for (const bt of backtests) {
    const id   = String(bt.dreamerId   ?? 'owner-self');
    const name = String(bt.dreamerName ?? '');
    if (!dreamerMap.has(id)) {
      dreamerMap.set(id, {
        dreamerId: id, dreamerName: name, replayCount: 0,
        totalHits: 0, straightHits: 0, boxedHits: 0,
        hitRate: 0, topTerm: '', topState: '',
        confidenceTier: 'Needs More Evidence',
      });
    }
    const e = dreamerMap.get(id)!;
    e.replayCount++;
    e.totalHits    += Number(bt.totalHits    ?? 0);
    e.straightHits += Number(bt.straightHits ?? 0);
    e.boxedHits    += Number(bt.boxedHits    ?? 0);
    if (bt.bestTerm  && !e.topTerm)  e.topTerm  = bt.bestTerm;
    if (bt.bestState && !e.topState) e.topState = bt.bestState;
  }
  const dreamerReliability = Array.from(dreamerMap.values())
    .map(e => ({
      ...e,
      hitRate:         e.replayCount > 0 ? e.totalHits / e.replayCount : 0,
      confidenceTier:  tierFromHits(e.totalHits, e.replayCount),
    }))
    .sort((a, b) => b.totalHits - a.totalHits);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalHits   = backtests.reduce((s, b) => s + Number(b.totalHits ?? 0), 0);
  const topTerm     = termReliability[0]?.termLabel  ?? '';
  const topState    = stateReliability[0]?.state     ?? '';
  const topDreamer  = dreamerReliability[0]?.dreamerName ?? dreamerReliability[0]?.dreamerId ?? '';

  return {
    termReliability,
    numberReliability,
    stateReliability,
    dreamerReliability,
    topTerm,
    topState,
    topDreamer,
    totalReplays: backtests.length,
    totalHits,
  };
}

/**
 * Build a learning summary for a single dreamer only.
 */
export function buildDreamerLearningSummary(
  dreamerId: string,
  backtests: BacktestDream[],
  fellRows:  FellRow[]
): ReplayLearningSummary {
  const filteredBacktests = backtests.filter(b => (b.dreamerId ?? 'owner-self') === dreamerId);
  const filteredRows      = fellRows.filter(r => (r.dreamerId  ?? 'owner-self') === dreamerId);
  return buildReplayLearningSummary(filteredBacktests, filteredRows);
}
