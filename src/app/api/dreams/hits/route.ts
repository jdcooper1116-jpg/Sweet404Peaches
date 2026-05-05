/**
 * GET /api/dreams/hits?ownerUid=...
 *
 * Quota-protected:
 *   limit         — default 100, max 250
 *   dreamerId     — optional filter
 *   dreamEntryId  — optional filter
 *   activeWindowId — optional filter
 *   gameType      — optional cash3/cash4 filter
 *   state         — optional state filter
 *   term          — optional term/normalizedTerm filter
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function normTerm(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function isoDate(value: any): string | null {
  return value?.toDate?.()?.toISOString?.() ?? value ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = (params.get('dreamerId') ?? '').trim();
    const dreamEntryId = (params.get('dreamEntryId') ?? '').trim();
    const activeWindowId = (params.get('activeWindowId') ?? '').trim();
    const gameType = (params.get('gameType') ?? '').trim().toLowerCase();
    const state = (params.get('state') ?? '').trim().toUpperCase();
    const termRaw = (params.get('term') ?? params.get('normalizedTerm') ?? '').trim();
    const normalizedTerm = termRaw ? normTerm(termRaw) : '';
    const maxRows = Math.min(Math.max(Number(params.get('limit') ?? 100), 1), 250);

    const db = getAdminDb();

    let query: any = db.collection('dreamHits').where('ownerUid', '==', ownerUid);

    if (dreamerId) {
      query = query.where('dreamerId', '==', dreamerId);
    }

    if (dreamEntryId) {
      query = query.where('dreamEntryId', '==', dreamEntryId);
    }

    if (activeWindowId) {
      query = query.where('activeWindowId', '==', activeWindowId);
    }

    if (gameType === 'cash3' || gameType === 'cash4') {
      query = query.where('gameType', '==', gameType);
    }

    if (state) {
      query = query.where('state', '==', state);
    }

    const snap = await query.limit(maxRows).get();

    let hits = snap.docs.map((doc: any) => {
      const data = doc.data();

      const number = data.number ?? data.candidate ?? data.candidateNumber ?? data.playedNumber ?? null;
      const winningNumber = data.winningNumber ?? data.winning_number ?? data.result ?? data.drawResult ?? null;
      const gameTypeNorm = data.gameType ?? data.game_type ?? data.lotteryGame ?? null;
      const hitType = data.hitType ?? data.match_type ?? data.matchType ?? data.matchMode ?? null;
      const drawDate = data.drawDate ?? data.draw_date ?? data.date ?? null;
      const drawTime = data.drawTime ?? data.draw_time ?? data.time ?? data.drawSlot ?? null;
      const dreamerName = data.dreamerName ?? null;
      const hitDreamerId = data.dreamerId ?? 'owner-self';
      const termLabel = data.termLabel ?? null;
      const hitNormalizedTerm = data.normalizedTerm ?? normTerm(termLabel ?? '');
      const hitState = data.state ?? null;

      return {
        id: doc.id,
        ...data,
        number,
        candidateNumber: data.candidateNumber ?? data.candidate ?? number,
        winningNumber,
        gameType: gameTypeNorm,
        hitType,
        matchMode: data.matchMode ?? hitType,
        drawDate,
        drawTime,
        dreamerName,
        dreamerId: hitDreamerId,
        termLabel,
        normalizedTerm: hitNormalizedTerm,
        state: hitState,
        detectedAt: isoDate(data.detectedAt),
        createdAt: isoDate(data.createdAt),
        updatedAt: isoDate(data.updatedAt),
      };
    });

    if (normalizedTerm) {
      hits = hits.filter((h: any) =>
        String(h.normalizedTerm ?? '').toLowerCase() === normalizedTerm ||
        normTerm(String(h.termLabel ?? '')) === normalizedTerm
      );
    }

    hits.sort((a: any, b: any) => {
      const ak = String(a.drawDate ?? '') + ' ' + String(a.drawTime ?? '');
      const bk = String(b.drawDate ?? '') + ' ' + String(b.drawTime ?? '');
      return ak < bk ? 1 : -1;
    });

    const dreamerBreakdown: Record<string, number> = {};
    const dreamEntryBreakdown: Record<string, number> = {};
    const gameTypeBreakdown: Record<string, number> = {};
    const stateBreakdown: Record<string, number> = {};

    for (const h of hits as any[]) {
      const dreamerKey = String(h.dreamerName || h.dreamerId || 'unknown');
      const entryKey = String(h.dreamEntryId || h.sourceDreamEntryId || 'missing');
      const gameKey = String(h.gameType || 'unknown');
      const stateKey = String(h.state || 'unknown');

      dreamerBreakdown[dreamerKey] = (dreamerBreakdown[dreamerKey] || 0) + 1;
      dreamEntryBreakdown[entryKey] = (dreamEntryBreakdown[entryKey] || 0) + 1;
      gameTypeBreakdown[gameKey] = (gameTypeBreakdown[gameKey] || 0) + 1;
      stateBreakdown[stateKey] = (stateBreakdown[stateKey] || 0) + 1;
    }

    const hasMore = snap.docs.length >= maxRows;

    const res = NextResponse.json({
      ok: true,
      hits,
      rows: hits,
      count: hits.length,
      limit: maxRows,
      filters: {
        ownerUid,
        dreamerId: dreamerId || null,
        dreamEntryId: dreamEntryId || null,
        activeWindowId: activeWindowId || null,
        gameType: gameType || null,
        state: state || null,
        term: termRaw || null,
      },
      dreamerBreakdown,
      dreamEntryBreakdown,
      gameTypeBreakdown,
      stateBreakdown,
      hasMore,
      capped: hasMore,
      capWarning: hasMore
        ? `Returned ${maxRows} rows. More hits may exist; use dreamerId, dreamEntryId, state, or gameType filters.`
        : '',
    });

    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  } catch (err) {
    console.error('[api/dreams/hits]', err);
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
