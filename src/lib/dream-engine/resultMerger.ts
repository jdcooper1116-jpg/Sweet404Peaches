import type { ParsedDreamContract, AnyEngineResponse, EngineHit, DreamHitRecord, DreamTermResult, DreamFamilyResult, DreamBacktestResult, GameType, BacktestScope } from './types';
import { isAllStatesEngineResponse } from './types';

interface RawHitWithState { hit: EngineHit; state: string; }

function flattenEngineResponse(response: AnyEngineResponse, fallbackState: string): { hits: RawHitWithState[]; coverage_gaps_by_state: Record<string, unknown[]>; failed_states: string[] } {
  if (isAllStatesEngineResponse(response)) {
    return {
      hits: response.combined_hits.map(h => ({ hit: h, state: h.state })),
      coverage_gaps_by_state: response.coverage_gaps_by_state ?? {},
      failed_states: response.failed_states ?? [],
    };
  }
  return {
    hits: (response.hits ?? []).map(h => ({ hit: h, state: fallbackState })),
    coverage_gaps_by_state: { [fallbackState]: response.coverage_gaps ?? [] },
    failed_states: [],
  };
}

function buildCandidateTermIndex(contract: ParsedDreamContract, gameType: GameType): Map<string, { raw_term: string; normalized_term: string; family: string }[]> {
  const index = new Map<string, { raw_term: string; normalized_term: string; family: string }[]>();
  for (const term of contract.terms) {
    const candidates = gameType === 'pick3' ? term.pick3 : term.pick4;
    for (const candidate of candidates) {
      if (!index.has(candidate)) index.set(candidate, []);
      index.get(candidate)!.push({ raw_term: term.raw_term, normalized_term: term.normalized_term, family: term.family });
    }
  }
  return index;
}

export interface MergeInput { contract: ParsedDreamContract; response: AnyEngineResponse; game_type: GameType; scope: BacktestScope; state?: string; lookahead_days: number; }

export function mergeEngineResponse(input: MergeInput): DreamBacktestResult {
  const { contract, response, game_type, scope, state, lookahead_days } = input;
  const fallbackState = state?.toUpperCase() ?? 'UNKNOWN';
  const { hits: rawHits, coverage_gaps_by_state, failed_states } = flattenEngineResponse(response, fallbackState);
  const candidateTermIndex = buildCandidateTermIndex(contract, game_type);
  const all_hits: DreamHitRecord[] = [];

  for (const { hit, state: hitState } of rawHits) {
    const termMatches = candidateTermIndex.get(hit.candidate) ?? [{ raw_term: 'unknown', normalized_term: 'unknown', family: 'general' }];
    for (const termMatch of termMatches) {
      all_hits.push({ candidate: hit.candidate, draw_date: hit.draw_date, draw_time: hit.draw_time, winning_number: hit.winning_number, match_type: hit.match_type, is_verified: hit.is_verified ?? false, source_name: hit.source_name ?? '', state: hitState, game_type, raw_term: termMatch.raw_term, normalized_term: termMatch.normalized_term, family: termMatch.family, anchor_date: contract.dream_date, lookahead_days, dream_label: contract.dream_label, dream_date: contract.dream_date });
    }
  }

  const by_term: DreamTermResult[] = contract.terms.map(term => {
    const termCandidates = game_type === 'pick3' ? term.pick3 : term.pick4;
    const termHits       = all_hits.filter(h => h.normalized_term === term.normalized_term);
    const statesWithHits = [...new Set(termHits.map(h => h.state))];
    const gaps           = statesWithHits.flatMap(s => coverage_gaps_by_state[s] ?? []);
    return { raw_term: term.raw_term, normalized_term: term.normalized_term, family: term.family, game_type, candidates: termCandidates, hit_count: termHits.length, hits: termHits, coverage_gaps: gaps, states_with_hits: statesWithHits, states_failed: failed_states };
  });

  const familyMap = new Map<string, DreamHitRecord[]>();
  for (const hit of all_hits) { if (!familyMap.has(hit.family)) familyMap.set(hit.family, []); familyMap.get(hit.family)!.push(hit); }
  const by_family: DreamFamilyResult[] = Array.from(familyMap.entries()).map(([family, hits]) => ({ family, game_type, hit_count: hits.length, hits, terms_with_hits: [...new Set(hits.map(h => h.normalized_term))], states_with_hits: [...new Set(hits.map(h => h.state))] }));

  const overlapping_candidates: string[] = [];
  for (const [candidate, terms] of candidateTermIndex.entries()) { if (terms.length > 1) overlapping_candidates.push(candidate); }

  return {
    dream_date: contract.dream_date, dream_label: contract.dream_label, raw_text: contract.raw_text, game_type, scope, anchor_date: contract.dream_date, lookahead_days,
    total_hit_count: all_hits.length, exact_hit_count: all_hits.filter(h => h.match_type==='exact').length, box_hit_count: all_hits.filter(h => h.match_type==='box').length, verified_hit_count: all_hits.filter(h => h.is_verified).length,
    states_with_hits: [...new Set(all_hits.map(h => h.state))], families_with_hits: [...new Set(all_hits.map(h => h.family))], terms_with_hits: [...new Set(all_hits.map(h => h.normalized_term))],
    all_hits, by_term, by_family, overlapping_candidates, coverage_gaps_by_state, failed_states, generated_at: new Date().toISOString(),
  };
}

