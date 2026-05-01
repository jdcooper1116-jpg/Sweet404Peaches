/**
 * POST /api/admin/repair-backtest-memory
 *
 * Promotes backtestHits into personalHitMappings (As They Fell Before).
 * Safe to run multiple times — uses personalHitEvents for idempotency.
 *
 * Use when:
 *   - Backtest Archive shows hits for a term but /api/fell-before returns 0
 *   - "people" has 27 hits in backtestHits but personalHitMappings has nothing
 *
 * Inputs:
 *   ownerUid    required
 *   backtestDreamId  optional — repair one dream at a time
 *   term             optional — repair one term (matched against termLabel)
 *   limit            optional, default 500, max 1000
 *
 * Idempotency:
 *   Event key = ownerUid::dreamerId::normalizedTerm::number::gameType::state::drawDate::drawTime::hitType::backtestDreamId
 *   Checked against personalHitEvents. Already-promoted hits are skipped.
 *
 * personalHitMappings doc ID:
 *   ownerUid__dreamerId__normalizedTerm__number__gameType__state  (aggregated per combo)
 *   FieldValue.increment for counts (idempotent via event guard above)
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue }    from 'firebase-admin/firestore';
import { getAdminDb }               from '@/lib/firebase/admin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}
function safeId(v: unknown): string {
  return String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}
function pmDocId(ownerUid: string, dreamerId: string, nt: string, number: string, gt: string, state: string): string {
  return [ownerUid, dreamerId, nt, number, gt, state].map(safeId).join('__');
}
function eventId(ownerUid: string, dreamerId: string, nt: string, number: string, gt: string, state: string,
                 drawDate: string, drawTime: string, hitType: string, btid: string): string {
  return [ownerUid, dreamerId, nt, number, gt, state, drawDate, drawTime, hitType, btid].map(safeId).join('__');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ownerUid       = String(body?.ownerUid       ?? '').trim();
    const btidFilter     = String(body?.backtestDreamId ?? '').trim();
    const termFilter     = String(body?.term            ?? '').trim().toLowerCase();
    const limit          = Math.min(Number(body?.limit   ?? 500), 1000);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid is required.' }, { status: 400 });
    }

    const db   = getAdminDb();
    const now  = Timestamp.now();
    const BATCH = 400;

    const report = { hitsScanned: 0, hitsPromoted: 0, hitsSkipped: 0, errors: [] as string[] };

    // ── 1. Fetch backtestHits ───────────────────────────────────────────────
    let hitsQ: any = db.collection('backtestHits').where('ownerUid', '==', ownerUid);
    if (btidFilter) hitsQ = hitsQ.where('backtestDreamId', '==', btidFilter);

    const hitsSnap = await hitsQ.limit(limit).get();
    report.hitsScanned = hitsSnap.size;

    let hitDocs: Array<{ id: string; data: Record<string, any> }> = hitsSnap.docs.map((d: any) => ({
      id: d.id, data: d.data(),
    }));

    // Optional: in-memory term filter
    if (termFilter) {
      hitDocs = hitDocs.filter(({ data: d }) => {
        const tl = String(d.termLabel ?? '').toLowerCase();
        const nt = String(d.normalizedTerm ?? '').toLowerCase();
        return tl.includes(termFilter) || nt.includes(termFilter);
      });
    }

    if (hitDocs.length === 0) {
      return NextResponse.json({ ok: true, ...report, message: 'No backtestHits found matching filters.' });
    }

    // ── 2. Pre-fetch personalHitEvents to find already-promoted hits ─────────
    let evQ: any = db.collection('personalHitEvents').where('ownerUid', '==', ownerUid);
    if (btidFilter) evQ = evQ.where('backtestDreamId', '==', btidFilter);
    const evSnap = await evQ.limit(Math.min(hitDocs.length * 2, 1000)).get();
    const alreadyPromoted = new Set(evSnap.docs.map((d: any) => d.id));

    // ── 3. Pre-fetch dreamer display names ───────────────────────────────────
    const dreamerCache = new Map<string, string>();
    const dreamerIds = [...new Set(hitDocs.map(h => String(h.data.dreamerId ?? 'owner-self')))];
    await Promise.all(dreamerIds.map(async did => {
      if (did === 'owner-self' || dreamerCache.has(did)) return;
      try {
        const doc = await db.collection('dreamers').doc(did).get();
        if (doc.exists) dreamerCache.set(did, String(doc.data()?.displayName ?? ''));
      } catch { /* non-fatal */ }
    }));
    let ownerDisplayName = '';
    try {
      const ownerDoc = await db.collection('ownerProfiles').doc(ownerUid).get();
      ownerDisplayName = String(ownerDoc.data()?.displayName ?? '');
    } catch { /* non-fatal */ }

    function resolveDreamerName(did: string, stored: string): string {
      if (stored) return stored;
      if (did === 'owner-self') return ownerDisplayName;
      return dreamerCache.get(did) ?? did;
    }

    // ── 4. Build new hits list ────────────────────────────────────────────────
    const newHits = hitDocs.filter(({ id }) => !alreadyPromoted.has(id));
    report.hitsSkipped = hitDocs.length - newHits.length;

    // ── 5. Write in batches ──────────────────────────────────────────────────
    for (let i = 0; i < newHits.length; i += BATCH) {
      const bw = db.batch();
      for (const { id: hitDocId, data: h } of newHits.slice(i, i + BATCH)) {

        const dreamerId   = String(h.dreamerId   ?? 'owner-self');
        const dreamerName = resolveDreamerName(dreamerId, String(h.dreamerName ?? ''));
        const termLabel   = String(h.termLabel   ?? '').trim();
        const normalizedT = normalizeTerm(termLabel);
        const number      = String(h.number ?? h.candidateNumber ?? h.candidate ?? '').trim();
        const winningNum  = String(h.winningNumber ?? h.winning_number ?? '').trim();
        const gameType    = (() => {
          const raw = String(h.gameType ?? h.game_type ?? '');
          if (raw === 'pick3') return 'cash3';
          if (raw === 'pick4') return 'cash4';
          return raw;
        })();
        const state       = String(h.state    ?? '').trim();
        const drawDate    = String(h.drawDate ?? h.draw_date ?? '').trim();
        const drawTime    = String(h.drawTime ?? h.draw_time ?? '').trim();
        const rawHitType  = String(h.hitType  ?? h.match_type ?? '');
        const hitType     = rawHitType === 'exact' || rawHitType === 'straight' ? 'straight' : 'boxed';
        const backtestDreamId = String(h.backtestDreamId ?? '');
        const anchorDate  = String(h.anchor_date ?? drawDate);
        const daysFromDream = (() => {
          try { return Math.round((new Date(drawDate).getTime() - new Date(anchorDate).getTime()) / 86_400_000); }
          catch { return 0; }
        })();

        if (!termLabel || !number || !state || !gameType) { report.hitsSkipped++; continue; }

        const eid  = eventId(ownerUid, dreamerId, normalizedT, number, gameType, state, drawDate, drawTime, hitType, backtestDreamId);
        const pmId = pmDocId(ownerUid, dreamerId, normalizedT, number, gameType, state);

        const sDelta = hitType === 'straight' ? 1 : 0;
        const bDelta = hitType === 'boxed'    ? 1 : 0;

        // Mark event as promoted
        bw.set(db.collection('personalHitEvents').doc(eid), {
          ownerUid,
          dreamerId,
          dreamerName,
          termLabel,
          normalizedTerm:     normalizedT,
          number,
          candidateNumber:    number,
          winningNumber:      winningNum,
          gameType,
          state,
          drawDate,
          drawTime,
          hitType,
          matchMode:          hitType,
          source:             'backtest-replay',
          backtestDreamId,
          sourceDreamEntryId: `backtest:${backtestDreamId}`,
          activeWindowId:     '',
          dreamDate:          anchorDate,
          anchorDate,
          daysFromDream,
          sameDay:            daysFromDream === 0,
          createdAt:          now,
        });

        // Upsert personalHitMappings
        bw.set(db.collection('personalHitMappings').doc(pmId), {
          ownerUid,
          dreamerId,
          dreamerName,
          termLabel,
          normalizedTerm:     normalizedT,
          number,
          candidateNumber:    number,
          winningNumber:      winningNum,
          gameType,
          state,
          drawDate,
          drawTime,
          hitType,
          matchMode:          hitType,
          source:             'backtest-replay',
          backtestDreamId,
          sourceDreamEntryId: `backtest:${backtestDreamId}`,
          daysFromDream,
          sameDay:            daysFromDream === 0,
          lastHitDate:        drawDate,
          lastHitAt:          now,
          hitCount:           FieldValue.increment(1),
          straightCount:      FieldValue.increment(sDelta),
          boxedCount:         FieldValue.increment(bDelta),
          stateStrengthScore: FieldValue.increment(sDelta * 3 + bDelta),
          createdAt:          now,
          updatedAt:          now,
        }, { merge: true });

        report.hitsPromoted++;
      }
      await bw.commit();
    }

    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error('[repair-backtest-memory]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Repair failed.' },
      { status: 500 }
    );
  }
}
