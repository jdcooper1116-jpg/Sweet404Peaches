/**
 * GET /api/playlists/evidence-backed?ownerUid=...
 *
 * Builds State Playlist candidates using STRICT past-window evidence.
 *
 * CORE RULE:
 *   A number is only promoted to the State Playlist if the active dream term
 *   has produced that same number / state / gameType in a COMPLETELY DIFFERENT
 *   past active dream window — not the current one.
 *
 *   "Sister dreamed today → 515/CA fell 2 years ago after an older sister dream"
 *   = 515/CA is a candidate.
 *
 *   "Sister dreamed today → 515/CA fell yesterday in this same window"
 *   = 515/CA is NOT a playlist candidate; it goes in Recent Hits.
 *
 * EVENT QUALIFICATION:
 *   A personalHitEvent qualifies as past evidence for term T only if ALL of:
 *     1. event.normalizedTerm == T
 *     2. event.activeWindowId  ∉ currentWindowIds[T]
 *     3. event.sourceDreamEntryId or dreamEntryId ∉ currentDreamEntryIds[T]
 *     4. event.drawDate < earliestActiveStart[T]  (pre-dates current windows)
 *     5. event is not deprecated
 *
 * STRENGTH TIERS (based on uniquePastDreamWindowCount):
 *   Strong Repeat Play    — 3+ separate past dream windows
 *   Watch Closely         — 2 separate past dream windows
 *   Soft Historical Signal — 1 separate past dream window
 *   Recent Hit Only       — current-window evidence only (separate section)
 *   No Evidence Yet       — no evidence at all (collapsed section)
 *
 * Params:
 *   ownerUid          required
 *   dreamerId         optional
 *   state             optional
 *   gameType          optional  cash3 | cash4
 *   includeNoEvidence optional  default false
 *   limit             optional  max terms to look up, default 30, max 50
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
function resolveGT(raw: string): string {
  if (raw === 'pick3') return 'cash3';
  if (raw === 'pick4') return 'cash4';
  return raw;
}

// Tier based strictly on unique past dream window count
function pastWindowTier(uniquePastWindows: number): string {
  if (uniquePastWindows >= 3) return 'Strong Repeat Play';
  if (uniquePastWindows === 2) return 'Watch Closely';
  if (uniquePastWindows === 1) return 'Soft Historical Signal';
  return 'No Evidence Yet';
}
function tierSort(tier: string): number {
  return tier === 'Strong Repeat Play'     ? 5
       : tier === 'Cross-Dream Convergence'? 4
       : tier === 'Watch Closely'          ? 3
       : tier === 'Soft Historical Signal' ? 2
       : 1;
}

export async function GET(req: NextRequest) {
  try {
    const params        = req.nextUrl.searchParams;
    const ownerUid      = resolveOwnerUid(params.get('ownerUid'));
    const dreamerFilter = (params.get('dreamerId')         ?? '').trim();
    const stateFilter   = (params.get('state')             ?? '').trim();
    const gameFilter    = resolveGT((params.get('gameType') ?? '').trim());
    const includeNoEv   = params.get('includeNoEvidence')  === 'true';
    const termLimit     = Math.min(Number(params.get('limit') ?? 30), 50);
    const today         = new Date().toISOString().slice(0, 10);

    const db = getAdminDb();

    // ── Step 1: Load all active windows (per-dreamer to avoid flat cap) ───
    const allWindows: any[] = [];
    const seenWin = new Set<string>();

    const dreamersSnap = await db.collection('dreamers')
      .where('ownerUid', '==', ownerUid).limit(30).get();
    const dreamerIds = dreamerFilter
      ? [dreamerFilter]
      : ['owner-self', ...dreamersSnap.docs.map(d => d.id)];

    await Promise.allSettled(dreamerIds.map(async did => {
      try {
        const snap = await db.collection('activeDreamWindows')
          .where('ownerUid',  '==', ownerUid)
          .where('dreamerId', '==', did)
          .where('activeEnd', '>=', today)
          .limit(200).get();
        for (const doc of snap.docs) {
          if (seenWin.has(doc.id)) continue;
          seenWin.add(doc.id);
          const d = doc.data();
          allWindows.push({ id: doc.id, ...d, gameType: resolveGT(String(d.gameType ?? d.game_type ?? '')) });
        }
      } catch { /* non-fatal */ }
    }));

    // ── Step 2: Build term metadata + CURRENT WINDOW EXCLUSION SETS ───────
    // For each active term we track:
    //   currentWindowIds    — window IDs active right now for this term
    //   currentEntryIds     — dreamEntryIds active right now for this term
    //   earliestActiveStart — earliest activeStart of current windows (cutoff date)
    //
    // An event is "past evidence" only if it predates ALL of these.

    type TermMeta = {
      rawTerm:            string;
      normalizedTerm:     string;
      activeDreamers:     Set<string>;
      currentWindowIds:   Set<string>;   // IDs of windows active NOW for this term
      currentEntryIds:    Set<string>;   // dreamEntryIds active NOW for this term
      earliestActiveStart:string;        // earliest start of current windows
      activeNumbers:      Map<string, Set<string>>; // num::gt → dreamers
    };

    const termMeta = new Map<string, TermMeta>();

    for (const w of allWindows) {
      const dn  = String(w.dreamerName ?? w.dreamerId ?? 'unknown');
      const tl  = String(w.termLabel   ?? '').trim().toLowerCase();
      const nt  = normalizeTerm(tl);
      const num = String(w.number      ?? '').trim();
      const gt  = String(w.gameType    ?? '');
      const astart = String(w.activeStart ?? w.dreamDate ?? '');
      const eid = String(w.dreamEntryId ?? '');

      if (!nt) continue;

      if (!termMeta.has(nt)) {
        termMeta.set(nt, {
          rawTerm: tl, normalizedTerm: nt,
          activeDreamers:    new Set(),
          currentWindowIds:  new Set(),
          currentEntryIds:   new Set(),
          earliestActiveStart: astart,
          activeNumbers:     new Map(),
        });
      }
      const tm = termMeta.get(nt)!;
      tm.activeDreamers.add(dn);
      tm.currentWindowIds.add(w.id);
      if (eid) tm.currentEntryIds.add(eid);
      // Track earliest activeStart for this term's current windows
      if (astart && (!tm.earliestActiveStart || astart < tm.earliestActiveStart)) {
        tm.earliestActiveStart = astart;
      }
      if (num && gt) {
        const numKey = `${num}::${gt}`;
        if (!tm.activeNumbers.has(numKey)) tm.activeNumbers.set(numKey, new Set());
        tm.activeNumbers.get(numKey)!.add(dn);
      }
    }

    const uniqueTerms = Array.from(termMeta.values()).slice(0, termLimit);
    if (uniqueTerms.length === 0) {
      return NextResponse.json({
        ok: true, candidates: [], noEvidenceCandidates: [], recentHitOnlyCandidates: [],
        count: 0, noEvidenceCount: 0, recentHitOnlyCount: 0,
        activeTermCount: 0, activeWindowCount: 0, dreamerBreakdown: {},
        debug: { activeWindowCount: allWindows.length, activeTermCount: 0,
          totalEventsChecked: 0, qualifiedPastEvents: 0,
          excludedSameWindowEvents: 0, excludedSameDreamEvents: 0,
          excludedCurrentPeriodEvents: 0, candidatesPromoted: 0,
          recentHitOnlyCount: 0, noEvidenceCount: 0 },
      });
    }

    // ── Step 3: Load personalHitEvents per active term ────────────────────
    // This is the ONLY truth source. personalHitMappings is not used for counts.
    const allEventRows: any[] = [];
    const seenEv = new Set<string>();

    await Promise.allSettled(uniqueTerms.map(async tm => {
      try {
        let q: any = db.collection('personalHitEvents')
          .where('ownerUid',      '==', ownerUid)
          .where('normalizedTerm','==', tm.normalizedTerm);
        if (stateFilter)   q = q.where('state',    '==', stateFilter);
        if (gameFilter === 'cash3' || gameFilter === 'cash4') q = q.where('gameType', '==', gameFilter);
        if (dreamerFilter) q = q.where('dreamerId','==', dreamerFilter);
        const snap = await q.limit(200).get();
        for (const doc of snap.docs) {
          if (seenEv.has(doc.id) || doc.data()._deprecated) continue;
          seenEv.add(doc.id);
          allEventRows.push({ id: doc.id, ...doc.data() });
        }
      } catch { /* non-fatal */ }
    }));

    // ── Step 4: Qualify events — past vs current ──────────────────────────
    type CandKey = string;  // nt::num::gt::state

    type PastGroup = {
      termLabel:               string;
      normalizedTerm:          string;
      number:                  string;
      boxedKey:                string;
      state:                   string;
      gameType:                string;
      verifiedPastEventCount:  number;
      uniquePastDreamWindowCount: number;
      uniquePastDreamEntryCount:  number;
      uniquePastDrawDateCount:    number;
      straightCount:           number;
      boxedCount:              number;
      firstPastHitDate:        string;
      lastPastHitDate:         string;
      pastWindowIds:           Set<string>;
      pastEntryIds:            Set<string>;
      pastDrawDates:           Set<string>;
      // For Cross-Dream: dreamers whose PAST evidence included this candidate
      pastEvidenceDreamers:    Set<string>;
    };

    type CurrentGroup = {
      nt: string; num: string; gt: string; state: string;
      eventCount: number;
    };

    const pastGroups    = new Map<CandKey, PastGroup>();
    const currentGroups = new Map<CandKey, CurrentGroup>(); // recent-hit-only tracking

    // Debug counters
    let totalEventsChecked = 0;
    let excludedSameWindow = 0;
    let excludedSameDream  = 0;
    let excludedCurrentPeriod = 0;
    let qualifiedPastEvents = 0;

    for (const ev of allEventRows) {
      totalEventsChecked++;
      const nt    = String(ev.normalizedTerm ?? '').trim();
      const num   = String(ev.number ?? ev.candidateNumber ?? '').trim();
      const gt    = resolveGT(String(ev.gameType ?? ''));
      const state = String(ev.state ?? '').trim();
      if (!nt || !num || !state || !gt) continue;

      const tm = termMeta.get(nt);
      if (!tm) continue;  // event for a non-active term — skip

      const ck: CandKey       = `${nt}::${num}::${gt}::${state}`;
      const evWindowId        = String(ev.activeWindowId          ?? '');
      const evEntryId         = String(ev.sourceDreamEntryId ?? ev.dreamEntryId ?? '');
      const evDrawDate        = String(ev.drawDate                ?? '');
      const evDreamerName     = String(ev.dreamerName             ?? '');
      const hitType           = String(ev.hitType                 ?? 'boxed');

      // ── Qualification checks ──────────────────────────────────────────
      const isSameWindow  = evWindowId  && tm.currentWindowIds.has(evWindowId);
      const isSameEntry   = evEntryId   && tm.currentEntryIds.has(evEntryId);
      // Conservative date check: event must predate the EARLIEST start of current windows for this term
      const isCurrentPeriod = tm.earliestActiveStart
        && evDrawDate
        && evDrawDate >= tm.earliestActiveStart;

      if (isSameWindow) { excludedSameWindow++; /* fall through to track as current */ }
      else if (isSameEntry) { excludedSameDream++;  /* fall through to track as current */ }
      else if (isCurrentPeriod && !evWindowId && !evEntryId) {
        // No window/entry ID but drew during current period — exclude cautiously
        excludedCurrentPeriod++;
        // fall through to track as current
      } else if (!isSameWindow && !isSameEntry && (!isCurrentPeriod || evDrawDate < tm.earliestActiveStart)) {
        // ── QUALIFIED PAST EVENT ─────────────────────────────────────────
        qualifiedPastEvents++;
        if (!pastGroups.has(ck)) {
          pastGroups.set(ck, {
            termLabel: String(ev.termLabel ?? nt), normalizedTerm: nt,
            number: num, boxedKey: bk(num), state, gameType: gt,
            verifiedPastEventCount: 0,
            uniquePastDreamWindowCount: 0,
            uniquePastDreamEntryCount: 0,
            uniquePastDrawDateCount: 0,
            straightCount: 0, boxedCount: 0,
            firstPastHitDate: '', lastPastHitDate: '',
            pastWindowIds: new Set(), pastEntryIds: new Set(), pastDrawDates: new Set(),
            pastEvidenceDreamers: new Set(),
          });
        }
        const pg = pastGroups.get(ck)!;
        pg.verifiedPastEventCount++;
        if (hitType === 'straight') pg.straightCount++; else pg.boxedCount++;
        if (evWindowId)  pg.pastWindowIds.add(evWindowId);
        if (evEntryId)   pg.pastEntryIds.add(evEntryId);
        if (evDrawDate) {
          pg.pastDrawDates.add(evDrawDate);
          if (!pg.firstPastHitDate || evDrawDate < pg.firstPastHitDate) pg.firstPastHitDate = evDrawDate;
          if (evDrawDate > pg.lastPastHitDate)                           pg.lastPastHitDate  = evDrawDate;
        }
        if (evDreamerName) pg.pastEvidenceDreamers.add(evDreamerName);
        continue;
      }

      // Track as current-window evidence (for Recent Hit Only bucket)
      if (!currentGroups.has(ck)) currentGroups.set(ck, { nt, num, gt, state, eventCount: 0 });
      currentGroups.get(ck)!.eventCount++;
    }

    // Compute unique counts from sets
    for (const pg of pastGroups.values()) {
      pg.uniquePastDreamWindowCount = pg.pastWindowIds.size  || (pg.verifiedPastEventCount > 0 ? 1 : 0);
      pg.uniquePastDreamEntryCount  = pg.pastEntryIds.size   || (pg.verifiedPastEventCount > 0 ? 1 : 0);
      pg.uniquePastDrawDateCount    = pg.pastDrawDates.size;
    }

    // ── Step 5: Apply tiers, build output buckets ─────────────────────────
    type Candidate = PastGroup & {
      strengthTier:            string;
      activeDreamers:          string[];
      activeDreamerCount:      number;
      currentActiveWindowCount:number;
      hasCurrentWindowHit:     boolean;
      qualifiedPastEvents:     number;
      excludedCurrentWindowEvents: number;
      reason:                  string;
    };

    const withEvidence: Candidate[]     = [];
    const recentHitOnly: Candidate[]    = [];
    const noEvidence:   any[]           = [];

    // Candidates with past evidence
    for (const [ck, pg] of pastGroups.entries()) {
      const tm = termMeta.get(pg.normalizedTerm);
      if (!tm) continue;

      const crossDream = pg.pastEvidenceDreamers.size >= 2 ||
        (tm.activeDreamers.size >= 2 && pg.uniquePastDreamWindowCount >= 1);

      const tier = crossDream && pg.uniquePastDreamWindowCount >= 1
        ? 'Cross-Dream Convergence'
        : pastWindowTier(pg.uniquePastDreamWindowCount);

      const hasCurrentHit = currentGroups.has(ck);
      const excl = currentGroups.get(ck)?.eventCount ?? 0;

      const windowWord = pg.uniquePastDreamWindowCount === 1 ? 'past dream window' : 'separate past dream windows';
      const dateRange = pg.firstPastHitDate && pg.lastPastHitDate && pg.firstPastHitDate !== pg.lastPastHitDate
        ? ` (${pg.firstPastHitDate} – ${pg.lastPastHitDate})`
        : pg.lastPastHitDate ? ` (last: ${pg.lastPastHitDate})` : '';
      const dreamerNote = crossDream ? ` across ${pg.pastEvidenceDreamers.size || tm.activeDreamers.size} dreamers` : '';

      const cand: Candidate = {
        ...pg,
        strengthTier:             tier,
        activeDreamers:           Array.from(tm.activeDreamers),
        activeDreamerCount:       tm.activeDreamers.size,
        currentActiveWindowCount: tm.currentWindowIds.size,
        hasCurrentWindowHit:      hasCurrentHit,
        qualifiedPastEvents:      pg.verifiedPastEventCount,
        excludedCurrentWindowEvents: excl,
        reason: `"${pg.termLabel}" has produced ${pg.number} in ${pg.state} across ${pg.uniquePastDreamWindowCount} ${windowWord}${dateRange}${dreamerNote}.`,
      };

      withEvidence.push(cand);
    }

    // Recent-hit-only candidates (current-window evidence, no past windows)
    for (const [ck, cg] of currentGroups.entries()) {
      if (pastGroups.has(ck)) continue;  // already in withEvidence
      const tm = termMeta.get(cg.nt);
      if (!tm) continue;
      recentHitOnly.push({
        termLabel: cg.nt, normalizedTerm: cg.nt,
        number: cg.num, boxedKey: bk(cg.num), state: cg.state, gameType: cg.gt,
        strengthTier: 'Recent Hit Only',
        verifiedPastEventCount: 0, uniquePastDreamWindowCount: 0,
        uniquePastDreamEntryCount: 0, uniquePastDrawDateCount: 0,
        straightCount: 0, boxedCount: 0,
        firstPastHitDate: '', lastPastHitDate: '',
        pastWindowIds: new Set(), pastEntryIds: new Set(), pastDrawDates: new Set(),
        pastEvidenceDreamers: new Set(),
        activeDreamers: Array.from(tm.activeDreamers),
        activeDreamerCount: tm.activeDreamers.size,
        currentActiveWindowCount: tm.currentWindowIds.size,
        hasCurrentWindowHit: true,
        qualifiedPastEvents: 0,
        excludedCurrentWindowEvents: cg.eventCount,
        reason: `Current-window hit detected. No past independent window evidence yet.`,
      } as any);
    }

    // No-evidence active numbers (if requested)
    if (includeNoEv) {
      for (const tm of uniqueTerms) {
        for (const [numKey, dreamers] of tm.activeNumbers.entries()) {
          const [num, gt] = numKey.split('::');
          const hasPast    = [...pastGroups.keys()].some(k => k.startsWith(`${tm.normalizedTerm}::${num}::${gt}::`));
          const hasCurrent = [...currentGroups.keys()].some(k => k.startsWith(`${tm.normalizedTerm}::${num}::${gt}::`));
          if (hasPast || hasCurrent) continue;
          noEvidence.push({
            termLabel: tm.rawTerm, normalizedTerm: tm.normalizedTerm,
            number: num, boxedKey: bk(num), state: '', gameType: gt,
            strengthTier: 'No Evidence Yet',
            verifiedPastEventCount: 0, uniquePastDreamWindowCount: 0,
            activeDreamers: Array.from(dreamers),
            activeDreamerCount: dreamers.size,
            currentActiveWindowCount: tm.currentWindowIds.size,
            reason: 'Active window number with no fell-before evidence from any past dream window.',
          });
        }
      }
    }

    withEvidence.sort((a, b) =>
      (tierSort(b.strengthTier) - tierSort(a.strengthTier)) ||
      (b.uniquePastDreamWindowCount - a.uniquePastDreamWindowCount) ||
      (b.verifiedPastEventCount - a.verifiedPastEventCount)
    );

    const dreamerBreakdown = Object.fromEntries(
      [...new Set(allWindows.map(w => String(w.dreamerName ?? w.dreamerId ?? 'unknown')))]
        .map(dn => [dn, allWindows.filter(w => (w.dreamerName ?? w.dreamerId) === dn).length])
    );

    const res = NextResponse.json({
      ok: true,
      candidates:               withEvidence,
      noEvidenceCandidates:     noEvidence,
      recentHitOnlyCandidates:  recentHitOnly,
      count:                    withEvidence.length,
      noEvidenceCount:          noEvidence.length,
      recentHitOnlyCount:       recentHitOnly.length,
      activeTermCount:          uniqueTerms.length,
      activeWindowCount:        allWindows.length,
      dreamerBreakdown,
      debug: {
        activeWindowCount:           allWindows.length,
        activeTermCount:             uniqueTerms.length,
        totalEventsChecked,
        qualifiedPastEvents,
        excludedSameWindowEvents:    excludedSameWindow,
        excludedSameDreamEvents:     excludedSameDream,
        excludedCurrentPeriodEvents: excludedCurrentPeriod,
        candidatesPromoted:          withEvidence.length,
        recentHitOnlyCount:          recentHitOnly.length,
        noEvidenceCount:             noEvidence.length,
      },
    });
    res.headers.set('Cache-Control', 'private, max-age=20');
    return res;

  } catch (err) {
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q, candidates: [], noEvidenceCandidates: [], recentHitOnlyCandidates: [],
        error: q ? 'Firebase quota exhausted.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
