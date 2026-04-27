/**
 * GET /api/dreams/latest?ownerUid=...&dreamerId=...&n=...
 *
 * Server-side Firebase Admin read — returns the n most recent dreamEntries.
 * Replaces getLatestDreamEntry() / listDreamEntries() client Firestore calls
 * in Forecast Board, Daily Ops, Chat, and Dashboard.
 *
 * Query params:
 *   ownerUid   required
 *   dreamerId  optional — filter to one dreamer
 *   n          optional — number of entries to return, default 1, max 20
 *
 * When n=1 (default), response.entry is the single latest entry (or null).
 * When n>1, response.entries is an array sorted most-recent-first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = params.get('dreamerId') ?? '';
    const n         = Math.min(Math.max(Number(params.get('n') ?? 1), 1), 20);

    const db = getAdminDb();

    let query = db
      .collection('dreamEntries')
      .where('ownerUid', '==', ownerUid);

    if (dreamerId) {
      query = query.where('dreamerId', '==', dreamerId) as any;
    }

    // Fetch slightly more than n to handle sort + dedupe
    const snap = await (query as any).limit(50).get();

    const entries = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        uploadedAt: data.uploadedAt?.toDate?.()?.toISOString?.() ?? data.uploadedAt ?? null,
        createdAt:  data.createdAt?.toDate?.()?.toISOString?.()  ?? data.createdAt  ?? null,
        updatedAt:  data.updatedAt?.toDate?.()?.toISOString?.()  ?? data.updatedAt  ?? null,
      };
    });

    // Sort: dreamDate desc, then uploadedAt desc (most recent first)
    entries.sort((a: any, b: any) => {
      const dateA = String(a.dreamDate ?? '');
      const dateB = String(b.dreamDate ?? '');
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;
      const upA = String(a.uploadedAt ?? a.createdAt ?? '');
      const upB = String(b.uploadedAt ?? b.createdAt ?? '');
      return upA < upB ? 1 : -1;
    });

    const topN = entries.slice(0, n);

    // Convenience: n=1 exposes a single `entry` field (matches getLatestDreamEntry usage)
    return NextResponse.json({
      ok:      true,
      entry:   topN[0] ?? null,       // single-entry shortcut
      entries: topN,                  // always an array
      count:   topN.length,
    });
  } catch (err) {
    console.error('[api/dreams/latest] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load latest dream entry.' },
      { status: 500 }
    );
  }
}