export function mergeTwoResults(pick3Result: DreamBacktestResult, pick4Result: DreamBacktestResult): DreamBacktestResult {
  const all_hits = [...pick3Result.all_hits, ...pick4Result.all_hits];
  const termMap  = new Map<string, DreamTermResult>();
  for (const tr of [...pick3Result.by_term, ...pick4Result.by_term]) {
    const existing = termMap.get(tr.normalized_term);
    if (!existing) { termMap.set(tr.normalized_term, { ...tr }); }
    else { existing.hits = [...existing.hits, ...tr.hits]; existing.hit_count = existing.hits.length; existing.candidates = [...new Set([...existing.candidates, ...tr.candidates])]; existing.states_with_hits = [...new Set([...existing.states_with_hits, ...tr.states_with_hits])]; }
  }
  const familyMap = new Map<string, DreamFamilyResult>();
  for (const fr of [...pick3Result.by_family, ...pick4Result.by_family]) {
    const existing = familyMap.get(fr.family);
    if (!existing) { familyMap.set(fr.family, { ...fr }); }
    else { existing.hits = [...existing.hits, ...fr.hits]; existing.hit_count = existing.hits.length; existing.terms_with_hits = [...new Set([...existing.terms_with_hits, ...fr.terms_with_hits])]; existing.states_with_hits = [...new Set([...existing.states_with_hits, ...fr.states_with_hits])]; }
  }
  return {
    dream_date: pick3Result.dream_date, dream_label: pick3Result.dream_label, raw_text: pick3Result.raw_text, game_type: 'pick3', scope: pick3Result.scope, anchor_date: pick3Result.anchor_date, lookahead_days: pick3Result.lookahead_days,
    total_hit_count: all_hits.length, exact_hit_count: all_hits.filter(h => h.match_type==='exact').length, box_hit_count: all_hits.filter(h => h.match_type==='box').length, verified_hit_count: all_hits.filter(h => h.is_verified).length,
    states_with_hits: [...new Set(all_hits.map(h => h.state))], families_with_hits: [...new Set(all_hits.map(h => h.family))], terms_with_hits: [...new Set(all_hits.map(h => h.normalized_term))],
    all_hits, by_term: Array.from(termMap.values()), by_family: Array.from(familyMap.values()),
    overlapping_candidates: [...new Set([...pick3Result.overlapping_candidates, ...pick4Result.overlapping_candidates])],
    coverage_gaps_by_state: { ...pick3Result.coverage_gaps_by_state, ...pick4Result.coverage_gaps_by_state },
    failed_states: [...new Set([...pick3Result.failed_states, ...pick4Result.failed_states])],
    generated_at: new Date().toISOString(),
  };
}
