/**
 * POST /api/backtest/save-engine-replay-hits
 *
 * Persists engine replay results to Firestore using Firebase Admin SDK.
 * Returns detailed verification counts so the UI can confirm persistence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

export const maxDuration = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Deterministic event ID scoped to (backtestDreamId, hit).
 * Used for both backtestHits dedup AND personalHitEvents idempotency.
 */
function makeEventId(backtestDreamId: string, hit: EngineReplayHit): string {
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

    if (!ownerUid)        return NextResponse.json({ ok: false, error: 'ownerUid is required.'        }, { status: 400 });
    if (!backtestDreamId) return NextResponse.json({ ok: false, error: 'backtestDreamId is required.' }, { status: 400 });
    if (!dreamDate)       return NextResponse.json({ ok: false, error: 'dreamDate is required.'       }, { status: 400 });

    const db  = getAdminDb();
    const now = require('firebase-admin/firestore').Timestamp.now();
    const BATCH = 400;

    // ── 1. Write backtestHits ─────────────────────────────────────────────────
    // Deterministic doc IDs + merge:true = safe to re-run, never double-writes.
    let backtestHitsWritten = 0;
    for (let i = 0; i < hits.length; i += BATCH) {
      const batch = db.batch();
      for (const hit of hits.slice(i, i + BATCH)) {
        const hitId = makeEventId(backtestDreamId, hit);
        batch.set(
          db.collection('backtestHits').doc(hitId),
          {
            ownerUid,
            backtestDreamId,
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
        backtestHitsWritten++;
      }
      await batch.commit();
    }

    // ── 2. Idempotent personalHitMappings ("As They Fell Before") ─────────────
    //
    // IDEMPOTENCY:
    // Use personalHitEvents as a "seen" registry.
    // Query by single field `backtestDreamId` — no composite index required.
    // Single-field equality queries use auto-created indexes in Firestore.
    //
    // On first run: existingIds is empty → all hits are new → increments fire.
    // On re-run: existingIds = all hits → newHits is empty → nothing increments.

    let personalHitEventsCreated = 0;
    let personalHitMappingsUpdated = 0;
    let alreadyCounted = 0;

    if (hits.length > 0) {
      // Single-field query — no composite index needed.
      const existingSnap = await db
        .collection('personalHitEvents')
        .where('backtestDreamId', '==', backtestDreamId)
        .limit(5000)
        .get();

      const existingEventIds = new Set<string>(existingSnap.docs.map(d => d.id));

      const newHits = hits.filter(hit => !existingEventIds.has(makeEventId(backtestDreamId, hit)));
      alreadyCounted = hits.length - newHits.length;

      if (alreadyCounted > 0) {
        console.log(`[save-engine-replay-hits] ${alreadyCounted} already counted — skipping to prevent double-counting.`);
      }

      if (newHits.length > 0) {
        // Write personalHitEvents (marks hits as seen).
        for (let i = 0; i < newHits.length; i += BATCH) {
          const batch = db.batch();
          for (const hit of newHits.slice(i, i + BATCH)) {
            const eventId = makeEventId(backtestDreamId, hit);
            batch.set(
              db.collection('personalHitEvents').doc(eventId),
              {
                ownerUid,
                backtestDreamId,
                dreamDate,
                termLabel:        hit.termLabel,
                number:           hit.number,
                gameType:         hit.gameType,
                state:            hit.state,
                drawDate:         hit.drawDate,
                drawTime:         hit.drawTime,
                hitType:          hit.hitType,
                normalizedResult: hit.normalizedResult,
                replaySource:     'lottery-engine',
                createdAt:        now,
              }
            );
            personalHitEventsCreated++;
          }
          await batch.commit();
        }

        // Increment personalHitMappings for new hits only.
        // Doc ID groups hits by (ownerUid, termLabel, number, state, gameType).
        // All replays accumulate into the same document — safe because events are guarded above.
        for (let i = 0; i < newHits.length; i += BATCH) {
          const batch = db.batch();
          for (const hit of newHits.slice(i, i + BATCH)) {
            const mappingId = [ownerUid, hit.termLabel, hit.number, hit.state, hit.gameType]
              .map(safeId).join('__');

            const straightDelta = hit.hitType === 'straight' ? 1 : 0;
            const boxedDelta    = hit.hitType === 'boxed'    ? 1 : 0;
            const strengthDelta = hit.hitType === 'straight' ? 3 : 1;

            batch.set(
              db.collection('personalHitMappings').doc(mappingId),
              {
                ownerUid,
                dreamerId:          'owner-self',
                dreamerName:        'Sweet404Peaches',
                termLabel:          hit.termLabel,
                number:             hit.number,
                gameType:           hit.gameType,
                state:              hit.state,
                drawTime:           hit.drawTime,
                drawDate:           hit.drawDate,
                hitType:            hit.hitType,
                sourceDreamEntryId: `backtest:${backtestDreamId}`,
                daysFromDream:      hit.daysFromDream,
                sameDay:            hit.sameDay,
                lastHitDate:        hit.drawDate,
                replaySource:       'lottery-engine',
                backtestDreamId,
                // FieldValue.increment is safe: guarded by personalHitEvents check above.
                hitCount:           FieldValue.increment(1),
                straightCount:      FieldValue.increment(straightDelta),
                boxedCount:         FieldValue.increment(boxedDelta),
                stateStrengthScore: FieldValue.increment(strengthDelta),
                updatedAt:          now,
                createdAt:          now,
              },
              { merge: true }
            );
            personalHitMappingsUpdated++;
          }
          await batch.commit();
        }
      }
    }

    // ── 3. Build summary ───────────────────────────────────────────────────────
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

    const summary = {
      ownerUid,
      backtestDreamId,
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
    };

    // ── 4. Write summary + update dream + window status ────────────────────────
    let backtestSummaryWritten = false;
    let dreamStatusUpdated     = false;
    let windowStatusUpdated    = false;

    try {
      await db.collection('backtestSummaries').doc(backtestDreamId).set(summary, { merge: true });
      backtestSummaryWritten = true;
    } catch (e) {
      console.error('[save-engine-replay-hits] summary write failed:', e);
    }

    try {
      await db.collection('backtestDreams').doc(backtestDreamId).set(
        {
          ownerUid,
          status:       'engine-replay-complete',
          replaySource: 'lottery-engine',
          totalHits:    hits.length,
          straightHits,
          boxedHits,
          bestState,
          bestTerm,
          uniqueStates,
          updatedAt:    now,
        },
        { merge: true }
      );
      dreamStatusUpdated = true;
    } catch (e) {
      console.error('[save-engine-replay-hits] dream status update failed:', e);
    }

    try {
      await db.collection('backtestWindows').doc(backtestDreamId).set(
        {
          ownerUid,
          status:    'engine-replay-complete',
          replaySource: 'lottery-engine',
          totalHits: hits.length,
          updatedAt: now,
        },
        { merge: true }
      );
      windowStatusUpdated = true;
    } catch (e) {
      console.error('[save-engine-replay-hits] window status update failed:', e);
    }

    return NextResponse.json({
      ok: true,
      // Core stats
      totalHits:    hits.length,
      straightHits,
      boxedHits,
      uniqueStates,
      bestState,
      bestTerm,
      // Verification counts — UI can warn if these are unexpected
      backtestHitsWritten,
      backtestSummaryWritten,
      dreamStatusUpdated,
      windowStatusUpdated,
      personalHitEventsCreated,
      personalHitMappingsUpdated,
      alreadyCounted,
    });
  } catch (err) {
    console.error('[save-engine-replay-hits] failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save engine replay hits.' },
      { status: 500 }
    );
  }
}
