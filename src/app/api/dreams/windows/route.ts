/**
 * GET /api/dreams/windows?ownerUid=...
 *
 * Quota-protected (v2):
 *   limit          — default 100, max 250
 *   includeExpired — default false; filters to activeEnd >= today
 *                    Pass includeExpired=true to include historical/expired windows.
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
    const params         = req.nextUrl.searchParams;
    const ownerUid       = resolveOwnerUid(params.get('ownerUid'));
    const includeExpired = params.get('includeExpired') === 'true';
    const maxRows        = Math.min(Number(params.get('limit') ?? 100), 250);
    const today          = new Date().toISOString().slice(0, 10);

    const db = getAdminDb();
    let query = db.collection('activeDreamWindows').where('ownerUid', '==', ownerUid);

    // Active-only by default — avoids reading thousands of expired rows
    if (!includeExpired) {
      query = query.where('activeEnd', '>=', today) as any;
    }

    const snap = await (query as any).limit(maxRows).get();

    const windows = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id, ...data,
        createdAt:     data.createdAt?.toDate?.()?.toISOString?.()     ?? data.createdAt     ?? null,
        updatedAt:     data.updatedAt?.toDate?.()?.toISOString?.()     ?? data.updatedAt     ?? null,
        lastCheckedAt: data.lastCheckedAt?.toDate?.()?.toISOString?.() ?? data.lastCheckedAt ?? null,
      };
    });

    const res = NextResponse.json({ ok: true, windows, count: windows.length, includeExpired, limit: maxRows });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  } catch (err) {
    console.error('[api/dreams/windows]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q,
        error: q ? 'Firebase quota exhausted. Try again later.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
