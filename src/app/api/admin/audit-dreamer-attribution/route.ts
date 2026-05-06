/**
 * GET /api/admin/audit-dreamer-attribution?ownerUid=...
 *
 * Scans personalHitEvents, personalHitMappings, backtestHits, dreamHits,
 * and termNumberMappings for dreamerId mismatches vs their source documents.
 *
 * Core misattribution pattern:
 *   - A hit event is stored under dreamerId = "owner-self"
 *   - But its source backtestDream/dreamEntry/activeWindow has a different dreamerId
 *
 * Params:
 *   ownerUid  required
 *   limit     optional, default 200, max 500
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuota(e: unknown) {
  return String(e).includes('RESOURCE_EXHAUSTED') || String(e).includes('quota');
}

async function getDreamerIdFromSource(
  db: any,
  backtestDreamId: string,
  dreamEntryId: string,
  activeWindowId: string
): Promise<string | null> {
  if (backtestDreamId) {
    try {
      const d = await db.collection('backtestDreams').doc(backtestDreamId).get();
      if (d.exists) return String(d.data()?.dreamerId ?? '') || null;
    } catch { /* non-fatal */ }
  }
  const deid = dreamEntryId?.startsWith('backtest:') ? '' : dreamEntryId;
  if (deid) {
    try {
      const d = await db.collection('dreamEntries').doc(deid).get();
      if (d.exists) return String(d.data()?.dreamerId ?? '') || null;
    } catch { /* non-fatal */ }
  }
  if (activeWindowId) {
    try {
      const d = await db.collection('activeDreamWindows').doc(activeWindowId).get();
      if (d.exists) return String(d.data()?.dreamerId ?? '') || null;
    } catch { /* non-fatal */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const params   = req.nextUrl.searchParams;
    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const limit    = Math.min(Number(params.get('limit') ?? 200), 500);

    const db = getAdminDb();

    // ── Load backtestDreams dreamer map ──────────────────────────────────
    const bdSnap = await db.collection('backtestDreams')
      .where('ownerUid', '==', ownerUid).limit(200).get();
    const bdDreamerMap = new Map<string, string>();  // btid → dreamerId
    for (const doc of bdSnap.docs) {
      bdDreamerMap.set(doc.id, String(doc.data().dreamerId ?? ''));
    }

    // ── Scan collections for misattribution ─────────────────────────────
    const results: Record<string, any[]> = {
      misattributedPersonalHitEvents:    [],
      misattributedPersonalHitMappings:  [],
      misattributedBacktestHits:         [],
      misattributedDreamHits:            [],
      dictionaryMissingDreamerId:        [],
    };

    async function scanCollection(
      col: string,
      resultKey: string,
      getSourceId: (d: any) => { btid: string; deid: string; wid: string }
    ) {
      try {
        const snap = await db.collection(col)
          .where('ownerUid', '==', ownerUid).limit(limit).get();

        for (const doc of snap.docs) {
          const d = doc.data();
          const storedDreamer = String(d.dreamerId ?? '');
          const { btid, deid, wid } = getSourceId(d);

          // Only check docs that claim to be owner-self but have a source doc
          const hasSource = btid || (deid && !deid.startsWith('backtest:')) || wid;
          if (!hasSource) continue;
          if (storedDreamer && storedDreamer !== 'owner-self') continue; // already attributed

          // Check if source says something different
          let expectedDreamer: string | null = null;
          if (btid && bdDreamerMap.has(btid)) {
            expectedDreamer = bdDreamerMap.get(btid) ?? null;
          } else {
            expectedDreamer = await getDreamerIdFromSource(db, btid, deid, wid);
          }

          if (expectedDreamer && expectedDreamer !== 'owner-self' && expectedDreamer !== storedDreamer) {
            results[resultKey].push({
              id:              doc.id,
              storedDreamerId: storedDreamer || '(empty)',
              expectedDreamerId: expectedDreamer,
              backtestDreamId: btid,
              dreamEntryId:    deid,
              activeWindowId:  wid,
              termLabel:       String(d.termLabel ?? ''),
              number:          String(d.number    ?? ''),
              state:           String(d.state     ?? ''),
            });
          }
        }
      } catch (e) {
        console.warn(`[audit] ${col}:`, e);
      }
    }

    await Promise.all([
      scanCollection('personalHitEvents', 'misattributedPersonalHitEvents', d => ({
        btid: String(d.backtestDreamId ?? ''),
        deid: String(d.sourceDreamEntryId ?? d.dreamEntryId ?? ''),
        wid:  String(d.activeWindowId ?? ''),
      })),
      scanCollection('personalHitMappings', 'misattributedPersonalHitMappings', d => ({
        btid: String(d.backtestDreamId ?? ''),
        deid: String(d.sourceDreamEntryId ?? d.dreamEntryId ?? ''),
        wid:  String(d.activeWindowId ?? ''),
      })),
      scanCollection('backtestHits', 'misattributedBacktestHits', d => ({
        btid: String(d.backtestDreamId ?? ''),
        deid: '', wid: '',
      })),
      scanCollection('dreamHits', 'misattributedDreamHits', d => ({
        btid: '',
        deid: String(d.dreamEntryId ?? d.sourceDreamEntryId ?? ''),
        wid:  String(d.activeWindowId ?? d.dreamWindowId ?? ''),
      })),
    ]);

    // ── Scan dictionary for missing dreamerId ────────────────────────────
    try {
      const dictSnap = await db.collection('termNumberMappings')
        .where('ownerUid', '==', ownerUid).limit(limit).get();
      for (const doc of dictSnap.docs) {
        const d = doc.data();
        if (!d.dreamerId) {
          results.dictionaryMissingDreamerId.push({
            id: doc.id, termLabel: d.termLabel, number: d.number,
          });
        }
      }
    } catch { /* non-fatal */ }

    const totalIssues = Object.values(results).reduce((s, a) => s + a.length, 0);
    // The repair route marks docs with _suspectedMisattributed: true

    return NextResponse.json({
      ok: true,
      ownerUid,
      totalIssuesFound: totalIssues,
      scanned: { backtestDreams: bdSnap.size },
      // suspectedMisattributed flag is set by the repair route, not the audit route
      ...Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, { count: v.length, examples: v.slice(0, 5) }])
      ),
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Audit failed.' },
      { status: isQuota(err) ? 429 : 500 }
    );
  }
}
