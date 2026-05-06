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

// ─── resolveDreamerScope ──────────────────────────────────────────────────────

export type DreamerScope = {
  dreamerId:    string;
  dreamerName:  string;
  resolvedFrom: 'explicit' | 'backtestDream' | 'dreamEntry' | 'activeWindow' | 'owner-self';
};

/**
 * Canonical dreamer scope resolution for all write paths.
 *
 * Resolution order (first non-empty wins):
 *   1. Explicit dreamerId from the request/payload
 *   2. Looked up from source backtestDream doc
 *   3. Looked up from source dreamEntry doc
 *   4. Looked up from source activeWindow doc
 *   5. Fallback to owner-self only if no source had a different dreamer
 *
 * Pass the Firestore db and the relevant IDs; the function does the lookups
 * that are necessary. Pass null for IDs that are not available.
 *
 * IMPORTANT: Never call this with only owner-self available when a backtestDreamId
 * or sourceDreamEntryId is present — always resolve from the source first.
 */
export async function resolveDreamerScope(
  db: any,
  opts: {
    explicitDreamerId?:   string | null;
    explicitDreamerName?: string | null;
    backtestDreamId?:     string | null;
    dreamEntryId?:        string | null;
    sourceDreamEntryId?:  string | null;
    activeWindowId?:      string | null;
    ownerUid:             string;
  }
): Promise<DreamerScope> {
  const { explicitDreamerId, explicitDreamerName, backtestDreamId,
          dreamEntryId, sourceDreamEntryId, activeWindowId, ownerUid } = opts;

  // 1. Explicit dreamer passed in
  if (explicitDreamerId && explicitDreamerId.trim()) {
    return {
      dreamerId:   explicitDreamerId.trim(),
      dreamerName: (explicitDreamerName ?? '').trim(),
      resolvedFrom: 'explicit',
    };
  }

  // 2. Source backtestDream
  const btid = backtestDreamId?.trim();
  if (btid) {
    try {
      const doc = await db.collection('backtestDreams').doc(btid).get();
      if (doc.exists) {
        const d = doc.data();
        const did = String(d.dreamerId ?? '').trim();
        if (did) return { dreamerId: did, dreamerName: String(d.dreamerName ?? ''), resolvedFrom: 'backtestDream' };
      }
    } catch { /* non-fatal */ }
  }

  // 3. Source dreamEntry
  const deid = (dreamEntryId ?? sourceDreamEntryId ?? '')?.trim();
  if (deid && !deid.startsWith('backtest:')) {
    try {
      const doc = await db.collection('dreamEntries').doc(deid).get();
      if (doc.exists) {
        const d = doc.data();
        const did = String(d.dreamerId ?? '').trim();
        if (did) return { dreamerId: did, dreamerName: String(d.dreamerName ?? ''), resolvedFrom: 'dreamEntry' };
      }
    } catch { /* non-fatal */ }
  }

  // 4. Source activeWindow
  const wid = activeWindowId?.trim();
  if (wid) {
    try {
      const doc = await db.collection('activeDreamWindows').doc(wid).get();
      if (doc.exists) {
        const d = doc.data();
        const did = String(d.dreamerId ?? '').trim();
        if (did) return { dreamerId: did, dreamerName: String(d.dreamerName ?? ''), resolvedFrom: 'activeWindow' };
      }
    } catch { /* non-fatal */ }
  }

  // 5. Final fallback — owner-self
  return { dreamerId: 'owner-self', dreamerName: '', resolvedFrom: 'owner-self' };
}

/**
 * Canonical termNumberMappings document ID.
 * One row per ownerUid + dreamerId + normalizedTerm + number + gameType.
 * Prevents duplicate dictionary rows for the same term/number/gameType combination.
 */
export function canonicalDictDocId(
  ownerUid:      string,
  dreamerId:     string,
  normalizedTerm:string,
  number:        string,
  gameType:      string
): string {
  return [ownerUid, dreamerId, normalizedTerm, number, gameType].map(safeId).join('__');
}
