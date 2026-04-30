/**
 * POST /api/backtest/save-engine-replay-hits
 *
 * Saves confirmed engine-replay hits to:
 *   1. backtestHits         — one doc per hit (deterministic ID, safe to re-run)
 *   2. personalHitEvents    — idempotency registry (seen-set per backtestDreamId)
 *   3. personalHitMappings  — As They Fell Before running totals (incremented only
 *                             for hits NOT already in personalHitEvents)
 *   4. backtestSummaries    — per-dream summary stats
 *   5. backtestDreams + backtestWindows — status update
 *
 * Dreamer scope (Batch 9A):
 *   dreamerId / dreamerName resolved in this order:
 *     1. From request body (intake page and replay page pass these)
 *     2. Looked up from backtestDreams doc (for callers that don't pass them)
 *     3. Final fallback: dreamerId = 'owner-self', dreamerName = ''
 *
 *   'owner-self' is only used when the actual selected dreamer IS owner-self
 *   or when lookup fails. It is never hardcoded for all replay evidence.
 *
 * Idempotency (v2.1 pattern):
 *   personalHitEvents uses makeHitEventId() as a deterministic seen-key.
 *   Re-running the same backtestDreamId does NOT inflate hitCount/straightCount/
 *   boxedCount/stateStrengthScore in personalHitMappings.
 *
 * Leading-zero preservation:
 *   All numbers stored as strings. Never coerced to int.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Deterministic event ID for one hit within a specific replay run.
 * Used as:
 *   1. backtestHits doc ID (merge:true = idempotent re-run)
 *   2. personalHitEvents doc ID (seen-registry for FieldValue.increment guard)
 */
