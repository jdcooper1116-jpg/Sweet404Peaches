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
      return { id: doc.id, ...data,
        detectedAt: data.detectedAt?.toDate?.()?.toISOString?.() ?? data.detectedAt ?? null };
    });

    hits.sort((a: any, b: any) => {
      const ak = String(a.draw_date ?? '') + ' ' + String(a.draw_time ?? '');
      const bk = String(b.draw_date ?? '') + ' ' + String(b.draw_time ?? '');
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
