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
    const dreamerP  = (params.get('dreamerId')     ?? '').trim();
    const btidParam = (params.get('backtestDreamId') ?? '').trim();
    const sourceP   = (params.get('source')           ?? '').trim();
    const limit     = Math.min(Number(params.get('limit') ?? 200), 500);

    // term is now optional — can query by number/state/gameType/backtestDreamId alone

    const normalizedT = normalizeTerm(termRaw);
    const db = getAdminDb();

    // Shared constraints
    const constrain = (q: any) => {
      let out = q;
      if (dreamerP)                                      out = out.where('dreamerId', '==', dreamerP);
      if (stateP)                                        out = out.where('state',     '==', stateP);
      if (gameP === 'cash3' || gameP === 'cash4')        out = out.where('gameType',  '==', gameP);
      if (btidParam)                                     out = out.where('backtestDreamId', '==', btidParam);
      return out;
    };

    const queries: Promise<any>[] = [];

    // Term-targeted queries
    // Sources queried:
    //   backtestHits     — backtest replay evidence
    //   dreamHits        — live hit records (written by dreamRefresh)
    //   personalHitEvents — promoted event-level rows (written by dreamRefresh inline + promote-hits)
    // personalHitEvents is the most reliable source for live hits.
    if (termRaw) {
      queries.push(
        constrain(db.collection('backtestHits').where('ownerUid',      '==', ownerUid).where('termLabel',     '==', termRaw)).limit(limit).get(),
        constrain(db.collection('backtestHits').where('ownerUid',      '==', ownerUid).where('normalizedTerm','==', normalizedT)).limit(limit).get(),
        constrain(db.collection('dreamHits').where('ownerUid',         '==', ownerUid).where('termLabel',     '==', termRaw)).limit(limit).get(),
        constrain(db.collection('personalHitEvents').where('ownerUid', '==', ownerUid).where('termLabel',     '==', termRaw)).limit(limit).get(),
        constrain(db.collection('personalHitEvents').where('ownerUid', '==', ownerUid).where('normalizedTerm','==', normalizedT)).limit(limit).get(),
      );
    } else if (btidParam) {
      queries.push(
        constrain(db.collection('backtestHits').where('ownerUid',      '==', ownerUid)).limit(limit).get(),
        constrain(db.collection('personalHitEvents').where('ownerUid', '==', ownerUid)).limit(limit).get(),
      );
    } else {
      queries.push(
        constrain(db.collection('backtestHits').where('ownerUid',      '==', ownerUid)).limit(limit).get(),
        constrain(db.collection('dreamHits').where('ownerUid',         '==', ownerUid)).limit(limit).get(),
        constrain(db.collection('personalHitEvents').where('ownerUid', '==', ownerUid)).limit(limit).get(),
      );
    }

    const snaps = await Promise.allSettled(queries);

    // Merge by docId, dedup
    const seen = new Set<string>();
    let rows: any[] = [];

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

    // Source filter
    if (sourceP) {
      const want = sourceP.toLowerCase();
      rows = rows.filter(r => {
        const sc = r._sourceClass as string;
        if (want === 'backtest-replay' || want === 'backtest') return sc === 'backtest-replay';
        if (want === 'live-dream-refresh' || want === 'live')  return sc === 'live-dream-refresh';
        return true;
      });
    }

    // Semantic dedup: same draw event may exist in both dreamHits and personalHitEvents
    // Dedup key: number + winningNumber + state + gameType + drawDate + drawTime + hitType
    const semSeen = new Map<string, any>();
    for (const r of rows) {
      const sk = [
        String(r.number      ?? ''),
        String(r.winningNumber ?? ''),
        String(r.state       ?? ''),
        String(r.gameType    ?? ''),
        String(r.drawDate    ?? ''),
        String(r.drawTime    ?? ''),
        String(r.hitType     ?? ''),
        String(r.backtestDreamId ?? r.sourceDreamEntryId ?? r.activeWindowId ?? ''),
      ].join('|');
      // Prefer personalHitEvents rows (richest metadata) over dreamHits
      const existing = semSeen.get(sk);
      if (!existing) {
        semSeen.set(sk, r);
      } else if (r._sourceClass === 'live-dream-refresh' && existing._sourceClass !== 'live-dream-refresh') {
        semSeen.set(sk, r);  // upgrade to richer source
      }
    }
    rows = Array.from(semSeen.values());

    // Sort by drawDate asc, then drawTime
    rows.sort((a, b) => {
      const ak = `${a.drawDate ?? ''}|${a.drawTime ?? ''}`;
      const bk = `${b.drawDate ?? ''}|${b.drawTime ?? ''}`;
      return ak.localeCompare(bk);
    });

    const filtersApplied: string[] = [];
    if (termRaw)    filtersApplied.push(`term=${termRaw}`);
    if (numParam)   filtersApplied.push(`number=${numParam}`);
    if (stateP)     filtersApplied.push(`state=${stateP}`);
    if (gameP)      filtersApplied.push(`gameType=${gameP}`);
    if (dreamerP)   filtersApplied.push(`dreamerId=${dreamerP}`);
    if (btidParam)  filtersApplied.push(`backtestDreamId=${btidParam}`);
    if (sourceP)    filtersApplied.push(`source=${sourceP}`);

    const res = NextResponse.json({
      ok: true,
      events: rows,   // canonical key — also aliased as rows for backward compat
      rows,
      count: rows.length,
      term: termRaw,
      filtersApplied,
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
