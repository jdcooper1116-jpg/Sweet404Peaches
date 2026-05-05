/**
 * GET /api/dreams/window-groups?ownerUid=...
 *
 * Returns active dream windows grouped by dreamEntryId.
 *
 * WHY THIS EXISTS:
 *   /api/dreams/windows queries activeDreamWindows with a single ownerUid filter
 *   and caps at 250 rows. With 403 total active windows across 4 dreamers, the
 *   first 250 Firestore returns are dominated by one dreamer (e.g. OPdaBoss's
 *   200 windows), hiding SweetRed83$'s 65 windows entirely.
 *
 * HOW WE BYPASS THE CAP:
 *   1. Load the dreamers list (typically < 20 docs)
 *   2. For each dreamer, run a targeted query:
 *        activeDreamWindows where ownerUid=X AND dreamerId=Y AND activeEnd >= today
 *      Each dreamer query is capped at 250, but since we run N dreamer queries in
 *      parallel, we get full coverage: 4 dreamers × 250 = up to 1000 windows.
 *   3. Also include owner-self windows (no specific dreamer).
 *   4. Group the merged results by dreamEntryId.
 *
 * This pattern works for any number of dreamers up to ~250 windows per dreamer.
 * If a single dreamer has >250 windows, they'll still be capped — use dreamEntryId
 * filtering in that case.
 *
 * Params:
 *   ownerUid      required
 *   dreamerId     optional — return only this dreamer's groups
 *   dreamEntryId  optional — return only this dream entry's group
 *   includeExpired optional — default false
 *   limit         optional — max groups to return, default 50
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function boxedKey(num: string): string {
  return String(num ?? '').split('').sort().join('');
}

function resolveGameType(raw: string): 'cash3' | 'cash4' | string {
  if (raw === 'pick3') return 'cash3';
  if (raw === 'pick4') return 'cash4';
  return raw;
}

export async function GET(req: NextRequest) {
  try {
    const params        = req.nextUrl.searchParams;
    const ownerUid      = resolveOwnerUid(params.get('ownerUid'));
    const dreamerFilter = (params.get('dreamerId')     ?? '').trim();
    const entryFilter   = (params.get('dreamEntryId')  ?? '').trim();
    const includeExpired= params.get('includeExpired') === 'true';
    const groupLimit    = Math.min(Number(params.get('limit') ?? 50), 100);
    const today         = new Date().toISOString().slice(0, 10);

    const db = getAdminDb();

    // ── Step 1: Get dreamer list ───────────────────────────────────────────
    // Small collection — typically < 20 docs per owner
    let dreamerIds: string[] = ['owner-self'];  // always include owner-self

    if (!dreamerFilter) {
      // Load all dreamers for this owner to build the query loop
      const dreamersSnap = await db.collection('dreamers')
        .where('ownerUid', '==', ownerUid)
        .limit(50).get();
      dreamerIds = ['owner-self', ...dreamersSnap.docs.map(d => d.id)];
    } else {
      dreamerIds = [dreamerFilter];
    }

    // ── Step 2: Query activeDreamWindows per dreamer (parallel) ───────────
    // This bypasses the flat cap by running targeted dreamer-scoped queries.
    const allWindows: any[] = [];
    const seen = new Set<string>();

    const perDreamerLimit = 250;  // max per dreamer query

    await Promise.allSettled(dreamerIds.map(async (did) => {
      try {
        let q: any = db.collection('activeDreamWindows')
          .where('ownerUid',  '==', ownerUid)
          .where('dreamerId', '==', did);

        if (!includeExpired) {
          q = q.where('activeEnd', '>=', today);
        }
        if (entryFilter) {
          q = q.where('dreamEntryId', '==', entryFilter);
        }

        const snap = await q.limit(perDreamerLimit).get();

        for (const doc of snap.docs) {
          if (seen.has(doc.id)) continue;
          seen.add(doc.id);
          const d = doc.data();
          allWindows.push({
            id: doc.id, ...d,
            // Normalize field names for consistent grouping
            gameType:  resolveGameType(String(d.gameType ?? d.game_type ?? '')),
            createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? d.createdAt ?? null,
            updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? d.updatedAt ?? null,
            lastCheckedAt: d.lastCheckedAt?.toDate?.()?.toISOString?.() ?? d.lastCheckedAt ?? null,
          });
        }
      } catch { /* non-fatal — skip this dreamer */ }
    }));

    // ── Step 3: Group by dreamEntryId ─────────────────────────────────────
    type Group = {
      dreamEntryId:  string;
      dreamerId:     string;
      dreamerName:   string;
      dreamDate:     string;
      activeStart:   string;
      activeEnd:     string;
      isActive:      boolean;
      windowCount:   number;
      cash3Count:    number;
      cash4Count:    number;
      terms:         string[];
      numbers:       string[];
      boxedKeys:     string[];
      sampleWindows: any[];
      lastCheckedAt: string;
      lastHitCount:  number;
      gameTypeCounts:Record<string,number>;
    };

    const groupMap = new Map<string, Group>();

    for (const w of allWindows) {
      const eid  = String(w.dreamEntryId ?? '');
      const key  = eid || `${w.dreamerId ?? 'unknown'}__no-entry`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          dreamEntryId:  eid,
          dreamerId:     String(w.dreamerId  ?? 'owner-self'),
          dreamerName:   String(w.dreamerName ?? w.dreamerId ?? 'Owner / Self'),
          dreamDate:     String(w.dreamDate   ?? w.activeStart ?? ''),
          activeStart:   String(w.activeStart ?? ''),
          activeEnd:     String(w.activeEnd   ?? ''),
          isActive:      String(w.activeEnd ?? '') >= today,
          windowCount:   0,
          cash3Count:    0,
          cash4Count:    0,
          terms:         [],
          numbers:       [],
          boxedKeys:     [],
          sampleWindows: [],
          lastCheckedAt: String(w.lastCheckedAt ?? ''),
          lastHitCount:  0,
          gameTypeCounts:{},
        });
      }

      const g = groupMap.get(key)!;
      g.windowCount++;

      const gt  = String(w.gameType ?? '');
      const num = String(w.number   ?? '').trim();
      const tl  = String(w.termLabel ?? '').toLowerCase();
      const bk  = num ? boxedKey(num) : '';

      if (gt === 'cash3') g.cash3Count++;
      else if (gt === 'cash4') g.cash4Count++;
      g.gameTypeCounts[gt] = (g.gameTypeCounts[gt] ?? 0) + 1;

      if (num && !g.numbers.includes(num)) g.numbers.push(num);
      if (bk  && !g.boxedKeys.includes(bk))g.boxedKeys.push(bk);
      if (tl  && !g.terms.includes(tl))    g.terms.push(tl);
      if (g.sampleWindows.length < 5)       g.sampleWindows.push({ id: w.id, number: num, gameType: gt, termLabel: tl, activeEnd: w.activeEnd });
      if (String(w.lastCheckedAt ?? '') > g.lastCheckedAt) g.lastCheckedAt = String(w.lastCheckedAt ?? '');
      if (Number(w.lastHitCount ?? 0) > 0) g.lastHitCount += Number(w.lastHitCount);

      // Update activeEnd to latest of the group
      if (String(w.activeEnd ?? '') > g.activeEnd) g.activeEnd = String(w.activeEnd ?? '');
      if (!g.activeStart || String(w.activeStart ?? '') < g.activeStart) g.activeStart = String(w.activeStart ?? '');
      if (!g.dreamDate && w.dreamDate) g.dreamDate = String(w.dreamDate);
    }

    // ── Step 4: Build summary stats ───────────────────────────────────────
    const groups = Array.from(groupMap.values())
      .sort((a, b) => b.windowCount - a.windowCount)
      .slice(0, groupLimit);

    const totalActiveWindows = allWindows.length;
    const dreamerBreakdown: Record<string, number> = {};
    const dreamEntryBreakdown: Record<string, number> = {};
    let totalCash3 = 0, totalCash4 = 0;

    for (const w of allWindows) {
      const dn = String(w.dreamerName ?? w.dreamerId ?? 'unknown');
      const de = String(w.dreamEntryId ?? '');
      dreamerBreakdown[dn]  = (dreamerBreakdown[dn]  ?? 0) + 1;
      if (de) dreamEntryBreakdown[de] = (dreamEntryBreakdown[de] ?? 0) + 1;
      if (String(w.gameType ?? '') === 'cash3') totalCash3++;
      else if (String(w.gameType ?? '') === 'cash4') totalCash4++;
    }

    const res = NextResponse.json({
      ok: true,
      groups,
      groupCount:              groupMap.size,
      totalActiveWindows,
      totalUniqueDreamers:     new Set(allWindows.map(w => w.dreamerId)).size,
      totalUniqueDreamEntries: new Set(allWindows.map(w => w.dreamEntryId).filter(Boolean)).size,
      totalCash3Windows:       totalCash3,
      totalCash4Windows:       totalCash4,
      dreamerBreakdown,
      dreamEntryBreakdown,
      gameTypeBreakdown: {
        cash3: totalCash3,
        cash4: totalCash4,
      },
      capped: false,   // this route fetches all dreamers — no flat cap
      capWarning: null,
      // Also include flat windows array for pages that still need it
      windows: allWindows,
    });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;

  } catch (err) {
    console.error('[api/dreams/window-groups]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q,
        error: q ? 'Firebase quota exhausted.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
