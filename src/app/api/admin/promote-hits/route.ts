import { NextRequest, NextResponse }    from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp }       from 'firebase-admin/firestore';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function getAdminDb() {
  if (getApps().length === 0) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set.');
    initializeApp({ credential: cert(JSON.parse(key)) });
  }
  return getFirestore();
}

function toHitType(matchType: string): 'straight' | 'boxed' {
  return matchType === 'exact' ? 'straight' : 'boxed';
}

function toGameType(g: string): string {
  if (g === 'pick3') return 'cash3';
  if (g === 'pick4') return 'cash4';
  return g;
}

function calcDays(anchor: string, drawDate: string): number {
  return Math.round((new Date(drawDate).getTime() - new Date(anchor).getTime()) / 86_400_000);
}

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}));
    const ownerUid = body?.ownerUid ?? process.env.SWEET404_OWNER_UID;
    if (!ownerUid) return NextResponse.json({ error: 'ownerUid required.' }, { status: 400 });

    const db       = getAdminDb();
    const hitsSnap = await db.collection('dreamHits').where('ownerUid', '==', ownerUid).get();
    if (hitsSnap.empty) return NextResponse.json({ ok: true, promoted: 0, message: 'No dreamHits.' });

    const mappingsSnap = await db.collection('personalHitMappings').where('ownerUid', '==', ownerUid).get();
    const existing     = new Map<string, { id: string; hitCount: number; straightCount: number; boxedCount: number }>();
    mappingsSnap.forEach(d => {
      const data = d.data();
      const key  = [data.dreamerId, data.termLabel, data.number, data.gameType, data.state].join('::');
      existing.set(key, { id: d.id, hitCount: data.hitCount ?? 0, straightCount: data.straightCount ?? 0, boxedCount: data.boxedCount ?? 0 });
    });

    const now    = Timestamp.now();
    const batch  = db.batch();
    let promoted = 0;
    let updated  = 0;

    hitsSnap.forEach(d => {
      const h          = d.data();
      const gameType   = toGameType(h.game_type as string);
      const hitType    = toHitType(h.match_type as string);
      const drawDate   = h.draw_date as string;
      const anchor     = (h.anchor_date as string) ?? drawDate;
      const daysFromDream = calcDays(anchor, drawDate);
      const key        = [h.dreamerId, h.termLabel, h.candidate, gameType, h.state].join('::');
      const prev       = existing.get(key);
      const sDelta     = hitType === 'straight' ? 1 : 0;
      const bDelta     = hitType === 'boxed'    ? 1 : 0;

      if (prev) {
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
        updated++;
      } else {
        existing.set(key, { id: 'pending', hitCount: 1, straightCount: sDelta, boxedCount: bDelta });
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
        promoted++;
      }
    });

    await batch.commit();
    return NextResponse.json({ ok: true, promoted, updated, total: promoted + updated });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
