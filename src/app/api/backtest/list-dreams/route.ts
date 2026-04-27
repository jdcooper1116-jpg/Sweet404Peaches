/**
 * GET /api/backtest/list-dreams?ownerUid=...
 *
 * Server-side Firebase Admin read.
 * Returns all backtestDreams for the owner, enriched with summary data.
 * Used by: Backtest Archive page, Replay Lab dropdown.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ownerUid = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const db = getAdminDb();

    // Fetch dreams and summaries in parallel.
    const [dreamsSnap, summariesSnap] = await Promise.all([
      db.collection('backtestDreams')
        .where('ownerUid', '==', ownerUid)
        .limit(100)
        .get(),
      db.collection('backtestSummaries')
        .where('ownerUid', '==', ownerUid)
        .limit(100)
        .get(),
    ]);

    // Build summary lookup by backtestDreamId.
    const summaryMap = new Map<string, Record<string, unknown>>();
    for (const doc of summariesSnap.docs) {
      const data = doc.data();
      const key = String(data.backtestDreamId || doc.id);
      summaryMap.set(key, { id: doc.id, ...data });
    }

    // Build enriched dream list.
    const dreams = dreamsSnap.docs.map(doc => {
      const data = doc.data();
      const summary = summaryMap.get(doc.id) ?? {};
      return {
        id:               doc.id,
        ownerUid:         data.ownerUid         ?? '',
        dreamDate:        data.dreamDate         ?? '',
        source:           data.source            ?? '',
        confidence:       data.confidence        ?? '',
        status:           data.status            ?? '',
        replaySource:     data.replaySource      || (summary as any).replaySource || '',
        activeWindowStart: data.activeWindowStart ?? '',
        activeWindowEnd:   data.activeWindowEnd   ?? '',
        cash3Numbers:     Array.isArray(data.cash3Numbers)  ? data.cash3Numbers  : [],
        cash4Numbers:     Array.isArray(data.cash4Numbers)  ? data.cash4Numbers  : [],
        parsedTermMappings: Array.isArray(data.parsedTermMappings) ? data.parsedTermMappings : [],
        // Summary fields (from backtestSummaries)
        totalHits:        (summary as any).totalHits         ?? 0,
        straightHits:     (summary as any).straightHits      ?? 0,
        boxedHits:        (summary as any).boxedHits         ?? 0,
        bestState:        (summary as any).bestState         ?? '',
        bestTerm:         (summary as any).bestTerm          ?? '',
        uniqueStatesCount: Array.isArray((summary as any).uniqueStates)
          ? (summary as any).uniqueStates.length
          : 0,
        uniqueStates:     (summary as any).uniqueStates      ?? [],
        hasSummary:       summaryMap.has(doc.id),
      };
    });

    // Sort by dreamDate descending.
    dreams.sort((a, b) => (a.dreamDate < b.dreamDate ? 1 : -1));

    return NextResponse.json({ ok: true, dreams });
  } catch (err) {
    console.error('[list-dreams] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dreams.' },
      { status: 500 }
    );
  }
}
