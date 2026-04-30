/**
 * POST /api/admin/repair-hit-memory
 *
 * Idempotent one-time repair for accounts where:
 *   - activeDreamWindows exist but termNumberMappings lacks dreamer-scoped rows
 *   - dreamHits exist but personalHitMappings has 0 rows
 *
 * Caused by the pre-patch save-entry (no dreamerId in termNumberMappings)
 * and pre-patch promote-hits (old field shapes failing silently).
 *
 * IDEMPOTENCY: Uses dreamHitPromotions registry (same as promote-hits).
 * Re-running twice: hitsSkipped = same count, hitsPromoted = 0.
 *
 * SAFETY:
 *   POST only · ownerUid required · capped reads · no automatic load
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue }    from 'firebase-admin/firestore';
import { getAdminDb }               from '@/lib/firebase/admin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function safeId(v: unknown): string {
  return String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
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

function pmDocId(ownerUid: string, dreamerId: string, normalizedTerm: string,
                 number: string, gameType: string, state: string): string {
  return [ownerUid, dreamerId, normalizedTerm, number, gameType, state].map(safeId).join('__');
}

function dictDocId(ownerUid: string, dreamerId: string, normalizedTerm: string,
                   number: string, gameType: string): string {
  return [ownerUid, dreamerId, normalizedTerm, number, gameType].map(safeId).join('__');
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body        = await req.json().catch(() => ({}));
    const ownerUid    = String(body?.ownerUid    ?? '').trim();
    const dreamerId   = String(body?.dreamerId   ?? '').trim();  // optional dreamer filter
    const hitsLimit   = Math.min(Number(body?.hitsLimit   ?? 500),  1000);
    const windowsLimit= Math.min(Number(body?.windowsLimit?? 200),   500);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid is required.' }, { status: 400 });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();

    const report = {
      hitsPromoted:    0,
      hitsSkipped:     0,
      dictRowsWritten: 0,
      windowsProcessed:0,
      errors:          [] as string[],
    };

    const BATCH = 400;

    // ── Step 1: backfill termNumberMappings from activeDreamWindows ───────────

    let winQuery = db
      .collection('activeDreamWindows')
      .where('ownerUid', '==', ownerUid)
      .limit(windowsLimit) as any;
    if (dreamerId) winQuery = winQuery.where('dreamerId', '==', dreamerId);

    const winSnap = await winQuery.get();
    const dictRows: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const doc of winSnap.docs) {
      const w = doc.data();
      report.windowsProcessed++;

      const did     = String(w.dreamerId   ?? 'owner-self');
      const dname   = String(w.dreamerName ?? '');
      const term    = String(w.termLabel   ?? '').trim();
      const number  = String(w.number      ?? '').trim();
      const gt      = String(w.gameType    ?? w.game_type ?? '');
      const eid     = String(w.dreamEntryId ?? '');
      const date    = String(w.activeStart ?? '');

      // Normalize gameType to app-facing (cash3/cash4)
      const gameType = (gt === 'pick3') ? 'cash3' : (gt === 'pick4') ? 'cash4' : gt;

      if (!term || !number || !gameType) continue;

      const normalizedTerm = normalizeTerm(term);
      const docId          = dictDocId(ownerUid, did, normalizedTerm, number, gameType);

      dictRows.push({ id: docId, data: {
        ownerUid,
        dreamerId:          did,
        dreamerName:        dname,
        termLabel:          term,
        normalizedTerm,
        number,
        gameType,
        source:             'live-dream-intake',
        dreamEntryId:       eid,
        sourceDreamEntryId: eid,
        dreamDate:          date,
        createdAt:          now,
        updatedAt:          now,
      }});
    }

    for (let i = 0; i < dictRows.length; i += BATCH) {
      const batch = db.batch();
      for (const { id, data } of dictRows.slice(i, i + BATCH)) {
        batch.set(db.collection('termNumberMappings').doc(id), data, { merge: true });
      }
      await batch.commit();
      report.dictRowsWritten += dictRows.slice(i, i + BATCH).length;
    }

    // ── Step 2: promote unpromoted dreamHits → personalHitMappings ───────────
    // Uses dreamHitPromotions registry — same idempotency as promote-hits route.

    let hitsQuery = db
      .collection('dreamHits')
      .where('ownerUid', '==', ownerUid)
      .limit(hitsLimit) as any;
    if (dreamerId) hitsQuery = hitsQuery.where('dreamerId', '==', dreamerId);

    const hitsSnap   = await hitsQuery.get();
    const promoSnap  = await db
      .collection('dreamHitPromotions')
      .where('ownerUid', '==', ownerUid)
      .get();
    const promotedIds = new Set<string>(promoSnap.docs.map(d => d.id));

    // Pre-fetch dreamer display names for hits that lack them
    const dreamerCache = new Map<string, string>();
    for (const doc of hitsSnap.docs) {
      const h   = doc.data();
      const did = String(h.dreamerId ?? '');
      if (!h.dreamerName && did && did !== 'owner-self' && !dreamerCache.has(did)) {
        try {
          const dreamerDoc = await db.collection('dreamers').doc(did).get();
          if (dreamerDoc.exists) dreamerCache.set(did, String(dreamerDoc.data()?.displayName ?? ''));
        } catch { /* non-fatal */ }
      }
    }
    let ownerDisplayName = '';
    try {
      const ownerDoc = await db.collection('ownerProfiles').doc(ownerUid).get();
      ownerDisplayName = String(ownerDoc.data()?.displayName ?? '');
    } catch { /* non-fatal */ }

    function resolveDreamerName(h: Record<string, any>): string {
      if (h.dreamerName) return String(h.dreamerName);
      const did = String(h.dreamerId ?? 'owner-self');
      if (did === 'owner-self') return ownerDisplayName;
      return dreamerCache.get(did) ?? did;
    }

    const newHits = hitsSnap.docs.filter((d: any) => !promotedIds.has(d.id));
    report.hitsSkipped = hitsSnap.size - newHits.length;

    for (let i = 0; i < newHits.length; i += BATCH) {
      const batch = db.batch();
      const chunk = newHits.slice(i, i + BATCH);

      for (const doc of chunk) {
        const h            = doc.data() as Record<string, any>;
        const dreamerId_   = String(h.dreamerId ?? 'owner-self');
        const dreamerName_ = resolveDreamerName(h);
        const termLabel    = String(h.termLabel ?? '').trim();
        const normalizedTerm = normalizeTerm(termLabel);
        const number       = resolveNumber(h);
        const winningNum   = resolveWinningNumber(h);
        const gameType     = resolveGameType(h);
        const drawDate     = resolveDrawDate(h);
        const drawTime     = resolveDrawTime(h);
        const hitType      = resolveHitType(h);
        const state        = String(h.state ?? '').trim();
        const dreamEntryId = String(h.dreamEntryId ?? '');
        const windowId     = String(h.dreamWindowId ?? h.activeWindowId ?? '');
        const anchor       = String(h.anchor_date ?? h.anchorDate ?? drawDate);
        const daysFromDream = (() => {
          try { return Math.round((new Date(drawDate).getTime() - new Date(anchor).getTime()) / 86_400_000); }
          catch { return 0; }
        })();

        if (!number || !state || !termLabel) {
          report.hitsSkipped++;
          continue;
        }

        const sDelta = hitType === 'straight' ? 1 : 0;
        const bDelta = hitType === 'boxed'    ? 1 : 0;
        const pmId   = pmDocId(ownerUid, dreamerId_, normalizedTerm, number, gameType, state);

        batch.set(
          db.collection('personalHitMappings').doc(pmId),
          {
            ownerUid,
            dreamerId:          dreamerId_,
            dreamerName:        dreamerName_,
            termLabel,
            normalizedTerm,
            number,
            candidateNumber:    number,
            winningNumber:      winningNum,
            gameType,
            state,
            drawDate,
            drawTime,
            hitType,
            matchMode:          hitType,
            source:             'live-dream-refresh',
            dreamEntryId,
            sourceDreamEntryId: dreamEntryId,
            activeWindowId:     windowId,
            dreamWindowId:      windowId,
            daysFromDream,
            sameDay:            daysFromDream === 0,
            hitCount:           FieldValue.increment(1),
            straightCount:      FieldValue.increment(sDelta),
            boxedCount:         FieldValue.increment(bDelta),
            stateStrengthScore: FieldValue.increment(sDelta * 3 + bDelta),
            lastHitDate:        drawDate,
            lastHitAt:          now,
            updatedAt:          now,
            createdAt:          now,
          },
          { merge: true }
        );

        // Mark as promoted
        batch.set(
          db.collection('dreamHitPromotions').doc(doc.id),
          { ownerUid, hitDocId: doc.id, promotedAt: now },
          { merge: true }
        );

        report.hitsPromoted++;
      }
      await batch.commit();
    }

    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error('[repair-hit-memory]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Repair failed.' },
      { status: 500 }
    );
  }
}
