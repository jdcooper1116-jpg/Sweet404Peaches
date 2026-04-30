/**
 * src/lib/intelligence/buildDream.ts
 *
 * Pure helper for the Build a Dream page.
 * No Firestore, no fetch, no writes. Transforms and validates data only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DictRow = {
  id?:           string;
  termLabel?:    string;
  normalizedTerm?: string;
  number?:       string;
  gameType?:     string;
  dreamerId?:    string;
  dreamerName?:  string;
  hitCount?:     number;
  source?:       string;
};

export type GroupedTerm = {
  termLabel:     string;
  normalizedTerm:string;
  cash3Numbers:  string[];
  cash4Numbers:  string[];
  dreamerIds:    string[];
  dreamerNames:  string[];
  hasFellBefore: boolean;
  fellCount:     number;
};

export type SelectedTerm = {
  term:          string;
  normalizedTerm:string;
  cash3Numbers:  string[];
  cash4Numbers:  string[];
  source:        'dictionary' | 'custom';
};

export type NumberParseResult = {
  valid:   string[];
  invalid: string[];
};

export type SaveEntryPayload = {
  ownerUid:      string;
  dreamerId:     string;
  dreamerName:   string;
  dreamDate:     string;
  rawText:       string;
  cleanedText:   string;
  termMappings:  SaveTermMapping[];
  sourceType:    string;
  notes:         string;
  isReviewed:    boolean;
};

export type SaveTermMapping = {
  term:           string;
  normalizedTerm: string;
  relatedTerms:   string[];
  cash3Numbers:   string[];
  cash4Numbers:   string[];
  archivedNumbers:string[];
  lineContexts:   unknown[];
};

// ─── normalizeTermLabel ───────────────────────────────────────────────────────

export function normalizeTermLabel(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

// ─── groupDictionaryTerms ─────────────────────────────────────────────────────

/**
 * Group flat dictionary rows (one row per term+number) into one GroupedTerm per term.
 * Preserves leading zeros — numbers are stored as strings.
 */
