/**
 * POST /api/admin/promote-hits
 *
 * Promotes dreamHits into personalHitMappings (As They Fell Before).
 *
 * v2.3: Made idempotent using dreamHitPromotions registry.
 * - Pre-fetches which dreamHit docIds have already been promoted.
 * - Only processes new (not yet promoted) hits.
 * - Writes a promotion record for each newly processed hit.
 * - Re-running this route NEVER inflates hitCount, straightCount,
 *   boxedCount, or stateStrengthScore for already-promoted hits.
 */
import { NextRequest, NextResponse }    from 'next/server';
import { getAdminDb }                   from '@/lib/firebase/admin';
import { Timestamp }                     from 'firebase-admin/firestore';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function toHitType(matchType: string): 'straight' | 'boxed' {
  // "exact" → straight. Anything else ("box", "boxed") → boxed.
  // "both" should no longer appear in dreamHits (fixed in dreamRefresh v2.3),
  // but if old docs have it, treat as boxed.
  return matchType === 'exact' ? 'straight' : 'boxed';
}

function toGameType(g: string): string {
  if (g === 'pick3') return 'cash3';
  if (g === 'pick4') return 'cash4';
  return g;
}

function calcDays(anchor: string, drawDate: string): number {
  return Math.round(
    (new Date(drawDate).getTime() - new Date(anchor).getTime()) / 86_400_000
  );
}

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}));
    const ownerUid = body?.ownerUid ?? process.env.SWEET404_OWNER_UID;
    if (!ownerUid) return NextResponse.json({ error: 'ownerUid required.' }, { status: 400 });

    const db  = getAdminDb();
    const now = Timestamp.now();

    // ── 1. Load all dreamHits for this owner ──────────────────────────────────
    const hitsSnap = await db.collection('dreamHits').where('ownerUid', '==', ownerUid).get();
    if (hitsSnap.empty) {
      return NextResponse.json({ ok: true, promoted: 0, skipped: 0, message: 'No dreamHits.' });
    }

    // ── 2. Load already-promoted hit IDs (idempotency registry) ──────────────
    // dreamHitPromotions: one doc per dreamHit docId that has been promoted.
    // Single-field query on dreamHitId — no composite index needed.
    const promotionsSnap = await db
      .collection('dreamHitPromotions')
      .where('ownerUid', '==', ownerUid)
      .get();

    const promotedIds = new Set<string>(promotionsSnap.docs.map(d => d.id));

    // ── 3. Split into new vs already-promoted ─────────────────────────────────
    const newHitDocs: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
    let skipped = 0;

    hitsSnap.forEach(d => {
      if (promotedIds.has(d.id)) {
        skipped++;
      } else {
        newHitDocs.push({ id: d.id, data: d.data() });
      }
    });

    if (newHitDocs.length === 0) {
      return NextResponse.json({ ok: true, promoted: 0, skipped, message: 'All hits already promoted.' });
    }

    // ── 4. Load existing personalHitMappings to decide upsert vs create ───────
    const mappingsSnap = await db
      .collection('personalHitMappings')
      .where('ownerUid', '==', ownerUid)
      .get();

    const existing = new Map<string, { id: string; hitCount: number; straightCount: number; boxedCount: number }>();
    mappingsSnap.forEach(d => {
      const data = d.data();
      const key  = [data.dreamerId, data.termLabel, data.number, data.gameType, data.state].join('::');
      existing.set(key, {
        id: d.id,
        hitCount:      data.hitCount      ?? 0,
        straightCount: data.straightCount ?? 0,
        boxedCount:    data.boxedCount    ?? 0,
      });
    });

    // ── 5. Process new hits in batches ────────────────────────────────────────
    const BATCH_SIZE = 200; // smaller batch because we write 2 collections per hit
    let promoted = 0;
    let updated  = 0;

    // Track newly created mappings within this run to avoid duplicate creates
    const newlyCreated = new Map<string, { id: string; hitCount: number; straightCount: number; boxedCount: number }>();

    for (let i = 0; i < newHitDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = newHitDocs.slice(i, i + BATCH_SIZE);

      for (const { id: hitDocId, data: h } of chunk) {
        const gameType  = toGameType(h.game_type as string);
        const hitType   = toHitType(h.match_type  as string);
        const drawDate  = h.draw_date  as string;
        const anchor    = (h.anchor_date as string) ?? drawDate;
        const daysFromDream = calcDays(anchor, drawDate);
        const sDelta    = hitType === 'straight' ? 1 : 0;
        const bDelta    = hitType === 'boxed'    ? 1 : 0;
        const mappingKey = [h.dreamerId, h.termLabel, h.candidate, gameType, h.state].join('::');

        // Write promotion record (marks this hit as promoted)
        batch.set(
          db.collection('dreamHitPromotions').doc(hitDocId),
          { ownerUid, hitDocId, promotedAt: now }
        );

        const prev = existing.get(mappingKey) ?? newlyCreated.get(mappingKey);

        if (prev) {
          // Mapping already exists — update counts
          const newS = prev.straightCount + sDelta;
          const newB = prev.boxedCount    + bDelta;
          batch.update(db.collection('personalHitMappings').doc(prev.id), {
            hitCount:           prev.hitCount + 1,
            straightCount:      newS,
            boxedCount:         newB,
            stateStrengthScore: newS * 3 + newB,
            lastHitDate:        drawDate,
            updatedAt:          now,
          });
          // Update in-memory so subsequent hits in this batch are correct
          prev.hitCount++;
          prev.straightCount = newS;
          prev.boxedCount    = newB;
          updated++;
        } else {
          // New mapping — create
          const ref = db.collection('personalHitMappings').doc();
          batch.set(ref, {
            ownerUid,
            dreamerId:          h.dreamerId   ?? '',
            dreamerName:        h.dreamerName ?? '',
            termLabel:          h.termLabel,
            number:             h.candidate,
            gameType,
            state:              h.state,
            drawTime:           h.draw_time,
            drawDate,
            hitType,
            sourceDreamEntryId: h.dreamEntryId ?? '',
            daysFromDream,
            sameDay:            daysFromDream === 0,
            hitCount:           1,
            straightCount:      sDelta,
            boxedCount:         bDelta,
            stateStrengthScore: sDelta * 3 + bDelta,
            lastHitDate:        drawDate,
            createdAt:          now,
            updatedAt:          now,
          });
          // Track so same mapping isn't created twice within this run
          newlyCreated.set(mappingKey, {
            id: ref.id, hitCount: 1, straightCount: sDelta, boxedCount: bDelta,
          });
          promoted++;
        }
      }

      await batch.commit();
    }

    return NextResponse.json({
      ok:       true,
      promoted,
      updated,
      skipped,
      total:    promoted + updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[promote-hits]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
