/**
 * src/lib/intelligence/hitClassification.ts
 *
 * SINGLE SOURCE OF TRUTH for hit counting and personalHitMappings doc IDs.
 *
 * Import this from every route that writes personalHitMappings or personalHitEvents.
 * Never duplicate these definitions elsewhere.
 *
 * Canonical personalHitMappings doc ID format:
 *   ownerUid__dreamerId__normalizedTerm__number__gameType__state
 *
 * The deprecated (wrong) format was:
 *   ownerUid__dreamerId__normalizedTerm__number__STATE__GAMETYPE  ← wrong order
 *   ownerUid__dreamerId__termLabel__number__state__gameType       ← termLabel instead of normalized
 *
 * Hit classification rules:
 *   straight: candidateNumber === winningNumber (exact match)
 *   boxed:    sorted-digits match, same length, NOT an exact match
 *   A single event is NEVER both straight and boxed.
 *   hitCount ALWAYS equals straightCount + boxedCount.
 */

// ─── Number normalization ─────────────────────────────────────────────────────

/**
 * Normalize a number to a string, preserving leading zeros.
 * NEVER uses Number() or parseInt() — those destroy leading zeros.
 */
export function normalizeDigits(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Return the boxed (sorted-digits) key for a number string.
 * '035' → '035' sorted → '035'
 * '530' → '035'
 * '386' → '368'
 *
 * Sorting preserves digit count — '035' and '350' both produce '035'.
 * This means different-length numbers will never match each other's boxed keys.
 */
export function boxedKey(value: unknown): string {
  return normalizeDigits(value).split('').sort().join('');
}

// ─── Hit classification ───────────────────────────────────────────────────────

export type HitClassification = {
  isHit:         boolean;
  hitType:       'straight' | 'boxed' | null;
  matchMode:     'straight' | 'boxed' | null;
  hitCount:      0 | 1;
  straightCount: 0 | 1;
  boxedCount:    0 | 1;
};

/**
 * Classify one hit event.
 *
 * Examples (enforced by unit-style comments):
 *   classifyHit('035','035') → straight   hitCount=1 straightCount=1 boxedCount=0
 *   classifyHit('035','530') → boxed      hitCount=1 straightCount=0 boxedCount=1
 *   classifyHit('035','350') → boxed      (same sorted key, different permutation)
 *   classifyHit('035','123') → no hit     hitCount=0 straightCount=0 boxedCount=0
 *   classifyHit('035','0350')→ no hit     (different length, not comparable)
 *
 * INVARIANT: hitCount === straightCount + boxedCount  (always 0 or 1)
 */
export function classifyHit(
  candidateNumber: unknown,
  winningNumber:   unknown
): HitClassification {
  const cand = normalizeDigits(candidateNumber);
  const win  = normalizeDigits(winningNumber);

  if (!cand || !win) {
    return { isHit: false, hitType: null, matchMode: null, hitCount: 0, straightCount: 0, boxedCount: 0 };
  }

  // Straight: exact match (takes priority — a straight hit is NEVER also counted as boxed)
  if (cand === win) {
    return { isHit: true, hitType: 'straight', matchMode: 'straight', hitCount: 1, straightCount: 1, boxedCount: 0 };
  }

  // Boxed: same length AND same sorted digits
  if (cand.length === win.length && boxedKey(cand) === boxedKey(win)) {
    return { isHit: true, hitType: 'boxed', matchMode: 'boxed', hitCount: 1, straightCount: 0, boxedCount: 1 };
  }

  return { isHit: false, hitType: null, matchMode: null, hitCount: 0, straightCount: 0, boxedCount: 0 };
}

// ─── Canonical doc ID ─────────────────────────────────────────────────────────

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Canonical personalHitMappings document ID.
 *
 * Field order: ownerUid, dreamerId, normalizedTerm, number, gameType, state
 *
 * This EXACT order must be used by every writer. Any other order produces a
 * duplicate doc for the same semantic memory row, inflating hit counts.
 *
 * The normalizedTerm is the hyphen-lowercased version of termLabel:
 *   'Woman Crying' → 'woman-crying'
 *   'people'      → 'people'
 *
 * Example output:
 *   FJSPGNIj8WZXpustwDHZk97UpIk1__owner-self__people__035__cash3__MS
 */
export function canonicalPmDocId(
  ownerUid:      string,
  dreamerId:     string,
  normalizedTerm:string,
  number:        string,
  gameType:      string,
  state:         string
): string {
  return [ownerUid, dreamerId, normalizedTerm, number, gameType, state].map(safeId).join('__');
}

/**
 * Normalize a term label to its canonical normalizedTerm for doc IDs.
 * 'Woman Crying' → 'woman-crying'
 * 'people'       → 'people'
 */
export function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

/**
 * Canonical personalHitEvents document ID.
 * One event per unique draw occurrence. Includes drawDate+drawTime+hitType to
 * prevent double-counting the same draw event if a repair runs twice.
 */
export function canonicalEventId(
  ownerUid:      string,
  dreamerId:     string,
  normalizedTerm:string,
  number:        string,
  gameType:      string,
  state:         string,
  drawDate:      string,
  drawTime:      string,
  hitType:       string,
  dreamSourceId: string  // backtestDreamId or dreamEntryId
): string {
  return [ownerUid, dreamerId, normalizedTerm, number, gameType, state, drawDate, drawTime, hitType, dreamSourceId]
    .map(safeId).join('__');
}

// ─── Semantic key for deduplication ──────────────────────────────────────────

/**
 * Semantic identity key for a personalHitMappings row.
 * Used by the display layer to group/dedup rows that may exist under
 * different Firestore doc IDs (canonical vs legacy format).
 *
 * Must NOT depend on Firestore doc ID order.
 */
export function semanticKey(
  ownerUid:      string,
  dreamerId:     string,
  normalizedTerm:string,
  number:        string,
  gameType:      string,
  state:         string
): string {
  return `${ownerUid}|${dreamerId}|${normalizedTerm}|${number}|${gameType}|${state}`;
}

/**
 * Derive the semantic key from a personalHitMappings row object.
 * Handles both normalized and legacy field names.
 */
export function rowSemanticKey(row: Record<string, any>): string {
  const nt = String(row.normalizedTerm ?? normalizeTerm(row.termLabel ?? '')).trim();
  return semanticKey(
    String(row.ownerUid  ?? ''),
    String(row.dreamerId ?? 'owner-self'),
    nt,
    String(row.number    ?? row.candidateNumber ?? ''),
    String(row.gameType  ?? row.game_type       ?? ''),
    String(row.state     ?? '')
  );
}

/**
 * Return the canonical doc ID for a row, even if it was stored under a legacy ID.
 */
export function canonicalPmDocIdFromRow(row: Record<string, any>): string {
  const nt = String(row.normalizedTerm ?? normalizeTerm(row.termLabel ?? '')).trim();
  return canonicalPmDocId(
    String(row.ownerUid  ?? ''),
    String(row.dreamerId ?? 'owner-self'),
    nt,
    String(row.number    ?? row.candidateNumber ?? ''),
    String(row.gameType  ?? ''),
    String(row.state     ?? '')
  );
}
