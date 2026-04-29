import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export const maxDuration = 60;

// ─── Firebase Admin singleton ─────────────────────────────────────────────────
// Uses a module-level flag to avoid re-initializing on hot reload.
let adminDbInstance: ReturnType<typeof getFirestore> | null = null;

function adminDb(): ReturnType<typeof getFirestore> {
  if (adminDbInstance) return adminDbInstance;

  if (!getApps().length) {
    const projectId   = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId) {
      throw new Error('Firebase projectId missing. Set FIREBASE_PROJECT_ID in env.');
    }

    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,   // ← required — cert() alone does not set projectId
      });
    } else {
      // Dev fallback: relies on Application Default Credentials (gcloud auth).
      initializeApp({ projectId });
    }
  }

  adminDbInstance = getFirestore();
  return adminDbInstance;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
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
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid        = String(body.ownerUid        || '');
    const backtestDreamId = String(body.backtestDreamId || '');
    const dreamDate       = String(body.dreamDate       || '');
    const hits: EngineReplayHit[] = Array.isArray(body.hits) ? body.hits : [];

    // Callers may pass dreamerId/dreamerName directly.
    // If not, we look them up from the backtestDreams document.
    // This replaces the previous hardcoded values.
    let dreamerId   = String(body.dreamerId   || '');
    let dreamerName = String(body.dreamerName || '');

    if (!ownerUid)        return NextResponse.json({ ok: false, error: 'ownerUid is required.'        }, { status: 400 });
    if (!backtestDreamId) return NextResponse.json({ ok: false, error: 'backtestDreamId is required.' }, { status: 400 });
    if (!dreamDate)       return NextResponse.json({ ok: false, error: 'dreamDate is required.'       }, { status: 400 });

    const db  = adminDb();
    const now = Timestamp.now();

    // Look up dreamer from backtestDreams if not supplied by caller
    if (!dreamerId) {
      try {
        const dreamDoc = await db.collection('backtestDreams').doc(backtestDreamId).get();
        if (dreamDoc.exists) {
          const dd = dreamDoc.data() ?? {};
          if (dd.dreamerId)   dreamerId   = String(dd.dreamerId);
          if (dd.dreamerName) dreamerName = String(dd.dreamerName);
        }
      } catch { /* non-fatal */ }
      if (!dreamerId) dreamerId = 'owner-self';
    }

    // ── 1. Write backtestHits (one doc per hit, deterministic ID = safe dedup) ──
    const BATCH_SIZE = 400;
    for (let i = 0; i < hits.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = hits.slice(i, i + BATCH_SIZE);

      for (const hit of chunk) {
        const hitId = [
          backtestDreamId,
          hit.termLabel,
          hit.number,
          hit.state,
          hit.drawDate,
          hit.drawTime,
          hit.hitType,
          hit.normalizedResult,
        ].map(safeId).join('__');

        batch.set(
          db.collection('backtestHits').doc(hitId),
          {
            ownerUid,
            backtestDreamId,
            dreamDate,
            dreamerId,
            dreamerName,
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
            is_verified:      hit.is_verified  ?? false,
            source_name:      hit.source_name  ?? '',
            replaySource:     'lottery-engine',
            createdAt:        now,
            updatedAt:        now,
          },
          { merge: true }
        );
      }

      await batch.commit();
    }

    // ── 2. Write personalHitMappings (powers "As They Fell Before") ────────────
    //
    // personalHitMappings is what fell-before/page.tsx reads via
    // listPersonalHitMappings(). Each document represents a
    // (term, number, state, gameType, drawTime) combination and accumulates
    // hit counts over time. We upsert: if the doc exists, increment counts.
    //
    // Doc ID: ownerUid__termLabel__number__state__gameType__drawTime
    // This matches the query shape in buildDictionary() in fell-before/page.tsx.

    for (let i = 0; i < hits.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = hits.slice(i, i + BATCH_SIZE);

      for (const hit of chunk) {
        const mappingId = [
          ownerUid,
          hit.termLabel,
          hit.number,
          hit.state,
          hit.gameType,
          hit.drawTime,
        ].map(safeId).join('__');

        const straightDelta       = hit.hitType === 'straight' ? 1 : 0;
        const boxedDelta          = hit.hitType === 'boxed'    ? 1 : 0;
        const stateStrengthDelta  = hit.hitType === 'straight' ? 3 : 1;

        // Firestore Admin: use FieldValue.increment for safe concurrent upserts.
        const { FieldValue } = await import('firebase-admin/firestore');

        batch.set(
          db.collection('personalHitMappings').doc(mappingId),
          {
            ownerUid,
            // dreamerId/dreamerName from backtestDreams doc (or passed by caller)
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
            daysFromDream:      hit.daysFromDream,
            sameDay:            hit.sameDay,
            lastHitDate:        hit.drawDate,
            // Increment counters safely — these accumulate across replays.
            hitCount:           FieldValue.increment(1),
            straightCount:      FieldValue.increment(straightDelta),
            boxedCount:         FieldValue.increment(boxedDelta),
            stateStrengthScore: FieldValue.increment(stateStrengthDelta),
            replaySource:       'lottery-engine',
            backtestDreamId,
            updatedAt:          now,
            // createdAt only written if doc doesn't exist.
            createdAt:          now,
          },
          { merge: true }
        );
      }

      await batch.commit();
    }

    // ── 3. Write backtestSummaries ─────────────────────────────────────────────
    const straightHits = hits.filter(h => h.hitType === 'straight').length;
    const boxedHits    = hits.filter(h => h.hitType === 'boxed').length;

    const stateCounts = new Map<string, number>();
    const termCounts  = new Map<string, number>();
    for (const hit of hits) {
      stateCounts.set(hit.state,    (stateCounts.get(hit.state)    ?? 0) + 1);
      termCounts.set(hit.termLabel, (termCounts.get(hit.termLabel) ?? 0) + 1);
    }

    const uniqueStates = Array.from(stateCounts.keys());
    const bestState    = [...stateCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const bestTerm     = [...termCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const summary = {
      ownerUid,
      backtestDreamId,
      dreamDate,
      dreamerId,
      dreamerName,
      totalHits: hits.length,
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

    await db.collection('backtestSummaries').doc(backtestDreamId).set(summary, { merge: true });

    // ── 4. Update parent dream and window status ───────────────────────────────
    await Promise.all([
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
      ok: true,
      totalHits: hits.length,
      straightHits,
      boxedHits,
      uniqueStates,
      bestState,
      bestTerm,
    });
  } catch (err) {
    console.error('save-engine-replay-hits failed:', err);
    return NextResponse.json(
      {
        ok:    false,
        error: err instanceof Error ? err.message : 'Failed to save engine replay hits.',
      },
      { status: 500 }
    );
  }
}
