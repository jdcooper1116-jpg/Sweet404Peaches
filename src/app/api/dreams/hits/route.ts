import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ownerUid = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const db = getAdminDb();

    const snap = await db
      .collection('dreamHits')
      .where('ownerUid', '==', ownerUid)
      .limit(5000)
      .get();

    const hits = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        detectedAt: data.detectedAt?.toDate?.()?.toISOString?.() ?? data.detectedAt ?? null,
      };
    });

    hits.sort((a: any, b: any) => {
      const ak = String(a.draw_date ?? '') + ' ' + String(a.draw_time ?? '');
      const bk = String(b.draw_date ?? '') + ' ' + String(b.draw_time ?? '');
      return ak < bk ? 1 : -1;
    });

    return NextResponse.json({ ok: true, hits });
  } catch (err) {
    console.error('[api/dreams/hits] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dream hits.' },
      { status: 500 }
    );
  }
}
