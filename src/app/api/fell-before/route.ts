/**
 * GET /api/fell-before?ownerUid=...
 *
 * Server-side Firebase Admin read.
 * Returns all personalHitMappings for the owner.
 * Used by: As They Fell Before page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ownerUid = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const db = getAdminDb();

    const snap = await db
      .collection('personalHitMappings')
      .where('ownerUid', '==', ownerUid)
      .limit(5000)
      .get();

    const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error('[fell-before] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load term memory.' },
      { status: 500 }
    );
  }
}
