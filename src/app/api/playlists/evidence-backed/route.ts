/**
 * GET /api/playlists/evidence-backed?ownerUid=...
 *
 * Builds State Playlist candidates by joining:
 *   1. Current active dream terms (from activeDreamWindows)
 *   2. Historical fell-before evidence (from personalHitMappings, targeted per term)
 *
 * WHY A SEPARATE ROUTE:
 *   The playlists page was fetching /api/fell-before with a broad limit=250, which
 *   returns fell-before rows in Firestore's internal order — not by active term.
 *   Active terms like "sister" would often have their evidence rows beyond position 250,
 *   so the playlist built from that capped sample had no evidence for most terms.
 *   Numbers then fell through into the watchlist with zero verified evidence.
 *
 * THIS ROUTE:
 *   - Loads unique normalized terms from activeDreamWindows (small set, < 100 terms)
 *   - For each unique term, runs a targeted Firestore equality query on personalHitMappings
 *     (same pattern as /api/fell-before with term= param: queries normalizedTerm + termLabel)
 *   - Groups evidence by (term, number, gameType, state)
 *   - Applies strength tiers
 *   - Returns only evidence-backed candidates by default
 *
 * Params:
 *   ownerUid         required
 *   dreamerId        optional — filter to one dreamer's windows
 *   state            optional — filter candidates to one state
 *   gameType         optional — cash3 | cash4
 *   minEvidence      optional — default 1 (exclude zero-evidence numbers)
 *   includeNoEvidence optional — include active numbers with no evidence (default false)
 *   limit            optional — max unique terms to look up, default 30, max 50
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';
import { normalizeTerm, boxedKey as bk } from '@/lib/intelligence/hitClassification';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

function resolveGameType(raw: string): string {
  if (raw === 'pick3') return 'cash3';
  if (raw === 'pick4') return 'cash4';
  return raw;
}

function strengthTier(
  eventCount:   number,
  uniqueDates:  number,
  uniqueDreams: number,
  dreamerCount: number
): string {
  if (eventCount >= 3 || uniqueDreams >= 2) return 'Strong Play';
  if (eventCount === 2)                     return 'Watch Closely';
  if (eventCount === 1)                     return 'Soft Signal';
  return 'No Evidence Yet';
}

function strengthSort(tier: string): number {
  return tier === 'Strong Play' ? 4
       : tier === 'Watch Closely' ? 3
       : tier === 'Soft Signal' ? 2
       : 1;
}

export async function GET(req: NextRequest) {
  try {
    const params          = req.nextUrl.searchParams;
    const ownerUid        = resolveOwnerUid(params.get('ownerUid'));
    const dreamerFilter   = (params.get('dreamerId')         ?? '').trim();
    const stateFilter     = (params.get('state')             ?? '').trim();
    const gameFilter      = resolveGameType((params.get('gameType') ?? '').trim());
    const minEvidence     = Number(params.get('minEvidence') ?? 1);
    const includeNoEv     = params.get('includeNoEvidence')  === 'true';
    const termLimit       = Math.min(Number(params.get('limit') ?? 30), 50);
    const today           = new Date().toISOString().slice(0, 10);

    const db = getAdminDb();

    // ── Step 1: Load active dream windows ─────────────────────────────────
    // Query per dreamer to avoid flat-cap bias (same pattern as window-groups)
    const allWindows: any[] = [];
    const seenWin = new Set<string>();

    // Get dreamer list
    const dreamersSnap = await db.collection('dreamers')
      .where('ownerUid', '==', ownerUid).limit(30).get();
    const dreamerIds = dreamerFilter
      ? [dreamerFilter]
      : ['owner-self', ...dreamersSnap.docs.map(d => d.id)];

    await Promise.allSettled(dreamerIds.map(async did => {
      try {
        let q: any = db.collection('activeDreamWindows')
          .where('ownerUid',  '==', ownerUid)
          .where('dreamerId', '==', did);

        const snap = await q.limit(250).get();

        for (const doc of snap.docs) {
          if (seenWin.has(doc.id)) continue;

          const d = doc.data();
          const activeEnd = String(d.activeEnd ?? d.activeWindowEnd ?? '');

          // Filter active windows in memory so missing composite indexes cannot erase a dreamer.
          if (activeEnd && activeEnd < today) continue;

          seenWin.add(doc.id);

          const termLabel = String(
            d.termLabel ??
            d.term ??
            d.label ??
            d.normalizedTerm ??
            ''
          ).trim();

          const normalizedTerm = String(
            d.normalizedTerm ??
            normalizeTerm(termLabel)
          ).trim();

          const number = String(
            d.number ??
            d.candidateNumber ??
            d.candidate ??
            d.playedNumber ??
            ''
          ).trim();

          const gameType = resolveGameType(String(
            d.gameType ??
            d.game_type ??
            d.lotteryGame ??
            ''
          ));

          const state = String(
            d.state ??
            d.targetState ??
            d.playState ??
            d.jurisdiction ??
            ''
          ).trim().toUpperCase();

          allWindows.push({
            id: doc.id,
            ...d,
            termLabel,
            normalizedTerm,
            number,
            candidateNumber: d.candidateNumber ?? d.candidate ?? number,
            gameType,
            state,
            dreamerId: d.dreamerId ?? did,
            dreamerName: d.dreamerName ?? d.displayName ?? did,
            activeEnd,
          });
        }
      } catch (e) {
        console.warn('[api/playlists/evidence-backed] activeDreamWindows query failed for dreamer', did, e);
      }
    }));

    // ── Step 2: Extract unique active terms + track active window metadata ──
    // term → { activeDreamers, activeWindowCount, activeNumbers }
    type TermMeta = {
      rawTerm:           string;
      normalizedTerm:    string;
      activeDreamers:    Set<string>;
      activeWindowIds:   Set<string>;
      activeNumbers:     Map<string, Set<string>>;  // num::gt → Set<dreamerId>
    };

    const termMeta = new Map<string, TermMeta>();

    for (const w of allWindows) {
      const dn  = String(w.dreamerName ?? w.dreamerId ?? 'unknown');
      const tl  = String(w.termLabel ?? w.term ?? w.label ?? w.normalizedTerm ?? '').trim().toLowerCase();
      const nt  = String(w.normalizedTerm ?? normalizeTerm(tl)).trim();
      const num = String(w.number ?? w.candidateNumber ?? w.candidate ?? w.playedNumber ?? '').trim();
      const gt  = String(w.gameType ?? w.game_type ?? w.lotteryGame ?? '').trim();

      if (!nt || !num || !gt) continue;

      if (!termMeta.has(nt)) {
        termMeta.set(nt, { rawTerm: tl, normalizedTerm: nt, activeDreamers: new Set(), activeWindowIds: new Set(), activeNumbers: new Map() });
      }
      const tm = termMeta.get(nt)!;
      tm.activeDreamers.add(dn);
      tm.activeWindowIds.add(w.id);
      if (num && gt) {
        const numKey = `${num}::${gt}`;
        if (!tm.activeNumbers.has(numKey)) tm.activeNumbers.set(numKey, new Set());
        tm.activeNumbers.get(numKey)!.add(dn);
      }
    }

    const uniqueTerms = Array.from(termMeta.values()).slice(0, termLimit);

    // ── Step 3: Targeted fell-before lookup per term ───────────────────────
    // This is the core fix: instead of broad limit=250, query each term individually.
    type FellDoc = Record<string, any>;
    const allFellRows: FellDoc[] = [];
    const seenFell = new Set<string>();

    await Promise.allSettled(uniqueTerms.map(async tm => {
      // Two parallel queries per term: normalizedTerm exact + termLabel exact
      const constrain = (q: any) => {
        let out = q;
        if (stateFilter)                                          out = out.where('state',    '==', stateFilter);
        if (gameFilter === 'cash3' || gameFilter === 'cash4')     out = out.where('gameType', '==', gameFilter);
        if (dreamerFilter)                                        out = out.where('dreamerId','==', dreamerFilter);
        return out;
      };

      const base = db.collection('personalHitMappings').where('ownerUid', '==', ownerUid);
      const [snapA, snapB] = await Promise.all([
        constrain(base.where('normalizedTerm', '==', tm.normalizedTerm)).limit(100).get(),
        constrain(base.where('termLabel',      '==', tm.rawTerm)).limit(100).get(),
      ]);
      for (const snap of [snapA, snapB]) {
        for (const doc of snap.docs) {
          if (seenFell.has(doc.id) || doc.data()._deprecated) continue;
          seenFell.add(doc.id);
          allFellRows.push({ id: doc.id, ...doc.data() });
        }
      }
    }));

    // ── Step 4: Load personalHitEvents for event-verified counts ─────────
    // Only for terms we found fell-before rows for — verify counts from events
    const fellTerms = new Set(allFellRows.map(r => String(r.normalizedTerm ?? normalizeTerm(r.termLabel ?? ''))));
    const allEventRows: any[] = [];
    const seenEv = new Set<string>();

    await Promise.allSettled(Array.from(fellTerms).slice(0, termLimit).map(async nt => {
      try {
        let q: any = db.collection('personalHitEvents')
          .where('ownerUid', '==', ownerUid)
          .where('normalizedTerm', '==', nt);
        if (stateFilter)  q = q.where('state', '==', stateFilter);
        if (dreamerFilter)q = q.where('dreamerId', '==', dreamerFilter);
        const snap = await q.limit(200).get();
        for (const doc of snap.docs) {
          if (seenEv.has(doc.id)) continue;
          seenEv.add(doc.id);
          allEventRows.push({ id: doc.id, ...doc.data() });
        }
      } catch { /* non-fatal */ }
    }));

    // ── Step 5: Build evidence-backed candidates ───────────────────────────
    // Group by (normalizedTerm, number, gameType, state)
    type CandKey = string;
    type Candidate = {
      termLabel:              string;
      normalizedTerm:         string;
      number:                 string;
      boxedKey:               string;
      state:                  string;
      gameType:               string;
      strengthTier:           string;
      verifiedEventCount:     number;
      aggregateHitCount:      number;
      uniqueDrawDateCount:    number;
      uniqueDreamWindowCount: number;
      straightCount:          number;
      boxedCount:             number;
      firstHitDate:           string;
      lastHitDate:            string;
      activeDreamers:         string[];
      activeDreamerCount:     number;
      currentActiveWindowCount:number;
      isActiveTerm:           boolean;
      reason:                 string;
    };

    const candMap = new Map<CandKey, Candidate>();

    // First pass: from fell-before aggregate rows (grouped by semantic key)
    for (const row of allFellRows) {
      const nt    = String(row.normalizedTerm ?? normalizeTerm(row.termLabel ?? '')).trim();
      const tl    = String(row.termLabel ?? '').trim();
      const num   = String(row.number    ?? '').trim();
      const gt    = resolveGameType(String(row.gameType ?? ''));
      const state = String(row.state     ?? '').trim();
      if (!nt || !num || !state || !gt) continue;

      const tm = termMeta.get(nt);
      if (!tm) continue;  // term is not currently active — skip

      const ck: CandKey = `${nt}::${num}::${gt}::${state}`;
      if (!candMap.has(ck)) {
        candMap.set(ck, {
          termLabel: tl || nt, normalizedTerm: nt,
          number: num, boxedKey: bk(num), state, gameType: gt,
          strengthTier: 'No Evidence Yet',
          verifiedEventCount: 0, aggregateHitCount: 0,
          uniqueDrawDateCount: 0, uniqueDreamWindowCount: 0,
          straightCount: 0, boxedCount: 0,
          firstHitDate: '', lastHitDate: '',
          activeDreamers: Array.from(tm.activeDreamers),
          activeDreamerCount: tm.activeDreamers.size,
          currentActiveWindowCount: tm.activeWindowIds.size,
          isActiveTerm: true,
          reason: '',
        });
      }
      const c = candMap.get(ck)!;
      c.aggregateHitCount += Number(row.hitCount ?? 1);
      c.straightCount     += Number(row.straightCount ?? 0);
      c.boxedCount        += Number(row.boxedCount ?? 0);
      const dd = String(row.drawDate ?? row.lastHitDate ?? '');
      if (dd && (!c.lastHitDate || dd > c.lastHitDate)) c.lastHitDate = dd;
      if (dd && (!c.firstHitDate || dd < c.firstHitDate)) c.firstHitDate = dd;
    }

    // Second pass: verify/override counts from personalHitEvents
    const evByGroup = new Map<CandKey, { count: number; straight: number; boxed: number; dates: Set<string>; windows: Set<string> }>();
    for (const ev of allEventRows) {
      const nt    = String(ev.normalizedTerm ?? '').trim();
      const num   = String(ev.number ?? ev.candidateNumber ?? '').trim();
      const gt    = resolveGameType(String(ev.gameType ?? ''));
      const state = String(ev.state  ?? '').trim();
      if (!nt || !num || !state) continue;

      const ck: CandKey = `${nt}::${num}::${gt}::${state}`;
      if (!evByGroup.has(ck)) evByGroup.set(ck, { count: 0, straight: 0, boxed: 0, dates: new Set(), windows: new Set() });
      const eg = evByGroup.get(ck)!;
      eg.count++;
      if (String(ev.hitType ?? '') === 'straight') eg.straight++; else eg.boxed++;
      const dd = String(ev.drawDate ?? '');
      if (dd) eg.dates.add(dd);
      const wid = String(ev.activeWindowId ?? ev.backtestDreamId ?? ev.sourceDreamEntryId ?? '');
      if (wid) eg.windows.add(wid);
    }

    // Apply event-verified counts where available
    for (const [ck, eg] of evByGroup.entries()) {
      if (!candMap.has(ck)) continue;  // event for non-active term — skip
      const c = candMap.get(ck)!;
      c.verifiedEventCount     = eg.count;
      c.uniqueDrawDateCount    = eg.dates.size;
      c.uniqueDreamWindowCount = eg.windows.size;
      // Use event straight/boxed if available (more accurate than aggregate)
      if (eg.count > 0) { c.straightCount = eg.straight; c.boxedCount = eg.boxed; }
    }

    // For candidates without personalHitEvents, use aggregate as estimate
    for (const [ck, c] of candMap.entries()) {
      if (c.verifiedEventCount === 0 && c.aggregateHitCount > 0) {
        c.verifiedEventCount = c.aggregateHitCount;  // best estimate
      }
    }

    // ── Step 6: Apply tiers + reason + filter ─────────────────────────────
    const withEvidence: Candidate[]  = [];
    const noEvidence:   Candidate[]  = [];

    for (const c of candMap.values()) {
      const crossDream = c.activeDreamerCount >= 2 && c.verifiedEventCount >= 1;

      c.strengthTier = crossDream
        ? 'Cross-Dream Convergence'
        : strengthTier(c.verifiedEventCount, c.uniqueDrawDateCount, c.uniqueDreamWindowCount, c.activeDreamerCount);

      const hitWord = c.verifiedEventCount === 1 ? 'event' : 'events';
      const dateRange = c.firstHitDate && c.lastHitDate && c.firstHitDate !== c.lastHitDate
        ? ` (${c.firstHitDate} – ${c.lastHitDate})`
        : c.lastHitDate ? ` (last: ${c.lastHitDate})` : '';
      const dreamerNote = crossDream ? ` across ${c.activeDreamerCount} active dreamers` : '';
      c.reason = `"${c.termLabel}" has produced ${c.number} in ${c.state} across ${c.verifiedEventCount} verified ${hitWord}${dateRange}${dreamerNote}.`;

      if (c.verifiedEventCount >= minEvidence) {
        withEvidence.push(c);
      } else {
        noEvidence.push(c);
      }
    }

    // ── Step 7: Add active-window numbers with no evidence (if requested) ──
    if (includeNoEv) {
      for (const tm of uniqueTerms) {
        for (const [numKey, dreamers] of tm.activeNumbers.entries()) {
          const [num, gt] = numKey.split('::');
          // Already has evidence — skip
          if ([...candMap.keys()].some(k => k.startsWith(`${tm.normalizedTerm}::${num}::${gt}::`))) continue;
          noEvidence.push({
            termLabel: tm.rawTerm, normalizedTerm: tm.normalizedTerm,
            number: num, boxedKey: bk(num), state: '', gameType: gt,
            strengthTier: 'No Evidence Yet',
            verifiedEventCount: 0, aggregateHitCount: 0,
            uniqueDrawDateCount: 0, uniqueDreamWindowCount: 0,
            straightCount: 0, boxedCount: 0,
            firstHitDate: '', lastHitDate: '',
            activeDreamers: Array.from(dreamers),
            activeDreamerCount: dreamers.size,
            currentActiveWindowCount: tm.activeWindowIds.size,
            isActiveTerm: true,
            reason: `Active number with no historical fell-before evidence yet.`,
          });
        }
      }
    }

    // Sort evidence candidates by tier then event count
    withEvidence.sort((a, b) =>
      (strengthSort(b.strengthTier) - strengthSort(a.strengthTier)) ||
      (b.verifiedEventCount - a.verifiedEventCount)
    );

    const res = NextResponse.json({
      ok: true,
      candidates:          withEvidence,
      evidenceCandidates:  withEvidence,
      convergenceCandidates: withEvidence.filter(c => c.strengthTier === 'Cross-Dream Convergence'),
      recentHits:          [],
      noEvidenceCandidates:noEvidence,
      count:               withEvidence.length,
      noEvidenceCount:     noEvidence.length,
      activeTermCount:     uniqueTerms.length,
      activeWindowCount:   allWindows.length,
      debug: {
        activeWindowCount: allWindows.length,
        validActiveWindowCount: allWindows.filter(w => w.normalizedTerm && w.number && w.gameType).length,
        activeTermCount: uniqueTerms.length,
        activeTermsSample: uniqueTerms.slice(0, 15).map(t => t.rawTerm),
        activeWindowsSample: allWindows.slice(0, 5).map(w => ({
          dreamerName: w.dreamerName,
          termLabel: w.termLabel,
          normalizedTerm: w.normalizedTerm,
          number: w.number,
          gameType: w.gameType,
          state: w.state,
          activeEnd: w.activeEnd,
        })),
      },
      dreamerBreakdown:    Object.fromEntries(
        [...new Set(allWindows.map(w => String(w.dreamerName ?? w.dreamerId ?? 'unknown')))]
          .map(dn => [dn, allWindows.filter(w => (w.dreamerName ?? w.dreamerId) === dn).length])
      ),
    });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;

  } catch (err) {
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q, candidates: [], noEvidenceCandidates: [],
        error: q ? 'Firebase quota exhausted.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