function makeHitEventId(backtestDreamId: string, hit: EngineReplayHit): string {
  return [
    backtestDreamId,
    hit.termLabel,
    hit.number,
    hit.state,
    hit.gameType,
    hit.drawDate,
    hit.drawTime,
    hit.hitType,
    hit.normalizedResult,
  ].map(safeId).join('__');
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EngineReplayHit = {
  termLabel:        string;
  number:           string;
  gameType:         'cash3' | 'cash4';
  state:            string;
  drawDate:         string;
  drawTime:         string;
  rawResult?:       string;
  normalizedResult: string;
  resultBoxedKey:   string;
  hitType:          'straight' | 'boxed';
  daysFromDream:    number;
  sameDay:          boolean;
  is_verified?:     boolean;
  source_name?:     string;
  canonical_key?:   string;
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid        = String(body.ownerUid        || '');
    const backtestDreamId = String(body.backtestDreamId || '');
    const dreamDate       = String(body.dreamDate       || '');
    const hits: EngineReplayHit[] = Array.isArray(body.hits) ? body.hits : [];

    // Dreamer scope — callers may pass directly; otherwise look up from Firestore.
    let dreamerId   = String(body.dreamerId   || '');
    let dreamerName = String(body.dreamerName || '');

    if (!ownerUid)        return NextResponse.json({ ok: false, error: 'ownerUid is required.'        }, { status: 400 });
    if (!backtestDreamId) return NextResponse.json({ ok: false, error: 'backtestDreamId is required.' }, { status: 400 });
    if (!dreamDate)       return NextResponse.json({ ok: false, error: 'dreamDate is required.'       }, { status: 400 });

    const db  = getAdminDb();
    const now = Timestamp.now();
    const BATCH = 400;

    // ── 0. Resolve dreamerId/dreamerName ─────────────────────────────────────
    // If caller did not supply dreamerId, look it up from the backtestDreams doc.
    // This handles callers (like Replay Lab) that only pass backtestDreamId.
    if (!dreamerId) {
      try {
        const dreamDoc = await db.collection('backtestDreams').doc(backtestDreamId).get();
        if (dreamDoc.exists) {
          const dd = dreamDoc.data() ?? {};
          if (dd.dreamerId)   dreamerId   = String(dd.dreamerId);
          if (dd.dreamerName) dreamerName = String(dd.dreamerName);
        }
      } catch {
        // Non-fatal — fall back below
      }
      // Final fallback: owner-self (not a hardcode — only reached when lookup fails
      // or the selected dreamer IS owner-self)
      if (!dreamerId) dreamerId = 'owner-self';
    }

    // ── 1. Write backtestHits ─────────────────────────────────────────────────
    // Deterministic doc IDs + merge:true → safe to re-run with no double-writes.
    for (let i = 0; i < hits.length; i += BATCH) {
      const batch = db.batch();
      for (const hit of hits.slice(i, i + BATCH)) {
        const hitId = makeHitEventId(backtestDreamId, hit);
        batch.set(
          db.collection('backtestHits').doc(hitId),
          {
            ownerUid,
            backtestDreamId,
            dreamerId,
            dreamerName,
            dreamDate,
            termLabel:        hit.termLabel,
            number:           hit.number,
            gameType:         hit.gameType,
            state:            hit.state,
            drawDate:         hit.drawDate,
            drawTime:         hit.drawTime,
            rawResult:        hit.rawResult || hit.normalizedResult,
            normalizedResult: hit.normalizedResult,
            resultBoxedKey:   hit.resultBoxedKey,
            hitType:          hit.hitType,
            daysFromDream:    hit.daysFromDream,
            sameDay:          hit.sameDay,
            is_verified:      hit.is_verified   ?? false,
            source_name:      hit.source_name   ?? '',
            canonical_key:    hit.canonical_key ?? '',
            replaySource:     'lottery-engine',
            createdAt:        now,
            updatedAt:        now,
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    // ── 2. Idempotent personalHitMappings (As They Fell Before) ──────────────
    //
    // STRATEGY:
    //   a. Pre-fetch all personalHitEvents already recorded for this backtestDreamId.
    //   b. Filter hits down to only those NOT already in personalHitEvents.
    //   c. Write personalHitEvents docs for the new hits (marks them as seen).
    //   d. Increment personalHitMappings ONLY for new hits.
    //
    // Re-running the same replay is completely safe — hitCount/straightCount/
    // boxedCount/stateStrengthScore are never inflated.

    if (hits.length > 0) {
      // a. Pre-fetch existing events (one Firestore read, returns only IDs)
      const existingSnap = await db
        .collection('personalHitEvents')
        .where('ownerUid',        '==', ownerUid)
        .where('backtestDreamId', '==', backtestDreamId)
        .get();

      const existingIds = new Set<string>(existingSnap.docs.map(d => d.id));

      // b. New hits only
      const newHits = hits.filter(hit => !existingIds.has(makeHitEventId(backtestDreamId, hit)));

      if (newHits.length < hits.length) {
        console.log(
          `[save-engine-replay-hits] ${hits.length - newHits.length} hit(s) already counted ` +
          `for backtestDreamId=${backtestDreamId} — skipping to prevent double-counting.`
        );
      }

      if (newHits.length > 0) {
        // c. Write personalHitEvents for new hits (seen-registry)
        for (let i = 0; i < newHits.length; i += BATCH) {
          const batch = db.batch();
          for (const hit of newHits.slice(i, i + BATCH)) {
            const eventId = makeHitEventId(backtestDreamId, hit);
            batch.set(
              db.collection('personalHitEvents').doc(eventId),
              {
                ownerUid,
                backtestDreamId,
                dreamerId,
                dreamerName,
                dreamDate,
                termLabel:       hit.termLabel,
                number:          hit.number,
                gameType:        hit.gameType,
                state:           hit.state,
                drawDate:        hit.drawDate,
                drawTime:        hit.drawTime,
                hitType:         hit.hitType,
                normalizedResult: hit.normalizedResult,
                replaySource:    'lottery-engine',
                createdAt:       now,
              }
              // No merge — doc should not exist (we pre-filtered existingIds above)
            );
          }
          await batch.commit();
        }

        // d. Increment personalHitMappings for new hits only
        //
        // Doc ID: ownerUid__dreamerId__termLabel__number__state__gameType
        // Groups all historical hits for the same (term, number, state, game, dreamer)
        // into one doc with running totals — what /api/fell-before reads.
        //
        // dreamerId is included in the doc ID so two dreamers can independently
        // build their own hit memory for the same term/number.
        for (let i = 0; i < newHits.length; i += BATCH) {
          const batch = db.batch();
          for (const hit of newHits.slice(i, i + BATCH)) {
            const mappingId = [
              ownerUid,
              dreamerId,
              hit.termLabel,
              hit.number,
              hit.state,
              hit.gameType,
            ].map(safeId).join('__');

            const straightDelta = hit.hitType === 'straight' ? 1 : 0;
            const boxedDelta    = hit.hitType === 'boxed'    ? 1 : 0;
            const strengthDelta = hit.hitType === 'straight' ? 3 : 1;

            batch.set(
              db.collection('personalHitMappings').doc(mappingId),
              {
                ownerUid,
                dreamerId,
                dreamerName,
                termLabel:          hit.termLabel,
                number:             hit.number,
                gameType:           hit.gameType,
                state:              hit.state,
                drawTime:           hit.drawTime,
                drawDate:           hit.drawDate,
                hitType:            hit.hitType,
                sourceDreamEntryId: `backtest:${backtestDreamId}`,
                backtestDreamId,
                daysFromDream:      hit.daysFromDream,
                sameDay:            hit.sameDay,
                lastHitDate:        hit.drawDate,
                source:             'backtest-replay',    // for fell-before source filter
            replaySource:       'lottery-engine',
                // FieldValue.increment is safe — we only call this for new events
                hitCount:           FieldValue.increment(1),
                straightCount:      FieldValue.increment(straightDelta),
                boxedCount:         FieldValue.increment(boxedDelta),
                stateStrengthScore: FieldValue.increment(strengthDelta),
                updatedAt:          now,
                createdAt:          now,
              },
              { merge: true }
            );
          }
          await batch.commit();
        }
      }
    }

    // ── 3. Write backtestSummaries ────────────────────────────────────────────
    const straightHits = hits.filter(h => h.hitType === 'straight').length;
    const boxedHits    = hits.filter(h => h.hitType === 'boxed').length;

    const stateCounts = new Map<string, number>();
    const termCounts  = new Map<string, number>();
    for (const hit of hits) {
      if (hit.state) stateCounts.set(hit.state, (stateCounts.get(hit.state) ?? 0) + 1);
      termCounts.set(hit.termLabel, (termCounts.get(hit.termLabel) ?? 0) + 1);
    }

    const uniqueStates = Array.from(stateCounts.keys());
    const bestState    = [...stateCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const bestTerm     = [...termCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    // ── 4. Update parent docs + summary ──────────────────────────────────────
    await Promise.all([
      db.collection('backtestSummaries').doc(backtestDreamId).set(
        {
          ownerUid,
          backtestDreamId,
          dreamerId,
          dreamerName,
          dreamDate,
          totalHits:    hits.length,
          straightHits,
          boxedHits,
          uniqueStates,
          bestState,
          bestTerm,
          replaySource: 'lottery-engine',
          status:       'engine-replay-complete',
          updatedAt:    now,
          createdAt:    now,
        },
        { merge: true }
      ),
      db.collection('backtestDreams').doc(backtestDreamId).set(
        { ownerUid, status: 'engine-replay-complete', replaySource: 'lottery-engine', updatedAt: now },
        { merge: true }
      ),
      db.collection('backtestWindows').doc(backtestDreamId).set(
        { ownerUid, status: 'engine-replay-complete', updatedAt: now },
        { merge: true }
      ),
    ]);

    return NextResponse.json({
      ok:           true,
      totalHits:    hits.length,
      straightHits,
      boxedHits,
      uniqueStates,
      bestState,
      bestTerm,
      dreamerId,
    });
  } catch (err) {
    console.error('[save-engine-replay-hits] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save engine replay hits.' },
      { status: 500 }
    );
  }
}
