/**
 * GET /api/fell-before?ownerUid=...&dreamerId=...
 *
 * Quota-protected (v2):
 *   limit — default 250, max 500
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
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = params.get('dreamerId') ?? '';
    const maxRows   = Math.min(Number(params.get('limit') ?? 250), 500);

    const db = getAdminDb();
    let query = db.collection('personalHitMappings').where('ownerUid', '==', ownerUid);
    if (dreamerId) query = query.where('dreamerId', '==', dreamerId) as any;

    const snap = await (query as any).limit(maxRows).get();

    const rows = snap.docs.map((doc: any) => {
      const data = doc.data();
      return { id: doc.id, ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? null };
    });

    const res = NextResponse.json({ ok: true, rows, count: rows.length, dreamerId: dreamerId || 'ALL', limit: maxRows });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  } catch (err) {
    console.error('[api/fell-before]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q,
        error: q ? 'Firebase quota exhausted. Try again later.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
