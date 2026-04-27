/**
 * GET /api/backtest/dream-detail?ownerUid=...&backtestDreamId=...
 *
 * Server-side Firebase Admin read.
 * Returns full detail for one backtest dream: hits sorted chrono, summary.
 * Used by: Replay Lab (hit display after dream is selected).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ownerUid        = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const backtestDreamId = (req.nextUrl.searchParams.get('backtestDreamId') || '').trim();

    if (!backtestDreamId) {
      return NextResponse.json({ ok: false, error: 'backtestDreamId is required.' }, { status: 400 });
    }

    const db = getAdminDb();

    // Fetch dream, hits, and summary in parallel.
    const [dreamDoc, hitsSnap, summaryDoc] = await Promise.all([
      db.collection('backtestDreams').doc(backtestDreamId).get(),
      db.collection('backtestHits')
        .where('backtestDreamId', '==', backtestDreamId)
        .limit(2000)
        .get(),
      db.collection('backtestSummaries').doc(backtestDreamId).get(),
    ]);

    if (!dreamDoc.exists) {
      return NextResponse.json({ ok: false, error: 'Dream not found.' }, { status: 404 });
    }

    const dreamData = dreamDoc.data()!;
    if (dreamData.ownerUid !== ownerUid) {
      return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 });
    }

    // Build hits array sorted chronologically.
    const hits = hitsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => {
        const ak = `${a.drawDate ?? ''} ${a.drawTime ?? ''}`;
        const bk = `${b.drawDate ?? ''} ${b.drawTime ?? ''}`;
        return ak < bk ? -1 : ak > bk ? 1 : 0;
      });

    const summary = summaryDoc.exists
      ? { id: summaryDoc.id, ...summaryDoc.data() }
      : null;

    return NextResponse.json({
      ok:     true,
      dream:  { id: dreamDoc.id, ...dreamData },
      hits,
      hitCount: hits.length,
      summary,
    });
  } catch (err) {
    console.error('[dream-detail] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dream detail.' },
      { status: 500 }
    );
  }
}
