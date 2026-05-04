/**
 * GET /api/dreams/windows?ownerUid=...
 *
 * Quota-protected:
 *   limit           — default 100, max 250
 *   includeExpired  — default false; filters to activeEnd >= today
 *   dreamerId       — optional filter
 *   dreamEntryId    — optional filter
 *   gameType        — optional cash3/cash4 filter
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function isoDate(value: any): string | null {
  return value?.toDate?.()?.toISOString?.() ?? value ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const includeExpired = params.get('includeExpired') === 'true';
    const dreamerId = (params.get('dreamerId') ?? '').trim();
    const dreamEntryId = (params.get('dreamEntryId') ?? '').trim();
    const gameType = (params.get('gameType') ?? '').trim().toLowerCase();
    const maxRows = Math.min(Math.max(Number(params.get('limit') ?? 100), 1), 250);
    const today = new Date().toISOString().slice(0, 10);

    const db = getAdminDb();

    let query: any = db.collection('activeDreamWindows').where('ownerUid', '==', ownerUid);

    // Apply the most selective filters before limit so one large dream cannot hide others.
    if (dreamerId) {
      query = query.where('dreamerId', '==', dreamerId);
    }

    if (dreamEntryId) {
      query = query.where('dreamEntryId', '==', dreamEntryId);
    }

    if (gameType === 'cash3' || gameType === 'cash4') {
      query = query.where('gameType', '==', gameType);
    }

    // Keep activeEnd as a server-side filter only for the broad/global query.
    // For filtered dreamer/dreamEntry views, filter active/expired in memory to avoid
    // index issues while still respecting the dreamer/dreamEntry filter before limit.
    const shouldUseActiveEndQuery = !includeExpired && !dreamerId && !dreamEntryId && !gameType;
    if (shouldUseActiveEndQuery) {
      query = query.where('activeEnd', '>=', today);
    }

    const snap = await query.limit(maxRows).get();

    let windows = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: isoDate(data.createdAt),
        updatedAt: isoDate(data.updatedAt),
        lastCheckedAt: isoDate(data.lastCheckedAt),
      };
    });

    // For filtered queries, apply active-only filtering after selective query.
    if (!includeExpired && !shouldUseActiveEndQuery) {
      windows = windows.filter((w: any) => String(w.activeEnd ?? '') >= today);
    }

    const dreamerBreakdown: Record<string, number> = {};
    const dreamEntryBreakdown: Record<string, number> = {};
    const gameTypeBreakdown: Record<string, number> = {};

    for (const w of windows as any[]) {
      const dreamerKey = String(w.dreamerName || w.dreamerId || 'unknown');
      const entryKey = String(w.dreamEntryId || 'missing');
      const gameKey = String(w.gameType || 'unknown');

      dreamerBreakdown[dreamerKey] = (dreamerBreakdown[dreamerKey] || 0) + 1;
      dreamEntryBreakdown[entryKey] = (dreamEntryBreakdown[entryKey] || 0) + 1;
      gameTypeBreakdown[gameKey] = (gameTypeBreakdown[gameKey] || 0) + 1;
    }

    const hasMore = snap.docs.length >= maxRows;

    const res = NextResponse.json({
      ok: true,
      windows,
      count: windows.length,
      includeExpired,
      limit: maxRows,
      filters: {
        ownerUid,
        dreamerId: dreamerId || null,
        dreamEntryId: dreamEntryId || null,
        gameType: gameType || null,
      },
      dreamerBreakdown,
      dreamEntryBreakdown,
      gameTypeBreakdown,
      hasMore,
      capped: hasMore,
      capWarning: hasMore
        ? `Returned ${maxRows} rows. More windows may exist; use dreamerId or dreamEntryId filters.`
        : '',
    });

    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  } catch (err) {
    console.error('[api/dreams/windows]', err);
    const q = isQuotaError(err);

    return NextResponse.json(
      {
        ok: false,
        quota: q,
        error: q
          ? 'Firebase quota exhausted. Try again later.'
          : err instanceof Error
            ? err.message
            : 'Failed.',
      },
      { status: q ? 429 : 500 }
    );
  }
}
