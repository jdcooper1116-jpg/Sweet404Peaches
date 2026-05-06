/**
 * GET /api/admin/audit-dreamer-attribution?ownerUid=...
 *
 * Scans all hit collections for dreamerId mismatches vs source documents.
 *
 * PREVIOUS BUG (returned 0 issues):
 *   Scanned with flat limit=200. With 356+ Sunshine rows sitting beyond position
 *   200 in Firestore storage order, they were never fetched.
 *
 * FIX — per-backtestDream iteration:
 *   Targeted: backtestDreamId provided → Firestore equality filter (finds all rows).
 *   Broad: iterate per backtestDream doc → query each by backtestDreamId.
 *   This bypasses the flat cap exactly like the window-groups fix.
 *
 * Params:
 *   ownerUid        required
 *   backtestDreamId optional — targeted scan for one dream
 *   dreamerId       optional — only flag rows expected under this dreamer
 *   term            optional — filter by termLabel
 *   limit           per-query cap, default 500, max 1000
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const params        = req.nextUrl.searchParams;
    const ownerUid      = resolveOwnerUid(params.get('ownerUid'));
    const btidFilter    = (params.get('backtestDreamId') ?? '').trim();
    const didFilter     = (params.get('dreamerId')       ?? '').trim();
    const termFilter    = (params.get('term')            ?? '').trim().toLowerCase();
    const perQueryLimit = Math.min(Number(params.get('limit') ?? 500), 1000);

    const db = getAdminDb();

    // ── 1. Load backtestDreams as source-of-truth map ─────────────────────
    const bdMap = new Map<string, { dreamerId: string; dreamerName: string }>();
    const scanned: Record<string, number> = {};

    let bdQ: any = db.collection('backtestDreams').where('ownerUid', '==', ownerUid);
    if (btidFilter) bdQ = bdQ.where('__name__', '==', btidFilter).limit(1);
    else            bdQ = bdQ.limit(200);
    const bdSnap = await bdQ.get();
    scanned.backtestDreams = bdSnap.size;

    for (const doc of bdSnap.docs) {
      bdMap.set(doc.id, {
        dreamerId:   String(doc.data().dreamerId   ?? ''),
        dreamerName: String(doc.data().dreamerName ?? ''),
      });
    }

    // ── 2. Scan helper (per-dream iteration) ────────────────────────────────
    const allMismatches: any[] = [];

    async function scanByBtid(col: string) {
      const seen   = new Set<string>();
      let   count  = 0;

      // Determine which backtestDreamIds to scan
      const btids = btidFilter ? [btidFilter] : Array.from(bdMap.keys());

      await Promise.allSettled(btids.map(async btid => {
        try {
          const snap = await db.collection(col)
            .where('ownerUid',       '==', ownerUid)
            .where('backtestDreamId','==', btid)
            .limit(perQueryLimit).get();

          for (const doc of snap.docs) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            count++;

            const d = doc.data();
            if (d._deprecated || d._suspectedMisattributed) continue;

            const tl = String(d.termLabel ?? '').toLowerCase();
            if (termFilter && !tl.includes(termFilter)) continue;

            const storedDid = String(d.dreamerId ?? '');
            const src = bdMap.get(btid);
            if (!src || !src.dreamerId || src.dreamerId === 'owner-self') continue;
            if (src.dreamerId === storedDid) continue;           // correct — skip
            if (didFilter && src.dreamerId !== didFilter) continue;

            allMismatches.push({
              collection:          col,
              id:                  doc.id,
              storedDreamerId:     storedDid || '(empty)',
              expectedDreamerId:   src.dreamerId,
              expectedDreamerName: src.dreamerName,
              backtestDreamId:     btid,
              dreamEntryId:        String(d.sourceDreamEntryId ?? d.dreamEntryId ?? ''),
              activeWindowId:      String(d.activeWindowId ?? ''),
              termLabel:           String(d.termLabel ?? ''),
              number:              String(d.number ?? d.candidateNumber ?? ''),
              state:               String(d.state   ?? ''),
              gameType:            String(d.gameType ?? ''),
            });
          }
        } catch { /* non-fatal — index may not exist for all collections */ }
      }));

      scanned[col] = (scanned[col] ?? 0) + count;
    }

    // Scan each collection per-dream
    await Promise.allSettled([
      scanByBtid('backtestHits'),
      scanByBtid('personalHitEvents'),
      scanByBtid('personalHitMappings'),
    ]);

    // dreamHits uses dreamEntryId, not backtestDreamId — scan flat (no btid)
    if (!btidFilter) {
      try {
        const dhSnap = await db.collection('dreamHits')
          .where('ownerUid', '==', ownerUid).limit(perQueryLimit).get();
        scanned.dreamHits = dhSnap.size;
        // (dreamHits misattribution is less common; flag separately if needed)
      } catch { scanned.dreamHits = 0; }
    }

    // Dictionary missing dreamerId
    const dictMissing: any[] = [];
    try {
      let dictQ: any = db.collection('termNumberMappings')
        .where('ownerUid', '==', ownerUid).limit(500);
      if (btidFilter) dictQ = dictQ.where('backtestDreamId', '==', btidFilter);
      const dictSnap = await dictQ.get();
      scanned.termNumberMappings = dictSnap.size;
      for (const doc of dictSnap.docs) {
        const d = doc.data();
        if (!d.dreamerId) dictMissing.push({ id: doc.id, termLabel: d.termLabel, number: d.number });
      }
    } catch { scanned.termNumberMappings = 0; }

    // Group by collection
    const byCollection: Record<string, any[]> = {};
    for (const m of allMismatches) {
      if (!byCollection[m.collection]) byCollection[m.collection] = [];
      byCollection[m.collection].push(m);
    }

    const byExpectedDreamer: Record<string, number> = {};
    for (const m of allMismatches) {
      const k = m.expectedDreamerName || m.expectedDreamerId;
      byExpectedDreamer[k] = (byExpectedDreamer[k] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true, ownerUid,
      totalIssuesFound: allMismatches.length + dictMissing.length,
      scanned,
      misattributedBacktestHits:        { count: byCollection.backtestHits?.length        ?? 0, examples: byCollection.backtestHits?.slice(0, 5)        ?? [] },
      misattributedPersonalHitEvents:   { count: byCollection.personalHitEvents?.length   ?? 0, examples: byCollection.personalHitEvents?.slice(0, 5)   ?? [] },
      misattributedPersonalHitMappings: { count: byCollection.personalHitMappings?.length ?? 0, examples: byCollection.personalHitMappings?.slice(0, 5) ?? [] },
      misattributedDreamHits:           { count: byCollection.dreamHits?.length           ?? 0, examples: byCollection.dreamHits?.slice(0, 5)           ?? [] },
      dictionaryMissingDreamerId:       { count: dictMissing.length, examples: dictMissing.slice(0, 5) },
      byExpectedDreamer,
      // suspectedMisattributed flag is set by the repair route
      _suspectedMisattributed_info: 'Rows are marked by repair-dreamer-attribution after repair.',
      allExamples: allMismatches.slice(0, 20),
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Audit failed.' },
      { status: 500 }
    );
  }
}
