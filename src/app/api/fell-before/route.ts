/**
 * GET /api/fell-before?ownerUid=...
 *
 * v4 — Targeted Lookup
 *
 * Root-cause fix: previous version fetched a capped sample for ownerUid then
 * filtered in memory. If personalHitMappings has >500 rows and the searched
 * term rows sit beyond position 500, the filter found nothing.
 *
 * Fix — when term is provided:
 *   Run TWO targeted Firestore equality queries in parallel:
 *     A. where normalizedTerm == normalizedTerm
 *     B. where termLabel     == rawTerm
 *   Merge by docId. Finds ALL matching rows regardless of collection size.
 *
 * Browse mode (no term): ownerUid-scoped sample, 250 default / 500 max.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
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

function mapDoc(doc: any): any {
  const data = doc.data();
  return {
    id: doc.id, ...data,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? null,
    lastHitAt: data.lastHitAt?.toDate?.()?.toISOString?.() ?? data.lastHitAt ?? null,
    _sourceClass: classifySource(data),
  };
}

export async function GET(req: NextRequest) {
  try {
    const params      = req.nextUrl.searchParams;
    const includeDeprecated = params.get('includeDeprecated') === 'true';
    const ownerUid    = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId   = (params.get('dreamerId')     ?? '').trim();
    const termRaw     = (params.get('term')          ?? '').trim().toLowerCase();
    const numberParam = (params.get('number')        ?? '').trim();
    const stateParam  = (params.get('state')         ?? '').trim();
    const gameParam   = (params.get('gameType')      ?? '').trim();
    const sourceParam = (params.get('source')        ?? '').trim();
    const btidParam   = (params.get('backtestDreamId') ?? '').trim();
    const browseLimit = Math.min(Number(params.get('limit') ?? 250), 500);

    const db  = getAdminDb();
    const col = db.collection('personalHitMappings');
    const filtersApplied: string[] = [];

    let rows: any[];
    let lookupMode: string;
    let totalSampled: number;

    // Helper: add shared Firestore constraints
    const constrain = (q: any) => {
      let out = q;
      if (dreamerId)                                         out = out.where('dreamerId', '==', dreamerId);
      if (stateParam)                                        out = out.where('state',     '==', stateParam);
      if (gameParam === 'cash3' || gameParam === 'cash4')    out = out.where('gameType',  '==', gameParam);
      return out;
    };

    // ── TARGETED TERM LOOKUP ─────────────────────────────────────────────────
    if (termRaw) {
      const normalizedT = normalizeTerm(termRaw);
      lookupMode = 'targeted-term';

      const qA = constrain(col.where('ownerUid', '==', ownerUid).where('normalizedTerm', '==', normalizedT));
      const qB = constrain(col.where('ownerUid', '==', ownerUid).where('termLabel',      '==', termRaw));

      let snapA: any, snapB: any;
      try {
        [snapA, snapB] = await Promise.all([qA.limit(500).get(), qB.limit(500).get()]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
          return NextResponse.json({
            ok: false, lookupMode, filtersApplied: [`term=${termRaw}`],
            error: `Firestore index required for term lookup. Create it in Firebase Console then retry. Detail: ${msg}`,
          }, { status: 412 });
        }
        throw e;
      }

      const seen = new Set<string>();
      const merged: any[] = [];
      for (const snap of [snapA, snapB]) {
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) { seen.add(doc.id); merged.push(mapDoc(doc)); }
        }
      }
      rows = merged;
      totalSampled = rows.length;
      filtersApplied.push(`term=${termRaw}`);

    // ── TARGETED NUMBER LOOKUP ────────────────────────────────────────────────
    } else if (numberParam && /^\d+$/.test(numberParam)) {
      lookupMode = 'targeted-number';
      const q = constrain(col.where('ownerUid', '==', ownerUid).where('number', '==', numberParam));
      const snap = await q.limit(500).get();
      rows = snap.docs.map(mapDoc);
      totalSampled = rows.length;
      filtersApplied.push(`number=${numberParam}`);

    // ── BROWSE / SAMPLE MODE ──────────────────────────────────────────────────
    } else {
      lookupMode = 'browse-sample';
      const q = constrain(col.where('ownerUid', '==', ownerUid));
      const snap = await q.limit(browseLimit).get();
      rows = snap.docs.map(mapDoc);
      totalSampled = rows.length;
      if (numberParam) {
        rows = rows.filter(r => String(r.number ?? r.candidateNumber ?? '').includes(numberParam));
        filtersApplied.push(`number=${numberParam}`);
      }
    }

    // ── Common in-memory filters ──────────────────────────────────────────────
    if (sourceParam) {
      const want = sourceParam.toLowerCase();
      rows = rows.filter(r => {
        const sc = r._sourceClass as string;
        if (want === 'backtest-replay' || want === 'backtest') return sc === 'backtest-replay';
        if (want === 'live-dream-refresh' || want === 'live')  return sc === 'live-dream-refresh';
        if (want === 'repair')   return sc === 'repair';
        if (want === 'unknown')  return sc === 'unknown';
        return true;
      });
      filtersApplied.push(`source=${sourceParam}`);
    }
    if (btidParam) {
      rows = rows.filter(r => String(r.backtestDreamId ?? '') === btidParam);
      filtersApplied.push(`backtestDreamId=${btidParam}`);
    }
    if (dreamerId)  filtersApplied.push(`dreamerId=${dreamerId}`);
    if (stateParam) filtersApplied.push(`state=${stateParam}`);
    if (gameParam)  filtersApplied.push(`gameType=${gameParam}`);

    // Final dedup
    const deduped = new Map<string, any>();
    for (const r of rows) deduped.set(r.id, r);
    rows = Array.from(deduped.values());

    // Deprecated duplicate memory rows are preserved for audit history,
    // but excluded from active prediction/scoring by default.
    const visibleRows = includeDeprecated
      ? rows
      : rows.filter((r: any) => !r?._deprecated);

    const res = NextResponse.json({
      ok: true, rows: visibleRows,
      count: visibleRows.length, totalSampled, lookupMode,
      filtersApplied: [...new Set(filtersApplied)],
      limit: browseLimit, dreamerId: dreamerId || 'ALL',
    });
    res.headers.set('Cache-Control', lookupMode === 'browse-sample' ? 'private, max-age=30' : 'private, max-age=5');
    return res;

  } catch (err) {
    console.error('[api/fell-before]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q, error: q ? 'Firebase quota exhausted.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
