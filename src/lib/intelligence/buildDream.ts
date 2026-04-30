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

// ─── parseBulkTerms ───────────────────────────────────────────────────────────

export type BulkParseResult = {
  terms:    ParsedBulkTerm[];
  warnings: string[];
};

export type ParsedBulkTerm = {
  termLabel:     string;
  normalizedTerm:string;
  cash3Numbers:  string[];
  cash4Numbers:  string[];
};

/**
 * Parse a multi-line textarea input into grouped term→number mappings.
 *
 * Supported formats (all in one textarea):
 *   boat: 123, 020, 0560
 *   truck - 312 395 0247
 *   boat\n123 020 0560       (term on one line, numbers on next)
 *
 * Numbers are classified by digit count:
 *   exactly 3 digits → Cash 3
 *   exactly 4 digits → Cash 4
 *   other            → warning, skipped
 *
 * Leading zeros preserved — numbers stored as strings, never coerced.
 *
 * Merging: if the same normalized term appears multiple times in the input,
 * their numbers are merged (deduplicated).
 */
export function parseBulkTerms(input: string): BulkParseResult {
  const warnings: string[] = [];
  const map      = new Map<string, ParsedBulkTerm>();

  // Tokenise into lines, collapsing blank lines
  const lines = input.split('\n');

  let pendingTerm = '';   // term label from previous line (for "term\nnumbers" format)

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const line = raw.trim();
    if (!line) { pendingTerm = ''; continue; }

    // ── Detect "term : numbers" or "term - numbers" on one line ────────────
    // Colon or dash separator: term portion is before the first : or -
    const separatorMatch = line.match(/^([^:\-]+)[:|-](.+)$/);
    if (separatorMatch) {
      const termRaw = separatorMatch[1].trim();
      const numRaw  = separatorMatch[2].trim();
      if (termRaw && /[a-zA-Z]/.test(termRaw)) {
        // Valid term label
        pendingTerm = '';
        addTermNumbers(termRaw, numRaw, map, warnings);
        continue;
      }
    }

    // ── Detect line that is purely numbers (digits + separators, no alpha) ─
    const isPureNumbers = /^[\d,\s;/|.]+$/.test(line);
    if (isPureNumbers) {
      if (pendingTerm) {
        // Assign these numbers to the pending term from the previous line
        addTermNumbers(pendingTerm, line, map, warnings);
        pendingTerm = '';
      } else {
        warnings.push(`Numbers on line ${i + 1} could not be attributed to a term: "${line.slice(0, 40)}"`);
      }
      continue;
    }

    // ── Detect pure term label (no digits) ────────────────────────────────
    // Lines like "boat" or "woman crying" that have no numbers on them
    if (/[a-zA-Z]/.test(line) && !/\d/.test(line)) {
      pendingTerm = line;
      continue;
    }

    // ── Mixed line: term-like token followed by numbers ───────────────────
    // e.g. "boat 123 020 0560" or "crying 918 672 8415"
    const tokens = line.split(/[,\s;/|]+/).map(t => t.trim()).filter(Boolean);
    const numTokens  = tokens.filter(t => /^\d+$/.test(t));
    const wordTokens = tokens.filter(t => /[a-zA-Z]/.test(t));

    if (wordTokens.length > 0 && numTokens.length > 0) {
      const termLabel = wordTokens.join(' ');
      addTermNumbers(termLabel, numTokens.join(' '), map, warnings);
      pendingTerm = '';
      continue;
    }

    // ── Unrecognised line ─────────────────────────────────────────────────
    warnings.push(`Could not parse line ${i + 1}: "${line.slice(0, 50)}"`);
  }

  return { terms: Array.from(map.values()), warnings };
}

function addTermNumbers(
  termRaw:  string,
  numRaw:   string,
  map:      Map<string, ParsedBulkTerm>,
  warnings: string[]
): void {
  const termLabel     = termRaw.trim();
  const normalizedTerm = normalizeTermLabel(termLabel);
  if (!normalizedTerm) return;

  if (!map.has(normalizedTerm)) {
    map.set(normalizedTerm, { termLabel, normalizedTerm, cash3Numbers: [], cash4Numbers: [] });
  }
  const entry = map.get(normalizedTerm)!;

  // Tokenise numbers — allow comma, space, slash, semicolon, pipe
  const tokens = numRaw.split(/[,\s;/|]+/).map(t => t.trim()).filter(Boolean);

  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) {
      if (tok) warnings.push(`Skipped "${tok}" — not a valid number.`);
      continue;
    }
    if (tok.length === 3) {
      if (!entry.cash3Numbers.includes(tok)) entry.cash3Numbers.push(tok);
    } else if (tok.length === 4) {
      if (!entry.cash4Numbers.includes(tok)) entry.cash4Numbers.push(tok);
    } else {
      warnings.push(`Skipped "${tok}" — Cash 3 numbers must be exactly 3 digits, Cash 4 exactly 4 digits.`);
    }
  }

  // Warn if the term ended up with no valid numbers
  if (entry.cash3Numbers.length === 0 && entry.cash4Numbers.length === 0) {
    if (!warnings.some(w => w.includes(`No numbers`))) {
      warnings.push(`No valid numbers found for term "${termLabel}".`);
    }
  }
}
