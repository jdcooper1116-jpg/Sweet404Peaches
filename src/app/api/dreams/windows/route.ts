/**
 * GET /api/dreams/windows?ownerUid=...
 *
 * Server-side Firebase Admin read for activeDreamWindows.
 * Replaces listActiveDreamWindows() client Firestore call in /windows page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ownerUid = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const db = getAdminDb();

    const snap = await db
      .collection('activeDreamWindows')
      .where('ownerUid', '==', ownerUid)
      .limit(2000)
      .get();

    const windows = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt:     data.createdAt?.toDate?.()?.toISOString?.()     ?? data.createdAt     ?? null,
        updatedAt:     data.updatedAt?.toDate?.()?.toISOString?.()     ?? data.updatedAt     ?? null,
        lastCheckedAt: data.lastCheckedAt?.toDate?.()?.toISOString?.() ?? data.lastCheckedAt ?? null,
      };
    });

    return NextResponse.json({ ok: true, windows });
  } catch (err) {
    console.error('[api/dreams/windows] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load active windows.' },
      { status: 500 }
    );
  }
}
