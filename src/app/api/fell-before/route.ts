/**
 * GET /api/fell-before?ownerUid=...&dreamerId=...
 *
 * Server-side Firebase Admin read for personalHitMappings.
 * Powers the As They Fell Before page.
 *
 * dreamerId behavior:
 *   (not provided)      → all dreamers for this owner (existing behavior)
 *   dreamerId=owner-self → rows where dreamerId == "owner-self"
 *   dreamerId=<id>       → rows where dreamerId == <id>
 *
 * This allows the As They Fell Before page to show:
 *   - All Dreamers view  (no dreamerId param)
 *   - Owner / Self view  (dreamerId=owner-self)
 *   - Individual dreamer (dreamerId=abc123)
 *
 * Two dreamers CAN independently have credit for the same term/number/result.
 * Rows are NOT merged across dreamers unless the UI requests "All Dreamers."
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = params.get('dreamerId') ?? '';  // '' = all dreamers

    const db = getAdminDb();

    let query = db
      .collection('personalHitMappings')
      .where('ownerUid', '==', ownerUid);

    // Only add dreamerId filter when explicitly requested.
    // Empty string = no filter = all dreamers.
    if (dreamerId) {
      query = query.where('dreamerId', '==', dreamerId) as any;
    }

    const snap = await (query as any).limit(5000).get();

    const rows = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? null,
      };
    });

    return NextResponse.json({
      ok:         true,
      rows,
      count:      rows.length,
      dreamerId:  dreamerId || 'ALL',
    });
  } catch (err) {
    console.error('[api/fell-before] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load term memory.' },
      { status: 500 }
    );
  }
}
