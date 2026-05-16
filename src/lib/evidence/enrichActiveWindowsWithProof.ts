/**
 * src/lib/evidence/enrichActiveWindowsWithProof.ts
 *
 * Joins personal_hit_mappings evidence onto active dream windows and groups.
 *
 * DESIGN:
 *   One broad Postgres query loads all personal_hit_mappings for the owner
 *   (filtered by dreamerId if scoped). Results are then aggregated across
 *   all states into per-(dreamer, normalizedTerm, numberText, gameType) totals,
 *   and joined in-memory to each window/group by the same key.
 *
 * This avoids N+1 queries (one per window) while keeping the join logic
 * in one place so window-groups, dreamer profile, and future routes can
 * all consume it identically.
 *
 * PROOF SOURCES:
 *   personal_hit_mappings holds evidence from both:
 *   - live-dream-refresh (live refresh writes personal_hit_events →
 *     upsertPersonalHitMappingsFromEvents rebuilds the aggregates)
 *   - backtest-replay (persistBacktestReplayEvidence writes backtest_hits +
 *     personal_hit_events → upsertPersonalHitMappingsFromEvents)
 *   The `sourceClasses` field on each ProofEntry lists which sources contributed.
 *
 * PROOF LABEL LOGIC (for UI):
 *   - sourceClasses includes 'backtest-replay' only   → "Backtest Proven"
 *   - sourceClasses includes 'live-dream-refresh' only → "Live Proven"
 *   - sourceClasses includes both                      → "Backtest + Live Proven"
 *   - no evidence                                       → no label / hasFellBefore=false
 */

import { prisma } from '@/lib/db/postgres';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Aggregated proof for one (dreamer, normalizedTerm, numberText, gameType) group. */
export interface ProofEntry {
  dreamerId:          string;
  normalizedTerm:     string;
  numberText:         string;    // string — leading zeros preserved
  gameType:           string;
  hitCount:           number;    // total across all states
  straightCount:      number;
  boxedCount:         number;
  stateStrengthScore: number;
  lastHitDate:        string;
  statesWithHits:     string[];
  sourceClasses:      string[];  // ['backtest-replay', 'live-dream-refresh'] etc.
  proofLabel:         string;    // "Backtest Proven" | "Live Proven" | "Backtest + Live Proven"
}

/** Result of enriching a window or group with proof. */
export interface ProofFields {
  hasFellBefore:      boolean;
  fellBeforeHitCount: number;
  straightCount:      number;
  boxedCount:         number;
  stateStrengthScore: number;
  lastHitDate:        string;
  statesWithHits:     string[];
  sourceClasses:      string[];
  proofLabel:         string;
  proofEventCount:    number;
}

