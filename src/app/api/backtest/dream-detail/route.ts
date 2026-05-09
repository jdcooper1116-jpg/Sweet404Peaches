/**
 * GET /api/backtest/dream-detail?ownerUid=...&backtestDreamId=...
 *
 * Storage-adapter read.
 * Returns full detail for one backtest dream: hits sorted chrono, summary.
 * Used by: Replay Lab (hit display after dream is selected).
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnerUid } from '@/lib/firebase/admin';
import {
  getBacktestDreamById,
  getBacktestSummaryForDream,
  listBacktestHitsForDream,
} from '@/lib/storage/backtests';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ownerUid        = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const backtestDreamId = (req.nextUrl.searchParams.get('backtestDreamId') || '').trim();

    if (!backtestDreamId) {
      return NextResponse.json({ ok: false, error: 'backtestDreamId is required.' }, { status: 400 });
    }

    const [dream, hits, summary] = await Promise.all([
      getBacktestDreamById(ownerUid, backtestDreamId),
      listBacktestHitsForDream(ownerUid, backtestDreamId),
      getBacktestSummaryForDream(ownerUid, backtestDreamId),
    ]);

    if (!dream) {
      return NextResponse.json({ ok: false, error: 'Dream not found.' }, { status: 404 });
    }

    if (dream.ownerUid !== ownerUid) {
      return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 });
    }

    const sortedHits = [...hits].sort((a: any, b: any) => {
      const ak = `${a.drawDate ?? ''} ${a.drawTime ?? ''}`;
      const bk = `${b.drawDate ?? ''} ${b.drawTime ?? ''}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });

    return NextResponse.json({
      ok:     true,
      dream,
      hits: sortedHits,
      hitCount: sortedHits.length,
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
