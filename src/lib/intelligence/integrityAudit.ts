/**
 * src/lib/intelligence/integrityAudit.ts
 *
 * Pure helper for the Integrity Console page.
 * No Firestore, no fetch, no writes — inspects capped API arrays.
 */

export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

export type HealthItem = {
  label:   string;
  status:  HealthStatus;
  value:   string;
  detail?: string;
};

export type CompletenessIssue = {
  collection: string;
  field:      string;
  count:      number;
  sample:     string[];
};

export type PromotionGapResult = {
  dreamHitsTotal:     number;
  fellBeforeRows:     number;
  estimatedUnpromoted:number;
  repairRecommended:  boolean;
};

export type DictGapResult = {
  activeWindowCount:    number;
  activeWindowTerms:    string[];
  dictMissingDreamer:   number;
  dictTerms:            string[];
  missingTerms:         string[];
};

// ─── Pipeline Health ─────────────────────────────────────────────────────────

export function buildPipelineHealth(opts: {
  windows:      any[];
  hits:          any[];
  fell:          any[];
  dreamers:      any[];
  backtests:     any[];
  engineStatus:  any | null;
  quotaError:    boolean;
  indexError:    boolean;
}): HealthItem[] {
  const { windows, hits, fell, dreamers, backtests, engineStatus, quotaError, indexError } = opts;

  const items: HealthItem[] = [
    {
      label:  'Active Windows',
      status: windows.length > 0 ? 'healthy' : 'warning',
      value:  String(windows.length),
      detail: windows.length === 0 ? 'No active windows found. Write a dream to create one.' : undefined,
    },
    {
      label:  'Universal Dictionary Rows',
      status: 'unknown',  // Can't read termNumberMappings directly in this check
      value:  '(check dictionary page)',
      detail: 'Dictionary rows are verified via /dictionary route.',
    },
    {
      label:  'Dream Hits',
      status: hits.length > 0 ? 'healthy' : 'warning',
      value:  String(hits.length),
      detail: hits.length === 0 ? 'No detected hits yet. Run a refresh after adding dreams.' : undefined,
    },
    {
      label:  'As They Fell Before Rows',
      status: fell.length > 0 ? 'healthy' : 'warning',
      value:  String(fell.length),
      detail: fell.length === 0
        ? 'No fell-before rows. Run repair-hit-memory or promote-hits after refresh.'
        : undefined,
    },
    {
      label:  'Dreamers with IDs',
      status: dreamers.length > 0 ? 'healthy' : 'warning',
      value:  String(dreamers.length),
    },
    {
      label:  'Dreamer Names Present in Hits',
      status: (() => {
        if (hits.length === 0) return 'unknown';
        const missing = hits.filter(h => !h.dreamerName).length;
        if (missing === 0) return 'healthy';
        if (missing < hits.length * 0.5) return 'warning';
        return 'error';
      })(),
      value: (() => {
        const missing = hits.filter(h => !h.dreamerName).length;
        return `${hits.length - missing}/${hits.length} have dreamerName`;
      })(),
      detail: hits.filter(h => !h.dreamerName).length > 0
        ? 'Some hits lack dreamerName. Run repair-hit-memory to backfill.'
        : undefined,
    },
    {
      label:  'Replay / Backtesting Records',
      status: backtests.length > 0 ? 'healthy' : 'warning',
      value:  String(backtests.length),
      detail: backtests.length === 0 ? 'No backtest records. Use the Replay Lab to build historical evidence.' : undefined,
    },
    {
      label:  'Lottery Engine',
      status: engineStatus === null ? 'unknown'
            : engineStatus.is_current ? 'healthy' : 'warning',
      value:  engineStatus === null ? 'unreachable'
            : engineStatus.is_current ? 'current' : 'stale',
      detail: engineStatus === null ? 'Engine status could not be retrieved.' : undefined,
    },
    {
      label:  'Firebase Quota',
      status: quotaError ? 'error' : 'healthy',
      value:  quotaError ? 'exhausted' : 'ok',
      detail: quotaError ? 'Firebase quota limit reached. Reads are capped. Wait for reset.' : undefined,
    },
    {
      label:  'Firestore Indexes',
      status: indexError ? 'warning' : 'healthy',
      value:  indexError ? 'index required' : 'ok',
      detail: indexError
        ? 'A FAILED_PRECONDITION error means a composite index is needed. Create it in Firebase Console (activeDreamWindows: ownerUid ASC + activeEnd ASC).'
        : undefined,
    },
  ];

  return items;
}

// ─── Data Completeness Audit ──────────────────────────────────────────────────