const NO_PROOF: ProofFields = {
  hasFellBefore:      false,
  fellBeforeHitCount: 0,
  straightCount:      0,
  boxedCount:         0,
  stateStrengthScore: 0,
  lastHitDate:        '',
  statesWithHits:     [],
  sourceClasses:      [],
  proofLabel:         '',
  proofEventCount:    0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normTerm(t: string): string {
  return String(t ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function buildProofLabel(sourceClasses: string[]): string {
  const hasBacktest = sourceClasses.some(s => s.includes('backtest'));
  const hasLive     = sourceClasses.some(s => s.includes('live'));
  if (hasBacktest && hasLive) return 'Backtest + Live Proven';
  if (hasBacktest)            return 'Backtest Proven';
  if (hasLive)                return 'Live Proven';
  return 'Proven';
}

function classifySource(src: string): string {
  if (!src) return 'unknown';
  if (src.includes('backtest')) return 'backtest-replay';
  if (src.includes('live'))     return 'live-dream-refresh';
  if (src.includes('repair'))   return 'repair';
  return src;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Load all personal_hit_mappings for an owner (and optionally one dreamer),
 * aggregate across states, and return a Map keyed by
 * `dreamerId::normalizedTerm::numberText::gameType` for O(1) window lookups.
 */
export async function loadProofIndex(
  ownerUid:   string,
  dreamerId?: string,
  limit = 2000
): Promise<Map<string, ProofEntry>> {
  const rows = await prisma.personalHitMapping.findMany({
    where: {
      ownerUid,
      ...(dreamerId ? { dreamerId } : {}),
      isDeprecated:                 false,
      isShadowedByCorrectedMapping: false,
    },
    select: {
      dreamerId:          true,
      termLabel:          true,
      normalizedTerm:     true,
      numberText:         true,   // string — never Number() / parseInt()
      gameType:           true,
      state:              true,
      hitCount:           true,
      straightCount:      true,
      boxedCount:         true,
      stateStrengthScore: true,
      lastHitDate:        true,
      source:             true,
    },
    take: limit,
  });

  const index = new Map<string, ProofEntry>();

  for (const row of rows) {
    const did  = String(row.dreamerId      ?? '');
    const nt   = String(row.normalizedTerm ?? normTerm(row.termLabel ?? ''));
    const num  = String(row.numberText     ?? '');  // leading zeros preserved
    const gt   = String(row.gameType       ?? '');
    const state= String(row.state          ?? '');
    const src  = classifySource(String(row.source ?? ''));

    if (!did || !nt || !num || !gt) continue;

    const key = `${did}::${nt}::${num}::${gt}`;
    if (!index.has(key)) {
      index.set(key, {
        dreamerId: did, normalizedTerm: nt, numberText: num, gameType: gt,
        hitCount: 0, straightCount: 0, boxedCount: 0, stateStrengthScore: 0,
        lastHitDate: '', statesWithHits: [], sourceClasses: [], proofLabel: '',
      });
    }
    const entry = index.get(key)!;
    entry.hitCount           += Number(row.hitCount           ?? 0);
    entry.straightCount      += Number(row.straightCount      ?? 0);
    entry.boxedCount         += Number(row.boxedCount         ?? 0);
    entry.stateStrengthScore += Number(row.stateStrengthScore ?? 0);
    if (state && !entry.statesWithHits.includes(state)) entry.statesWithHits.push(state);
    if (src   && !entry.sourceClasses.includes(src))    entry.sourceClasses.push(src);
    const lhd = String(row.lastHitDate ?? '');
    if (lhd && lhd > entry.lastHitDate) entry.lastHitDate = lhd;
  }

  // Build proof labels once aggregation is complete
  for (const entry of index.values()) {
    entry.proofLabel = buildProofLabel(entry.sourceClasses);
  }

  return index;
}

/**
 * Look up proof for one active window row.
 *
 * Falls back to termLabel-based lookup when normalizedTerm is not stored.
 */
export function getWindowProof(
  proofIndex: Map<string, ProofEntry>,
  window: {
    dreamerId:      string;
    normalizedTerm?: string;
    termLabel?:     string;
    number?:        string;
    gameType?:      string;
  }
): ProofFields {
  const did  = String(window.dreamerId       ?? '');
  const nt   = String(window.normalizedTerm  ?? normTerm(window.termLabel ?? ''));
  const num  = String(window.number          ?? '');  // string — leading zeros safe
  const gt   = String(window.gameType        ?? '');

  if (!nt || !num || !gt) return { ...NO_PROOF };

  const entry = proofIndex.get(`${did}::${nt}::${num}::${gt}`);
  if (!entry) return { ...NO_PROOF };

  return {
    hasFellBefore:      entry.hitCount > 0,
    fellBeforeHitCount: entry.hitCount,
    straightCount:      entry.straightCount,
    boxedCount:         entry.boxedCount,
    stateStrengthScore: entry.stateStrengthScore,
    lastHitDate:        entry.lastHitDate,
    statesWithHits:     entry.statesWithHits,
    sourceClasses:      entry.sourceClasses,
    proofLabel:         entry.proofLabel,
    proofEventCount:    entry.hitCount,   // synonym for UI
  };
}

/**
 * Enrich an array of flat active-window rows with proof fields.
 * Mutates in place and also returns the array.
 */
export function enrichWindowsWithProof(
  windows: any[],
  proofIndex: Map<string, ProofEntry>
): any[] {
  for (const w of windows) {
    const proof = getWindowProof(proofIndex, {
      dreamerId:     String(w.dreamerId      ?? ''),
      normalizedTerm:String(w.normalizedTerm ?? ''),
      termLabel:     String(w.termLabel      ?? ''),
      number:        String(w.number         ?? ''),
      gameType:      String(w.gameType       ?? ''),
    });
    Object.assign(w, proof);
  }
  return windows;
}

/**
 * Enrich window GROUP objects with aggregated proof from all their windows.
 * A group is "proven" if ANY of its windows has proof.
 * Hit counts are summed across all windows in the group.
 */
export function enrichGroupsWithProof(
  groups: any[],
  proofIndex: Map<string, ProofEntry>
): any[] {
  for (const g of groups) {
    // Accumulate proof across all windows in this group
    let totalHits       = 0;
    let totalStraight   = 0;
    let totalBoxed      = 0;
    let totalScore      = 0;
    let lastDate        = '';
    const statesSet     = new Set<string>();
    const sourcesSet    = new Set<string>();
    let provenWindowCount = 0;

    // Use exact active-window rows only.
    // Do NOT create synthetic term × number combinations here; that can create
    // false positives by pairing a proven number with the wrong dream term.
    // The route supplies proofWindows as the full set of rows for this group.
    const allToCheck: any[] = Array.isArray(g.proofWindows)
      ? g.proofWindows
      : (Array.isArray(g.sampleWindows) ? g.sampleWindows : []);

    for (const w of allToCheck) {
      const proof = getWindowProof(proofIndex, {
        dreamerId:     String(w.dreamerId      ?? g.dreamerId ?? ''),
        normalizedTerm:String(w.normalizedTerm ?? normTerm(w.termLabel ?? '')),
        termLabel:     String(w.termLabel      ?? ''),
        number:        String(w.number         ?? ''),
        gameType:      String(w.gameType       ?? ''),
      });
      if (proof.hasFellBefore) {
        provenWindowCount++;
        totalHits     += proof.fellBeforeHitCount;
        totalStraight += proof.straightCount;
        totalBoxed    += proof.boxedCount;
        totalScore    += proof.stateStrengthScore;
        for (const s of proof.statesWithHits) statesSet.add(s);
        for (const s of proof.sourceClasses)  sourcesSet.add(s);
        if (proof.lastHitDate > lastDate) lastDate = proof.lastHitDate;
      }
    }

    const sourceClasses = Array.from(sourcesSet);
    g.hasFellBefore       = totalHits > 0;
    g.fellBeforeHitCount  = totalHits;
    g.straightCount       = totalStraight;
    g.boxedCount          = totalBoxed;
    g.stateStrengthScore  = totalScore;
    g.lastHitDate         = lastDate;
    g.statesWithHits      = Array.from(statesSet);
    g.sourceClasses       = sourceClasses;
    g.proofLabel          = buildProofLabel(sourceClasses);
    g.proofEventCount     = totalHits;
    g.provenWindowCount   = provenWindowCount;
  }
  return groups;
}
