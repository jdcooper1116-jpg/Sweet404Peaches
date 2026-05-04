/**
 * POST /api/admin/promote-hits
 *
 * Promotes dreamHits → personalHitMappings (As They Fell Before).
 *
 * v2.4 changes vs v2.3:
 * - Handles both old snake_case dreamHit fields (candidate, game_type, draw_date,
 *   match_type) AND new camelCase aliases (number, gameType, drawDate, hitType).
 * - Resolves dreamerName: h.dreamerName → dreamers/{dreamerId} → ownerProfiles → dreamerId
 * - Writes normalizedTerm, candidateNumber, winningNumber, drawDate, drawTime
 *   to personalHitMappings (was missing before).
 * - Uses DETERMINISTIC personalHitMappings doc ID:
 *     ownerUid__dreamerId__normalizedTerm__number__gameType__state
 *   so re-runs find the same doc and update it rather than creating duplicates.
 * - Idempotency still via dreamHitPromotions (per-dreamHit docId registry).
 *
 * Architecture note:
 * /api/dreams/refresh calls this route after refreshAllActiveWindows().
 * dreamRefresh.ts writes dreamHits with normalized aliases.
 * This route is the single authority for personalHitMappings writes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb }                from '@/lib/firebase/admin';
import { Timestamp, FieldValue }     from 'firebase-admin/firestore';
import { canonicalPmDocId, canonicalEventId } from '@/lib/intelligence/hitClassification';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function resolveHitType(h: Record<string, any>): 'straight' | 'boxed' {
  const raw = String(h.hitType ?? h.match_type ?? h.matchMode ?? '');
  return raw === 'exact' || raw === 'straight' ? 'straight' : 'boxed';
}

function resolveGameType(h: Record<string, any>): string {
  const raw = String(h.gameType ?? h.game_type ?? '');
  if (raw === 'pick3') return 'cash3';
  if (raw === 'pick4') return 'cash4';
  return raw;
}

function resolveNumber(h: Record<string, any>): string {
  return String(h.number ?? h.candidateNumber ?? h.candidate ?? '').trim();
}

function resolveWinningNumber(h: Record<string, any>): string {
  return String(h.winningNumber ?? h.winning_number ?? '').trim();
}

function resolveDrawDate(h: Record<string, any>): string {
  return String(h.drawDate ?? h.draw_date ?? '').trim();
}

function resolveDrawTime(h: Record<string, any>): string {
  return String(h.drawTime ?? h.draw_time ?? '').trim();
}

function h_hasName(docs: Array<{data: FirebaseFirestore.DocumentData}>, dreamerId: string): boolean {
  return docs.some(({ data: h }) => h.dreamerId === dreamerId && Boolean(h.dreamerName));
}

function calcDays(anchor: string, drawDate: string): number {
  try {
    return Math.round((new Date(drawDate).getTime() - new Date(anchor).getTime()) / 86_400_000);
  } catch { return 0; }
}

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}));
    const ownerUid = String(body?.ownerUid ?? process.env.SWEET404_OWNER_UID ?? '').trim();
    if (!ownerUid) {
      return NextResponse.json({ error: 'ownerUid required.' }, { status: 400 });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();

    const hitsSnap = await db.collection('dreamHits').where('ownerUid', '==', ownerUid).get();
    if (hitsSnap.empty) {
      return NextResponse.json({ ok: true, promoted: 0, skipped: 0, message: 'No dreamHits.' });
    }

    const promotionsSnap = await db
      .collection('dreamHitPromotions').where('ownerUid', '==', ownerUid).get();
    const promotedIds = new Set<string>(promotionsSnap.docs.map(d => d.id));

    const newHitDocs: Array<{ id: string; data: Record<string, any> }> = [];
    let skipped = 0;
    hitsSnap.forEach(d => {
      if (promotedIds.has(d.id)) { skipped++; }
      else { newHitDocs.push({ id: d.id, data: d.data() as Record<string, any> }); }
    });

    if (newHitDocs.length === 0) {
      return NextResponse.json({ ok: true, promoted: 0, skipped, message: 'All hits already promoted.' });
    }

    // Pre-fetch dreamer display names
    const dreamerIdsMissing = new Set<string>();
    for (const { data: h } of newHitDocs) {
      if (!h.dreamerName && h.dreamerId && h.dreamerId !== 'owner-self') {
        dreamerIdsMissing.add(h.dreamerId);
      }
    }
    const dreamerNameCache = new Map<string, string>();
    for (const did of dreamerIdsMissing) {
      try {
        const doc = await db.collection('dreamers').doc(did).get();
        if (doc.exists) dreamerNameCache.set(did, String(doc.data()?.displayName ?? ''));
      } catch { /* non-fatal */ }
    }
    let ownerDisplayName = '';
    if (newHitDocs.some(({ data: h }) => !h.dreamerName && (!h.dreamerId || h.dreamerId === 'owner-self'))) {
      try {
        const ownerDoc = await db.collection('ownerProfiles').doc(ownerUid).get();
        ownerDisplayName = String(ownerDoc.data()?.displayName ?? '');
      } catch { /* non-fatal */ }
    }

    function resolveDreamerName(h: Record<string, any>): string {
      if (h.dreamerName) return String(h.dreamerName);
      const did = h.dreamerId ?? 'owner-self';
      if (did === 'owner-self') return ownerDisplayName;
      return dreamerNameCache.get(did) ?? did;
    }

    const BATCH_SIZE = 200;
    let promoted = 0;

    for (let i = 0; i < newHitDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = newHitDocs.slice(i, i + BATCH_SIZE);

      for (const { id: hitDocId, data: h } of chunk) {
        const dreamerId      = String(h.dreamerId ?? 'owner-self');
        const dreamerName    = resolveDreamerName(h);
        const termLabel      = String(h.termLabel ?? '').trim();
        const normalizedTerm = normalizeTerm(termLabel);
        const number         = resolveNumber(h);
        const winningNumber  = resolveWinningNumber(h);
        const gameType       = resolveGameType(h);
        const drawDate       = resolveDrawDate(h);
        const drawTime       = resolveDrawTime(h);
        const hitType        = resolveHitType(h);
        const state          = String(h.state ?? '').trim();
        const dreamEntryId   = String(h.dreamEntryId ?? '');
        const windowId       = String(h.dreamWindowId ?? h.activeWindowId ?? '');
        const anchor         = String(h.anchor_date ?? drawDate);
        const daysFromDream  = calcDays(anchor, drawDate);

        if (!number || !state || !termLabel) continue;

        const sDelta = hitType === 'straight' ? 1 : 0;
        const bDelta = hitType === 'boxed' ? 1 : 0;

        // Deterministic doc ID — re-runs find same doc and increment
        const pmId = canonicalPmDocId(ownerUid, dreamerId, normalizedTerm, number, gameType, state);

        batch.set(
          db.collection('personalHitMappings').doc(pmId),
          {
            ownerUid, dreamerId, dreamerName, termLabel, normalizedTerm,
            number, candidateNumber: number, winningNumber,
            gameType, state, drawDate, drawTime, hitType, matchMode: hitType,
            source: 'live-dream-refresh', dreamEntryId,
            sourceDreamEntryId: dreamEntryId, activeWindowId: windowId,
            daysFromDream, sameDay: daysFromDream === 0,
            hitCount:           FieldValue.increment(1),
            straightCount:      FieldValue.increment(sDelta),
            boxedCount:         FieldValue.increment(bDelta),
            stateStrengthScore: FieldValue.increment(hitType === 'straight' ? 3 : 1),
            lastHitDate: drawDate, lastHitAt: now, updatedAt: now, createdAt: now,
          },
          { merge: true }
        );

        // personalHitEvents — event-level proof, idempotent via canonical event ID
        const evId = canonicalEventId(
          ownerUid, dreamerId, normalizedTerm, number, gameType, state,
          drawDate, drawTime, hitType, dreamEntryId || windowId
        );
        batch.set(db.collection('personalHitEvents').doc(evId), {
          ownerUid, dreamerId, dreamerName, termLabel, normalizedTerm,
          candidateNumber: number, number, winningNumber,
          state, gameType, drawDate, drawTime,
          hitType, matchMode: hitType,
          hitCount: 1, straightCount: sDelta, boxedCount: bDelta,
          source: 'live-dream-refresh', sourceClass: 'live-dream-refresh',
          dreamEntryId, activeWindowId: windowId, sourceDreamEntryId: dreamEntryId,
          daysFromDream, sameDay: daysFromDream === 0,
          createdAt: now,
        }, { merge: true });

        batch.set(
          db.collection('dreamHitPromotions').doc(hitDocId),
          { ownerUid, hitDocId, promotedAt: now },
          { merge: true }
        );

        promoted++;
      }
      await batch.commit();
    }

    return NextResponse.json({ ok: true, promotedToMemory: promoted, promoted, skipped, total: promoted + skipped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[promote-hits]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