export function buildCompletenessAudit(opts: {
  windows:   any[];
  hits:       any[];
  fell:       any[];
  pinned:     any[];
}): CompletenessIssue[] {
  const { windows, hits, fell, pinned } = opts;
  const issues: CompletenessIssue[] = [];

  // activeDreamWindows
  const winMissingDreamer = windows.filter(w => !w.dreamerId).map(w => w.id ?? '').slice(0, 3);
  if (winMissingDreamer.length > 0) {
    issues.push({ collection: 'activeDreamWindows', field: 'dreamerId', count: winMissingDreamer.length, sample: winMissingDreamer });
  }
  const winMissingName = windows.filter(w => w.dreamerId && !w.dreamerName).map(w => w.id ?? '').slice(0, 3);
  if (winMissingName.length > 0) {
    issues.push({ collection: 'activeDreamWindows', field: 'dreamerName', count: winMissingName.length, sample: winMissingName });
  }

  // dreamHits
  const hitsMissingNum  = hits.filter(h => !h.number && !h.candidate).length;
  if (hitsMissingNum > 0)
    issues.push({ collection: 'dreamHits', field: 'number/candidate', count: hitsMissingNum, sample: [] });
  const hitsMissingGt   = hits.filter(h => !h.gameType && !h.game_type).length;
  if (hitsMissingGt > 0)
    issues.push({ collection: 'dreamHits', field: 'gameType', count: hitsMissingGt, sample: [] });
  const hitsMissingDate = hits.filter(h => !h.drawDate && !h.draw_date).length;
  if (hitsMissingDate > 0)
    issues.push({ collection: 'dreamHits', field: 'drawDate', count: hitsMissingDate, sample: [] });
  const hitsMissingType = hits.filter(h => !h.hitType && !h.match_type).length;
  if (hitsMissingType > 0)
    issues.push({ collection: 'dreamHits', field: 'hitType/match_type', count: hitsMissingType, sample: [] });
  const hitsMissingDn   = hits.filter(h => !h.dreamerName).length;
  if (hitsMissingDn > 0)
    issues.push({ collection: 'dreamHits', field: 'dreamerName', count: hitsMissingDn,
      sample: hits.filter(h => !h.dreamerName).slice(0, 2).map(h => h.id ?? '') });

  // personalHitMappings (fell)
  const fellMissingTerm  = fell.filter(r => !r.termLabel).length;
  if (fellMissingTerm > 0)
    issues.push({ collection: 'personalHitMappings', field: 'termLabel', count: fellMissingTerm, sample: [] });
  const fellMissingState = fell.filter(r => !r.state).length;
  if (fellMissingState > 0)
    issues.push({ collection: 'personalHitMappings', field: 'state', count: fellMissingState, sample: [] });
  const fellMissingDn    = fell.filter(r => !r.dreamerName).length;
  if (fellMissingDn > 0)
    issues.push({ collection: 'personalHitMappings', field: 'dreamerName', count: fellMissingDn, sample: [] });

  // pinned plays
  const pinnedMissingTerms = pinned.filter(p => !p.sourceTerm && !(p.sourceTerms?.length)).length;
  if (pinnedMissingTerms > 0)
    issues.push({ collection: 'pinnedPlays', field: 'sourceTerms', count: pinnedMissingTerms, sample: [] });

  return issues;
}

// ─── Promotion Gap Audit ──────────────────────────────────────────────────────

export function buildPromotionGapAudit(
  hits: any[],
  fell: any[]
): PromotionGapResult {
  const totalHits = hits.length;
  const fellRows  = fell.length;
  // Heuristic: if hits >> fell, promotion may have gaps
  const estimatedUnpromoted = Math.max(0, totalHits - fellRows);
  const repairRecommended   = estimatedUnpromoted > 0 && fellRows === 0;
  return { dreamHitsTotal: totalHits, fellBeforeRows: fellRows, estimatedUnpromoted, repairRecommended };
}

// ─── Dictionary Gap Audit ─────────────────────────────────────────────────────

export function buildDictGapAudit(
  windows:    any[],
  dictTerms:  any[]
): DictGapResult {
  const activeTerms = Array.from(new Set(
    windows.map(w => String(w.termLabel ?? '').toLowerCase()).filter(Boolean)
  ));
  const dictTermLabels = Array.from(new Set(
    dictTerms.map(t => String(t.termLabel ?? t.term ?? '').toLowerCase()).filter(Boolean)
  ));
  const missingTerms = activeTerms.filter(t => !dictTermLabels.includes(t));
  const missingDreamer = dictTerms.filter(t => !t.dreamerId).length;

  return {
    activeWindowCount:  windows.length,
    activeWindowTerms:  activeTerms,
    dictMissingDreamer: missingDreamer,
    dictTerms:          dictTermLabels,
    missingTerms,
  };
}

// ─── Dreamer Scope Audit ──────────────────────────────────────────────────────

export function buildDreamerScopeAudit(opts: {
  dreamers: any[];
  hits:      any[];
  fell:      any[];
}) {
  const { dreamers, hits, fell } = opts;
  const ownerSelfHits = hits.filter(h => (h.dreamerId ?? 'owner-self') === 'owner-self').length;
  const ownerSelfFell = fell.filter(r => (r.dreamerId ?? 'owner-self') === 'owner-self').length;
  const missingNameHits = hits.filter(h => !h.dreamerName).length;
  const missingNameFell = fell.filter(r => !r.dreamerName).length;

  return {
    dreamerCount:       dreamers.length,
    ownerSelfHits,
    ownerSelfFell,
    missingNameHits,
    missingNameFell,
    hasLegacyOwnerSelf: ownerSelfHits > 0 || ownerSelfFell > 0,
  };
}
