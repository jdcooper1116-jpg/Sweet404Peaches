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
import { getDreamDbProvider } from '@/lib/storage/provider';
import { postgresHitEvidenceStorage } from '@/lib/storage/postgres/hitEvidence';

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

    // ── Postgres branch ────────────────────────────────────────────────────────
    // In Postgres mode, live refresh writes to personal_hit_events (not dream_hits).
    // Backtest replay also writes to personal_hit_events via persistBacktestReplayEvidence.
    // So both live and backtest evidence live in personal_hit_events in Postgres mode.
    if (getDreamDbProvider() === 'postgres') {
      // Load events — use the most-specific storage function available
      let pgEvents: any[];
      if (dreamerId) {
        pgEvents = await postgresHitEvidenceStorage.listHitEventsForDreamer(
          ownerUid, dreamerId, { limit: maxRows }
        );
      } else {
        // No dreamerId — read all events for owner, then filter in-memory
        // (no broadcastAll function exists; listHitEventsForDreamer requires a dreamerId)
        // Use prisma directly for the broad case
        const { prisma } = await import('@/lib/db/postgres');
        const where: Record<string, any> = {
          ownerUid,
          isDeprecated: false,
          isShadowedByCorrectedMapping: false,
        };
        if (dreamEntryId)  where.sourceDreamEntryId = dreamEntryId;
        if (activeWindowId) where.activeWindowId = activeWindowId;
        if (gameType === 'cash3' || gameType === 'cash4') where.gameType = gameType;
        if (state)          where.state = state;
        const rows = await prisma.personalHitEvent.findMany({
          where,
          orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }, { createdAt: 'desc' }],
          take: maxRows,
        });
        // mapHitEvent is internal to hitEvidence.ts, so re-map here
        pgEvents = rows.map((row: any) => ({
          id:                row.id,
          ownerUid:          row.ownerUid,
          dreamerId:         row.dreamerId,
          dreamerName:       row.dreamerName ?? '',
          termLabel:         row.termLabel,
          normalizedTerm:    row.normalizedTerm,
          // Both camelCase and snake_case aliases so Hits page and other consumers work
          number:            row.numberText,      // string — leading zeros preserved
          candidate:         row.numberText,
          candidateNumber:   row.numberText,
          winningNumber:     row.winningNumber ?? row.normalizedResult ?? '',
          winning_number:    row.winningNumber ?? row.normalizedResult ?? '',
          normalizedResult:  row.normalizedResult ?? '',
          gameType:          row.gameType,
          game_type:         row.gameType,
          state:             row.state,
          drawDate:          row.drawDate,
          draw_date:         row.drawDate,
          drawTime:          row.drawTime,
          draw_time:         row.drawTime,
          hitType:           row.hitType,
          match_type:        row.hitType === 'exact' ? 'exact' : 'box',
          matchMode:         row.hitType,
          source:            row.source ?? 'live-dream-refresh',
          source_name:       row.source ?? 'live-dream-refresh',
          sourceClass:       row.source ?? 'live-dream-refresh',
          is_verified:       true,
          dreamEntryId:      row.sourceDreamEntryId ?? '',
          sourceDreamEntryId:row.sourceDreamEntryId ?? '',
          activeWindowId:    row.activeWindowId ?? '',
          backtestDreamId:   row.backtestDreamId ?? '',
          anchor_date:       '',   // not stored in personal_hit_events
          daysFromDream:     row.daysFromDream ?? null,
          sameDay:           row.sameDay ?? null,
          createdAt:         row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
          updatedAt:         row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ''),
        }));
      }

      // Apply remaining in-memory filters for the dreamer branch
      let hits = pgEvents as any[];
      if (dreamerId) {
        // Already filtered by dreamerId in the query; apply secondary filters
        if (dreamEntryId)   hits = hits.filter(h => String(h.sourceDreamEntryId ?? '') === dreamEntryId);
        if (activeWindowId) hits = hits.filter(h => String(h.activeWindowId ?? '') === activeWindowId);
        if (gameType === 'cash3' || gameType === 'cash4') hits = hits.filter(h => h.gameType === gameType);
        if (state)          hits = hits.filter(h => String(h.state ?? '') === state);
        // Map to full shape (listHitEventsForDreamer already returns mapped rows)
        hits = hits.map((h: any) => ({
          ...h,
          // Ensure snake_case aliases exist (listHitEventsForDreamer already has camelCase)
          candidate:      h.candidate         ?? h.number ?? h.numberText ?? '',
          winning_number: h.winning_number    ?? h.winningNumber ?? '',
          game_type:      h.game_type         ?? h.gameType ?? '',
          draw_date:      h.draw_date         ?? h.drawDate ?? '',
          draw_time:      h.draw_time         ?? h.drawTime ?? '',
          match_type:     h.match_type        ?? (h.hitType === 'exact' ? 'exact' : 'box'),
          source_name:    h.source_name       ?? h.source ?? '',
          is_verified:    h.is_verified       ?? true,
          anchor_date:    h.anchor_date       ?? '',
        }));
      }
      if (normalizedTerm) {
        hits = hits.filter(h =>
          normTerm(String(h.normalizedTerm ?? '')) === normalizedTerm ||
          normTerm(String(h.termLabel      ?? '')) === normalizedTerm
        );
      }
      hits.sort((a: any, b: any) => {
        const ak = String(a.drawDate ?? a.draw_date ?? '') + ' ' + String(a.drawTime ?? a.draw_time ?? '');
        const bk = String(b.drawDate ?? b.draw_date ?? '') + ' ' + String(b.drawTime ?? b.draw_time ?? '');
        return ak < bk ? 1 : -1;
      });

      const dreamerBreakdown: Record<string, number> = {};
      const stateBreakdown: Record<string, number> = {};
      const gameTypeBreakdown: Record<string, number> = {};
      const dreamEntryBreakdown: Record<string, number> = {};
      for (const h of hits) {
        const dk = String(h.dreamerName || h.dreamerId || 'unknown');
        const sk = String(h.state || 'unknown');
        const gk = String(h.gameType || h.game_type || 'unknown');
        const ek = String(h.sourceDreamEntryId || h.dreamEntryId || 'missing');
        dreamerBreakdown[dk] = (dreamerBreakdown[dk] || 0) + 1;
        stateBreakdown[sk]   = (stateBreakdown[sk]   || 0) + 1;
        gameTypeBreakdown[gk]= (gameTypeBreakdown[gk] || 0) + 1;
        dreamEntryBreakdown[ek]=(dreamEntryBreakdown[ek]||0)+1;
      }

      const res = NextResponse.json({
        ok: true,
        hits,
        rows: hits,
        count: hits.length,
        limit: maxRows,
        provider: 'postgres',
        filtersApplied: [
          dreamerId    ? `dreamerId=${dreamerId}`         : null,
          dreamEntryId ? `dreamEntryId=${dreamEntryId}`   : null,
          state        ? `state=${state}`                 : null,
          gameType     ? `gameType=${gameType}`           : null,
          normalizedTerm?`term=${normalizedTerm}`         : null,
        ].filter(Boolean),
        filters: { ownerUid, dreamerId: dreamerId || null, dreamEntryId: dreamEntryId || null,
                   activeWindowId: activeWindowId || null, gameType: gameType || null,
                   state: state || null, term: termRaw || null },
        dreamerBreakdown, stateBreakdown, gameTypeBreakdown, dreamEntryBreakdown,
        hasMore: hits.length >= maxRows,
        capped:  hits.length >= maxRows,
      });
      res.headers.set('Cache-Control', 'private, max-age=30');
      return res;
    }

    // ── Firebase branch (unchanged) ─────────────────────────────────────────
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
