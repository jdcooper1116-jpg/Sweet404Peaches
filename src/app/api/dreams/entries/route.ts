/**
 * GET /api/dreams/entries?ownerUid=...&dreamerId=...&limit=...
 *
 * Server-side Firebase Admin read for dreamEntries collection.
 * Replaces listDreamEntries() client Firestore calls.
 *
 * Query params:
 *   ownerUid   required
 *   dreamerId  optional — filter to one dreamer (use "owner-self" for owner)
 *   limit      optional — max rows, default 200
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = params.get('dreamerId') ?? '';
    const maxRows   = Math.min(Number(params.get('limit') ?? 200), 1000);

    const db = getAdminDb();

    let query = db
      .collection('dreamEntries')
      .where('ownerUid', '==', ownerUid);

    if (dreamerId) {
      query = query.where('dreamerId', '==', dreamerId) as any;
    }

    const snap = await (query as any).limit(maxRows).get();

    const entries = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Serialize Firestore Timestamps → ISO strings
        uploadedAt: data.uploadedAt?.toDate?.()?.toISOString?.() ?? data.uploadedAt ?? null,
        createdAt:  data.createdAt?.toDate?.()?.toISOString?.()  ?? data.createdAt  ?? null,
        updatedAt:  data.updatedAt?.toDate?.()?.toISOString?.()  ?? data.updatedAt  ?? null,
      };
    });

    // Sort by dreamDate desc, then uploadedAt desc
    entries.sort((a: any, b: any) => {
      const dateA = String(a.dreamDate ?? '');
      const dateB = String(b.dreamDate ?? '');
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;
      const upA = String(a.uploadedAt ?? '');
      const upB = String(b.uploadedAt ?? '');
      return upA < upB ? 1 : -1;
    });

    return NextResponse.json({ ok: true, entries, count: entries.length });
  } catch (err) {
    console.error('[api/dreams/entries] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dream entries.' },
      { status: 500 }
    );
  }
}
