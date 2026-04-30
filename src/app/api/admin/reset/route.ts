/**
 * POST /api/admin/reset
 *
 * Server-side Firebase Admin reset for safe operational data cleanup.
 * Replaces client-side safeResetLiveOpsData / safeResetResearchData / hardResetOperationalData.
 *
 * Dictionaries are NEVER deleted — personalHitMappings and termNumberMappings survive all scopes.
 *
 * Scopes:
 *   live     — activeDreamWindows, dreamHits, dreamHitPromotions
 *   research — backtestHits, backtestSummaries, personalHitEvents (resets backtestDreams status)
 *   hard     — live + research
 *   factory  — ALL app data for ownerUid (dreamEntries, activeDreamWindows, dreamHits,
 *              dreamHitPromotions, personalHitEvents, personalHitMappings, termNumberMappings,
 *              backtestDreams, backtestHits, backtestSummaries, pinnedPlays, dreamers).
 *              ownerProfiles are preserved.
 *              Requires confirm === "DELETE EVERYTHING".
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

export const maxDuration = 60;

const COLLECTIONS_BY_SCOPE: Record<string, string[]> = {
  live:     ['activeDreamWindows', 'dreamHits', 'dreamHitPromotions'],
  research: ['backtestHits', 'backtestSummaries', 'personalHitEvents'],
  hard:     ['activeDreamWindows', 'dreamHits', 'dreamHitPromotions',
              'backtestHits', 'backtestSummaries', 'personalHitEvents'],
  // factory deletes EVERYTHING for this ownerUid except ownerProfiles
  factory:  [
    'dreamEntries',
    'activeDreamWindows',
    'dreamHits',
    'dreamHitPromotions',
    'personalHitEvents',
    'personalHitMappings',
    'termNumberMappings',
    'backtestDreams',
    'backtestHits',
    'backtestSummaries',
    'pinnedPlays',
    'dreamers',
  ],
};

async function deleteByOwner(
  db: ReturnType<typeof getAdminDb>,
  collection: string,
  ownerUid: string
): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(collection)
      .where('ownerUid', '==', ownerUid)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
  }
  return deleted;
}

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json();
    const ownerUid = String(body.ownerUid ?? process.env.SWEET404_OWNER_UID ?? '').trim();
    const scope    = String(body.scope    ?? '').trim() as 'live' | 'research' | 'hard' | 'factory';
    const confirm  = String(body.confirm  ?? '').trim();

    if (!ownerUid) return NextResponse.json({ error: 'ownerUid is required.' }, { status: 400 });
    if (!['live', 'research', 'hard', 'factory'].includes(scope))
      return NextResponse.json({ error: 'scope must be live, research, hard, or factory.' }, { status: 400 });
    // Factory reset requires the typed phrase "DELETE EVERYTHING"
    // Other scopes use CONFIRM_LIVE / CONFIRM_RESEARCH / CONFIRM_HARD
    const expectedConfirm = scope === 'factory' ? 'DELETE EVERYTHING' : `CONFIRM_${scope.toUpperCase()}`;
    if (confirm !== expectedConfirm) {
      return NextResponse.json(
        { error: scope === 'factory'
            ? 'Factory reset requires confirm === "DELETE EVERYTHING".'
            : `confirm must be "CONFIRM_${scope.toUpperCase()}" to proceed.` },
        { status: 400 }
      );
    }

    const db      = getAdminDb();
    const results: Record<string, number> = {};

    for (const col of COLLECTIONS_BY_SCOPE[scope]) {
      results[col] = await deleteByOwner(db, col, ownerUid);
    }

    // For research/hard: reset backtestDreams status back to intake-saved.
    // (For factory scope, backtestDreams are fully deleted above — no reset needed.)
    if (scope === 'research' || scope === 'hard') {
      let resetCount = 0;
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db.collection('backtestDreams').where('ownerUid', '==', ownerUid).limit(400);
        if (cursor) q = q.startAfter(cursor) as any;
        const snap = await q.get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach(d => {
          batch.update(d.ref, { status: 'intake-saved', totalHits: 0, straightHits: 0, boxedHits: 0 });
          resetCount++;
        });
        await batch.commit();
        cursor = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 400) break;
      }
      results['backtestDreams_status_reset'] = resetCount;
    }

    return NextResponse.json({ ok: true, scope, results });
  } catch (err) {
    console.error('[admin/reset]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Reset failed.' }, { status: 500 });
  }
}
