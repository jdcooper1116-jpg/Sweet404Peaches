import type { ParsedDreamContract, EngineJobOptions, EngineJobRequest, GameType } from './types';
import { allPick3Candidates, allPick4Candidates, candidatesForTerms } from './parserAdapter';

export function buildEngineJob(contract: ParsedDreamContract, options: EngineJobOptions): EngineJobRequest | null {
  const candidates = options.terms === 'all'
    ? (options.game_type === 'pick3' ? allPick3Candidates(contract) : allPick4Candidates(contract))
    : candidatesForTerms(contract, options.terms, options.game_type);
  if (candidates.length === 0) return null;
  const base: EngineJobRequest = { label: contract.dream_label, game_type: options.game_type, anchor_date: contract.dream_date, lookahead_days: options.lookahead_days, candidates };
  if (options.scope === 'single') {
    if (!options.state) throw new Error('buildEngineJob: state is required for single-state scope.');
    return { ...base, state: options.state.toUpperCase() };
  }
  return { ...base, scope: 'all-states' };
}

export interface MultiJobSpec { scope: EngineJobOptions['scope']; state?: string; lookahead_days: number; game_types: GameType | 'both'; terms: EngineJobOptions['terms']; }
export interface BuiltJobSet { pick3: EngineJobRequest | null; pick4: EngineJobRequest | null; }

export function buildEngineJobSet(contract: ParsedDreamContract, spec: MultiJobSpec): BuiltJobSet {
  const base: Omit<EngineJobOptions, 'game_type'> = { scope: spec.scope, state: spec.state, lookahead_days: spec.lookahead_days, terms: spec.terms };
  return {
    pick3: spec.game_types === 'pick3' || spec.game_types === 'both' ? buildEngineJob(contract, { ...base, game_type: 'pick3' }) : null,
    pick4: spec.game_types === 'pick4' || spec.game_types === 'both' ? buildEngineJob(contract, { ...base, game_type: 'pick4' }) : null,
  };
}
