export interface EngineIngestStatusEntry {
  state: string; game: string; status: 'success' | 'skipped' | 'failed' | string;
  records_inserted?: number; error?: string;
}
export interface EngineIngestStatus {
  last_run_at: string | null; success_count: number; failure_count: number;
  skipped_count: number; results: EngineIngestStatusEntry[]; is_current: boolean;
}
export interface EngineHit {
  candidate: string; draw_date: string; draw_time: string; winning_number: string;
  match_type: 'exact' | 'box' | string; is_verified: boolean; source_name: string;
  state?: string; [key: string]: unknown;
}
export interface EngineSingleStateResponse {
  hit_count: number; hit_dates: string[]; hit_draw_times: string[]; summary: string;
  hits: EngineHit[]; all_draws?: unknown[]; coverage_gaps?: unknown[];
}
export interface EngineAllStatesResponse {
  scope: 'all-states'; game_type: string; anchor_date: string; lookahead_days: number;
  candidates: string[]; label: string; overall_hit_count: number; states_attempted: number;
  states_succeeded: number; states_with_hits: string[]; failed_states: string[];
  combined_hits: Array<EngineHit & { state: string }>;
  results_by_state: Record<string, EngineSingleStateResponse>;
  coverage_gaps_by_state: Record<string, unknown[]>;
}
export type AnyEngineBacktestResponse = EngineSingleStateResponse | EngineAllStatesResponse;
export function isAllStatesResponse(r: AnyEngineBacktestResponse): r is EngineAllStatesResponse {
  return (r as EngineAllStatesResponse).scope === 'all-states';
}
export interface EngineBacktestRequest {
  game_type: string; anchor_date: string; lookahead_days: number;
  candidates: string[]; label?: string; state?: string; scope?: 'all-states';
}
