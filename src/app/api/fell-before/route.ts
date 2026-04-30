/**
 * GET /api/fell-before?ownerUid=...
 *
 * Quota-protected (v3) — server-side search:
 *   ownerUid    required
 *   dreamerId   optional, Firestore-filtered
 *   term        optional, in-memory filter on termLabel/normalizedTerm
 *   number      optional, in-memory filter on number (contains)
 *   state       optional, Firestore-filtered
 *   gameType    optional, Firestore-filtered (cash3 | cash4)
 *   source      optional, in-memory: backtest-replay | live-dream-refresh | repair | unknown
 *   backtestDreamId optional, in-memory filter
 *   limit       default 250, max 500 (auto-bumped to 500 when term/source filter active)
 *
 * Strategy: narrow with Firestore first (ownerUid, dreamerId, state, gameType),
 * then apply term/number/source in-memory on the capped sample.
 * Max pull is 500, so in-memory filtering is safe and avoids large reads.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function classifySource(data: Record<string, any>): string {
  const src  = String(data.source               ?? '');
  const sdeid = String(data.sourceDreamEntryId ?? '');
  const btid  = String(data.backtestDreamId    ?? '');

  if (src === 'backtest-replay' || src.includes('backtest'))  return 'backtest-replay';
  if (sdeid.startsWith('backtest:') || btid.length > 0)        return 'backtest-replay';
  if (src === 'live-dream-refresh' || src.includes('live'))   return 'live-dream-refresh';
  if (src.includes('repair'))                                   return 'repair';
  return 'unknown';
}

export async function GET(req: NextRequest) {
  try {
    const params      = req.nextUrl.searchParams;
    const ownerUid    = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId   = (params.get('dreamerId')     ?? '').trim();
    const termParam   = (params.get('term')          ?? '').trim().toLowerCase();
    const numberParam = (params.get('number')        ?? '').trim();
    const stateParam  = (params.get('state')         ?? '').trim();
    const gameParam   = (params.get('gameType')      ?? '').trim();
    const sourceParam = (params.get('source')        ?? '').trim();
    const btidParam   = (params.get('backtestDreamId') ?? '').trim();

    // Auto-bump to 500 when in-memory filters are active so they can find deep rows
    const hasInMemoryFilter = !!(termParam || numberParam || sourceParam || btidParam);
    const defaultLimit = hasInMemoryFilter ? 500 : 250;
    const maxRows      = Math.min(Number(params.get('limit') ?? defaultLimit), 500);

    const filtersApplied: string[] = [];
    const db = getAdminDb();

    // ── Firestore filters (indexed) ────────────────────────────────────────
    let query: any = db.collection('personalHitMappings').where('ownerUid', '==', ownerUid);

    if (dreamerId) {
      query = query.where('dreamerId', '==', dreamerId);
      filtersApplied.push(`dreamerId=${dreamerId}`);
    }
    if (stateParam) {
      query = query.where('state', '==', stateParam);
      filtersApplied.push(`state=${stateParam}`);
    }
    if (gameParam === 'cash3' || gameParam === 'cash4') {
      query = query.where('gameType', '==', gameParam);
      filtersApplied.push(`gameType=${gameParam}`);
    }

    const snap = await query.limit(maxRows).get();

    let rows: any[] = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id, ...data,
        createdAt:    data.createdAt?.toDate?.()?.toISOString?.()  ?? data.createdAt  ?? null,
        updatedAt:    data.updatedAt?.toDate?.()?.toISOString?.()  ?? data.updatedAt  ?? null,
        lastHitAt:    data.lastHitAt?.toDate?.()?.toISOString?.()  ?? data.lastHitAt  ?? null,
        _sourceClass: classifySource(data),   // computed label used by page + source filter
      };
    });

    const totalSampled = rows.length;

    // ── In-memory filters ─────────────────────────────────────────────────
    if (termParam) {
      rows = rows.filter(r =>
        String(r.termLabel      ?? '').toLowerCase().includes(termParam) ||
        String(r.normalizedTerm ?? '').toLowerCase().includes(termParam)
      );
      filtersApplied.push(`term=${termParam}`);
    }

    if (numberParam) {
      rows = rows.filter(r =>
        String(r.number ?? r.candidateNumber ?? '').includes(numberParam)
      );
      filtersApplied.push(`number=${numberParam}`);
    }

    if (sourceParam) {
      const want = sourceParam.toLowerCase();
      rows = rows.filter(r => {
        const sc = r._sourceClass as string;
        if (want === 'backtest-replay' || want === 'backtest') return sc === 'backtest-replay';
        if (want === 'live-dream-refresh' || want === 'live')  return sc === 'live-dream-refresh';
        if (want === 'repair')                                  return sc === 'repair';
        if (want === 'unknown')                                 return sc === 'unknown';
        return true;
      });
      filtersApplied.push(`source=${sourceParam}`);
    }

    if (btidParam) {
      rows = rows.filter(r => String(r.backtestDreamId ?? '') === btidParam);
      filtersApplied.push(`backtestDreamId=${btidParam}`);
    }

    const res = NextResponse.json({
      ok: true, rows,
      count: rows.length,
      totalSampled,
      filtersApplied,
      limit: maxRows,
      dreamerId: dreamerId || 'ALL',
    });
    res.headers.set('Cache-Control', filtersApplied.length > 0 ? 'private, max-age=10' : 'private, max-age=30');
    return res;
  } catch (err) {
    console.error('[api/fell-before]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q,
        error: q ? 'Firebase quota exhausted. Try again later.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
