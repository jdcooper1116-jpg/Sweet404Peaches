/**
 * GET /api/dreams/hits?ownerUid=...
 *
 * Quota-protected (v2):
 *   limit — default 100, max 250
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

export async function GET(req: NextRequest) {
  try {
    const params   = req.nextUrl.searchParams;
    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const maxRows  = Math.min(Number(params.get('limit') ?? 100), 250);

    const db = getAdminDb();
    const snap = await db
      .collection('dreamHits')
      .where('ownerUid', '==', ownerUid)
      .limit(maxRows)
      .get();

    const hits = snap.docs.map((doc: any) => {
      const data = doc.data();

      // ── Normalize field aliases ────────────────────────────────────────────
      // dreamHits docs store: candidate, winning_number, game_type, match_type,
      // draw_date, draw_time.  Some UI layers expect: number, winningNumber,
      // gameType, hitType.  Emit both so all consumers work without changes.
      const number      = data.number      ?? data.candidate      ?? data.candidateNumber ?? data.playedNumber ?? null;
      const winningNumber = data.winningNumber ?? data.winning_number ?? data.result ?? data.drawResult ?? null;
      const gameType    = data.gameType    ?? data.game_type       ?? data.lotteryGame ?? null;
      const hitType     = data.hitType     ?? data.match_type      ?? data.matchType  ?? data.matchMode ?? null;
      const drawDate    = data.drawDate    ?? data.draw_date       ?? data.date  ?? null;
      const drawTime    = data.drawTime    ?? data.draw_time       ?? data.time  ?? data.drawSlot ?? null;
      const dreamerName = data.dreamerName ?? null;
      const dreamerId   = data.dreamerId   ?? 'owner-self';
      const termLabel   = data.termLabel   ?? null;
      const state       = data.state       ?? null;

      return {
        id: doc.id,
        ...data,
        // Normalized aliases always present regardless of stored field name:
        number,
        winningNumber,
        gameType,
        hitType,
        drawDate,
        drawTime,
        dreamerName,
        dreamerId,
        termLabel,
        state,
        detectedAt: data.detectedAt?.toDate?.()?.toISOString?.() ?? data.detectedAt ?? null,
      };
    });

    hits.sort((a: any, b: any) => {
      const ak = String(a.drawDate ?? a.draw_date ?? '') + ' ' + String(a.drawTime ?? a.draw_time ?? '');
      const bk = String(b.drawDate ?? b.draw_date ?? '') + ' ' + String(b.drawTime ?? b.draw_time ?? '');
      return ak < bk ? 1 : -1;
    });

    const res = NextResponse.json({ ok: true, hits, count: hits.length, limit: maxRows });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  } catch (err) {
    console.error('[api/dreams/hits]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q,
        error: q ? 'Firebase quota exhausted. Try again later.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
