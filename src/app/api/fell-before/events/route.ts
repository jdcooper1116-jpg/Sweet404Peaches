/**
 * GET /api/fell-before/events
 *
 * Returns individual event-level rows for a specific term/number/state group.
 * Fetches from backtestHits (replay evidence) and dreamHits (live evidence).
 *
 * Unlike /api/fell-before which returns personalHitMappings (AGGREGATED per group),
 * this endpoint returns the raw hit documents — one per draw event.
 * This is what backs the "View Evidence" drilldown in As They Fell Before.
 *
 * Called only when user expands a repeat card (quota-safe: not on page load).
 *
 * Params:
 *   ownerUid  required
 *   term      required — normalizedTerm or termLabel filter
 *   number    optional — filter to one number
 *   state     optional — filter to one state
 *   gameType  optional — cash3 | cash4
 *   dreamerId optional
 *   limit     default 200, max 500
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function normalizeTerm(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function classifySource(data: Record<string, any>): string {
  const src   = String(data.source               ?? '');
  const sdeid = String(data.sourceDreamEntryId   ?? '');
  const btid  = String(data.backtestDreamId      ?? '');
  if (src === 'backtest-replay' || src.includes('backtest'))  return 'backtest-replay';
  if (sdeid.startsWith('backtest:') || btid.length > 0)       return 'backtest-replay';
  if (src === 'live-dream-refresh' || src.includes('live'))   return 'live-dream-refresh';
  if (src.includes('repair'))                                  return 'repair';
  return 'unknown';
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function mapHitDoc(doc: any, overrideSource?: string): any {
  const d = doc.data();
  const number = String(d.number ?? d.candidate ?? d.candidateNumber ?? '');
  const gameType = (() => {
    const raw = String(d.gameType ?? d.game_type ?? '');
    if (raw === 'pick3') return 'cash3';
    if (raw === 'pick4') return 'cash4';
    return raw;
  })();
  const hitType = (() => {
    const raw = String(d.hitType ?? d.match_type ?? d.matchType ?? '');
    return raw === 'exact' || raw === 'straight' ? 'straight' : 'boxed';
  })();
  const drawDate   = String(d.drawDate   ?? d.draw_date   ?? '');
  const drawTime   = String(d.drawTime   ?? d.draw_time   ?? '');
  const anchorDate = String(d.anchorDate ?? d.anchor_date ?? d.dreamDate ?? drawDate);
  const daysFromDream = (() => {
    if (typeof d.daysFromDream === 'number') return d.daysFromDream;
    try { return Math.round((new Date(drawDate).getTime() - new Date(anchorDate).getTime()) / 86_400_000); }
    catch { return null; }
  })();

  const src = overrideSource ?? classifySource(d);

  return {
    id:               doc.id,
    termLabel:        String(d.termLabel ?? ''),
    normalizedTerm:   String(d.normalizedTerm ?? normalizeTerm(d.termLabel ?? '')),
    number,
    candidateNumber:  number,
    winningNumber:    String(d.winningNumber ?? d.winning_number ?? ''),
    state:            String(d.state  ?? ''),
    gameType,
    drawDate,
    drawTime,
    hitType,
    matchMode:        hitType,
    dreamerName:      String(d.dreamerName  ?? ''),
    dreamerId:        String(d.dreamerId    ?? 'owner-self'),
    dreamDate:        String(d.dreamDate    ?? d.anchor_date ?? d.anchorDate ?? ''),
    anchorDate,
    daysFromDream,
    sameDay:          daysFromDream === 0,
    _sourceClass:     src,
    source:           src,
    backtestDreamId:  String(d.backtestDreamId  ?? ''),
    sourceDreamEntryId: String(d.sourceDreamEntryId ?? d.dreamEntryId ?? ''),
    activeWindowId:   String(d.activeWindowId ?? d.dreamWindowId ?? ''),
    createdAt:        d.createdAt?.toDate?.()?.toISOString?.() ?? d.createdAt ?? null,
    detectedAt:       d.detectedAt?.toDate?.()?.toISOString?.() ?? d.detectedAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const termRaw   = (params.get('term')      ?? '').trim().toLowerCase();
    const numParam  = (params.get('number')    ?? '').trim();
    const stateP    = (params.get('state')     ?? '').trim();
    const gameP     = (params.get('gameType')  ?? '').trim();
    const dreamerP  = (params.get('dreamerId') ?? '').trim();
    const limit     = Math.min(Number(params.get('limit') ?? 200), 500);

    if (!termRaw) {
      return NextResponse.json({ ok: false, error: 'term param is required.' }, { status: 400 });
    }

    const normalizedT = normalizeTerm(termRaw);
    const db = getAdminDb();

    // Build a targeted Firestore query for one collection, returning all matching docs
    const query = (col: string) => {
      let q: any = db.collection(col)
        .where('ownerUid', '==', ownerUid)
        .where('termLabel', '==', termRaw);
      if (dreamerP) q = q.where('dreamerId', '==', dreamerP);
      if (stateP)   q = q.where('state',     '==', stateP);
      if (gameP === 'cash3' || gameP === 'cash4') q = q.where('gameType', '==', gameP);
      return q.limit(limit);
    };

    // Also try normalizedTerm variant in backtestHits
    const queryNorm = (col: string) => {
      let q: any = db.collection(col)
        .where('ownerUid', '==', ownerUid)
        .where('normalizedTerm', '==', normalizedT);
      if (dreamerP) q = q.where('dreamerId', '==', dreamerP);
      if (stateP)   q = q.where('state',     '==', stateP);
      if (gameP === 'cash3' || gameP === 'cash4') q = q.where('gameType', '==', gameP);
      return q.limit(limit);
    };

    // Run 4 queries in parallel: backtestHits (label + normalized) + dreamHits (label + normalized)
    const snaps = await Promise.allSettled([
      query('backtestHits').get(),
      queryNorm('backtestHits').get(),
      query('dreamHits').get(),
      queryNorm('dreamHits').get(),
    ]);

    // Merge by docId, dedup
    const seen = new Set<string>();
    const rows: any[] = [];

    for (const result of snaps) {
      if (result.status === 'rejected') continue;
      for (const doc of result.value.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const mapped = mapHitDoc(doc);
        // Post-filter by number (since Firestore equality on a renamed field is tricky)
        if (numParam && mapped.number !== numParam) continue;
        rows.push(mapped);
      }
    }

    // Sort by drawDate asc, then drawTime
    rows.sort((a, b) => {
      const ak = `${a.drawDate ?? ''}|${a.drawTime ?? ''}`;
      const bk = `${b.drawDate ?? ''}|${b.drawTime ?? ''}`;
      return ak.localeCompare(bk);
    });

    const res = NextResponse.json({
      ok: true, rows,
      count: rows.length,
      term: termRaw,
    });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;

  } catch (err) {
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q, error: q ? 'Quota exhausted.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