export function groupDictionaryTerms(rows: DictRow[]): GroupedTerm[] {
  const map = new Map<string, GroupedTerm>();

  for (const row of rows) {
    const label = String(row.termLabel ?? '').trim();
    if (!label) continue;
    const key = normalizeTermLabel(label);
    if (!map.has(key)) {
      map.set(key, {
        termLabel:     label,
        normalizedTerm:key,
        cash3Numbers:  [],
        cash4Numbers:  [],
        dreamerIds:    [],
        dreamerNames:  [],
        hasFellBefore: false,
        fellCount:     0,
      });
    }
    const g   = map.get(key)!;
    const num = String(row.number ?? '').trim();
    const gt  = String(row.gameType ?? '');

    if (num) {
      if (gt === 'cash4') { if (!g.cash4Numbers.includes(num)) g.cash4Numbers.push(num); }
      else                { if (!g.cash3Numbers.includes(num)) g.cash3Numbers.push(num); }
    }
    const did  = String(row.dreamerId  ?? '');
    const dname = String(row.dreamerName ?? '');
    if (did && !g.dreamerIds.includes(did)) {
      g.dreamerIds.push(did);
      g.dreamerNames.push(dname);
    }
    // Mark as having fell-before evidence if route returned hitCount
    if (row.hitCount && Number(row.hitCount) > 0) {
      g.hasFellBefore = true;
      g.fellCount += Number(row.hitCount);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.termLabel.localeCompare(b.termLabel));
}

// ─── parseNumberList ──────────────────────────────────────────────────────────

/**
 * Parse a free-text number list (comma / space / newline separated).
 * Validates that each token is exactly `length` digits, preserving leading zeros.
 * Returns separate valid and invalid arrays.
 */
export function parseNumberList(input: string, length: 3 | 4): NumberParseResult {
  const tokens = input
    .split(/[\s,;\n]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const valid: string[]   = [];
  const invalid: string[] = [];

  for (const tok of tokens) {
    // Must be exactly `length` digits (allows leading zeros)
    if (/^\d+$/.test(tok) && tok.length === length) {
      if (!valid.includes(tok)) valid.push(tok);
    } else if (tok) {
      invalid.push(tok);
    }
  }
  return { valid, invalid };
}

// ─── mergeSelectedTerms ───────────────────────────────────────────────────────

/**
 * Merge an array of SelectedTerm into deduplicated cash3/cash4 number lists.
 */
export function mergeSelectedTerms(terms: SelectedTerm[]): {
  allCash3: string[];
  allCash4: string[];
} {
  const c3 = new Set<string>();
  const c4 = new Set<string>();
  for (const t of terms) {
    t.cash3Numbers.forEach(n => c3.add(n));
    t.cash4Numbers.forEach(n => c4.add(n));
  }
  return { allCash3: Array.from(c3), allCash4: Array.from(c4) };
}

// ─── buildSaveEntryPayload ────────────────────────────────────────────────────

/**
 * Build the full payload for POST /api/dreams/save-entry from selected terms.
 * rawText is auto-generated from term labels and notes.
 */
export function buildSaveEntryPayload(opts: {
  ownerUid:    string;
  dreamerId:   string;
  dreamerName: string;
  dreamDate:   string;
  selectedTerms: SelectedTerm[];
  notes:       string;
  title:       string;
}): SaveEntryPayload {
  const { ownerUid, dreamerId, dreamerName, dreamDate, selectedTerms, notes, title } = opts;

  // Generate a human-readable rawText so save-entry doesn't reject it
  const termLabels = selectedTerms.map(t => t.term).join(', ');
  const rawText = [
    title ? `[${title}]` : '[Built Dream]',
    termLabels ? `Terms: ${termLabels}.` : '',
    notes || '',
  ].filter(Boolean).join(' ').trim() || `Built dream with terms: ${termLabels || '(none)'}`;

  const termMappings: SaveTermMapping[] = selectedTerms.map(t => ({
    term:            t.term,
    normalizedTerm:  t.normalizedTerm,
    relatedTerms:    [],
    cash3Numbers:    t.cash3Numbers,
    cash4Numbers:    t.cash4Numbers,
    archivedNumbers: [],
    lineContexts:    [],
  }));

  return {
    ownerUid,
    dreamerId,
    dreamerName,
    dreamDate,
    rawText,
    cleanedText:  rawText,
    termMappings,
    sourceType:   'build-a-dream',
    notes,
    isReviewed:   true,
  };
}

// ─── summarizeFellBeforeSupport ───────────────────────────────────────────────

export type FellSupportSummary = {
  term:       string;
  hitCount:   number;
  stateCount: number;
  topStates:  string[];
  straight:   number;
  boxed:      number;
};

/**
 * Summarize fell-before API rows for a list of terms.
 * Input is the raw rows array from /api/fell-before.
 */
export function summarizeFellBeforeSupport(
  rows: any[],
  selectedTerms: string[]
): FellSupportSummary[] {
  const map = new Map<string, FellSupportSummary>();
  const termSet = new Set(selectedTerms.map(t => t.toLowerCase()));

  for (const r of rows) {
    const term = String(r.termLabel ?? '').toLowerCase();
    if (!termSet.has(term)) continue;

    if (!map.has(term)) map.set(term, { term, hitCount: 0, stateCount: 0, topStates: [], straight: 0, boxed: 0 });
    const s = map.get(term)!;
    s.hitCount  += Number(r.hitCount      ?? 1);
    s.straight  += Number(r.straightCount ?? 0);
    s.boxed     += Number(r.boxedCount    ?? 0);
    const state = String(r.state ?? '');
    if (state && !s.topStates.includes(state)) s.topStates.push(state);
  }

  return Array.from(map.values())
    .map(s => ({ ...s, stateCount: s.topStates.length }))
    .sort((a, b) => b.hitCount - a.hitCount);
}
