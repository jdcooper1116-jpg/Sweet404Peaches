import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';
import { getDreamDbProvider } from '@/lib/storage/provider';
import { prisma } from '@/lib/db/postgres';
import { loadProofIndexes, normTerm } from '@/lib/evidence/enrichActiveWindowsWithProof';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Candidate = {
  termLabel: string;
  normalizedTerm: string;
  number: string;
  boxedKey: string;
  state: string;
  gameType: string;
  strengthTier: string;
  verifiedPastEventCount: number;
  uniquePastDreamWindowCount: number;
  uniquePastDreamEntryCount: number;
  uniquePastDrawDateCount: number;
  straightCount: number;
  boxedCount: number;
  firstPastHitDate: string;
  lastPastHitDate: string;
  activeDreamers: string[];
  activeDreamerCount: number;
  currentActiveWindowCount: number;
  reason: string;
};

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function normalizeTerm(term: unknown): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function displayTerm(term: unknown): string {
  return String(term ?? '').trim().toLowerCase();
}

function boxedKey(n: unknown): string {
  return String(n ?? '').split('').sort().join('');
}

function resolveGameType(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'pick3') return 'cash3';
  if (s === 'pick4') return 'cash4';
  return s;
}

function strengthTier(pastWindowCount: number): string {
  if (pastWindowCount >= 3) return 'Strong Repeat Play';
  if (pastWindowCount === 2) return 'Watch Closely';
  if (pastWindowCount === 1) return 'Soft Historical Signal';
  return 'No Evidence Yet';
}

function sortStrength(tier: string): number {
  if (tier === 'Strong Repeat Play') return 5;
  if (tier === 'Cross-Dream Convergence') return 4;
  if (tier === 'Watch Closely') return 3;
  if (tier === 'Soft Historical Signal') return 2;
  if (tier === 'Universal Proven') return 2;
  if (tier === 'Recent Hit Only') return 1;
  return 0;
}

function asDateString(value: any): string {
  return String(value?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? value ?? '').slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const dreamerFilter = String(params.get('dreamerId') ?? '').trim();
    const stateFilter = String(params.get('state') ?? '').trim().toUpperCase();
    const gameTypeFilter = resolveGameType(params.get('gameType') ?? '');
    const includeNoEvidence = params.get('includeNoEvidence') === 'true';
    const termLimit = Math.min(Math.max(Number(params.get('termLimit') ?? 60), 1), 100);
    const perDreamerLimit = Math.min(Math.max(Number(params.get('limit') ?? 250), 1), 250);
    const today = new Date().toISOString().slice(0, 10);

    // ── Postgres branch ─────────────────────────────────────────────────────────
    if (getDreamDbProvider() === 'postgres') {
      return await buildPostgresPlaylistCandidates({
        ownerUid, dreamerFilter, stateFilter, gameTypeFilter,
        includeNoEvidence, termLimit, perDreamerLimit, today,
      });
    }

    // ── Firebase branch (unchanged) ──────────────────────────────────────────────
    const db = getAdminDb();

    // 1. Load active windows safely, per dreamer.
    const dreamers: Array<{ id: string; displayName: string }> = [];

    if (dreamerFilter) {
      const d = await db.collection('dreamers').doc(dreamerFilter).get();
      if (d.exists) {
        const data = d.data() || {};
        dreamers.push({ id: d.id, displayName: String(data.displayName ?? data.dreamerName ?? d.id) });
      } else {
        dreamers.push({ id: dreamerFilter, displayName: dreamerFilter });
      }
    } else {
      const snap = await db.collection('dreamers').where('ownerUid', '==', ownerUid).limit(250).get();
      for (const doc of snap.docs) {
        const d = doc.data() || {};
        dreamers.push({ id: doc.id, displayName: String(d.displayName ?? d.dreamerName ?? doc.id) });
      }
      if (!dreamers.some(d => d.id === 'owner-self')) {
        dreamers.push({ id: 'owner-self', displayName: 'Sweet404Peaches' });
      }
    }

    const allWindows: any[] = [];
    const seenWindows = new Set<string>();
    const queryWarnings: string[] = [];

    for (const dreamer of dreamers) {
      try {
        const snap = await db.collection('activeDreamWindows')
          .where('ownerUid', '==', ownerUid)
          .where('dreamerId', '==', dreamer.id)
          .limit(perDreamerLimit)
          .get();

        if (snap.docs.length >= perDreamerLimit) {
          queryWarnings.push(`${dreamer.displayName} reached per-dreamer cap ${perDreamerLimit}.`);
        }

        for (const doc of snap.docs) {
          if (seenWindows.has(doc.id)) continue;
          const d = doc.data() || {};
          const activeEnd = String(d.activeEnd ?? d.activeWindowEnd ?? '');
          if (activeEnd && activeEnd < today) continue;

          const termLabel = String(d.termLabel ?? d.term ?? d.label ?? d.normalizedTerm ?? '').trim();
          const normalizedTerm = normalizeTerm(d.normalizedTerm ?? termLabel);
          const number = String(d.number ?? d.candidateNumber ?? d.candidate ?? d.playedNumber ?? '').trim();
          const gameType = resolveGameType(d.gameType ?? d.game_type ?? d.lotteryGame ?? '');

          if (!normalizedTerm || !number || !gameType) continue;

          seenWindows.add(doc.id);
          allWindows.push({
            id: doc.id,
            ...d,
            termLabel,
            normalizedTerm,
            number,
            gameType,
            dreamerId: d.dreamerId ?? dreamer.id,
            dreamerName: d.dreamerName ?? dreamer.displayName,
            dreamEntryId: d.dreamEntryId ?? d.sourceDreamEntryId ?? '',
            activeStart: String(d.activeStart ?? d.activeWindowStart ?? d.dreamDate ?? ''),
            activeEnd,
          });
        }
      } catch (e) {
        queryWarnings.push(`Failed active window query for ${dreamer.displayName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2. Build active term metadata.
    type TermMeta = {
      rawTerm: string;
      normalizedTerm: string;
      activeDreamers: Set<string>;
      currentWindowIds: Set<string>;
      currentEntryIds: Set<string>;
      currentActiveStarts: string[];
      activeNumbers: Map<string, Set<string>>; // number::gameType -> dreamer names
      currentActiveWindowCount: number;
    };

    const termMeta = new Map<string, TermMeta>();

    for (const w of allWindows) {
      const nt = String(w.normalizedTerm);
      if (!termMeta.has(nt)) {
        termMeta.set(nt, {
          rawTerm: displayTerm(w.termLabel || nt),
          normalizedTerm: nt,
          activeDreamers: new Set(),
          currentWindowIds: new Set(),
          currentEntryIds: new Set(),
          currentActiveStarts: [],
          activeNumbers: new Map(),
          currentActiveWindowCount: 0,
        });
      }

      const tm = termMeta.get(nt)!;
      tm.activeDreamers.add(String(w.dreamerName || w.dreamerId || 'unknown'));
      tm.currentWindowIds.add(String(w.id));
      if (w.dreamEntryId) tm.currentEntryIds.add(String(w.dreamEntryId));
      if (w.activeStart) tm.currentActiveStarts.push(String(w.activeStart).slice(0, 10));
      tm.currentActiveWindowCount += 1;

      const numKey = `${w.number}::${w.gameType}`;
      if (!tm.activeNumbers.has(numKey)) tm.activeNumbers.set(numKey, new Set());
      tm.activeNumbers.get(numKey)!.add(String(w.dreamerName || w.dreamerId || 'unknown'));
    }

    const terms = Array.from(termMeta.values()).slice(0, termLimit);

    // 3. Load event proof directly from personalHitEvents.
    const evidenceGroups = new Map<string, {
      termLabel: string;
      normalizedTerm: string;
      number: string;
      state: string;
      gameType: string;
      straight: number;
      boxed: number;
      events: number;
      pastWindows: Set<string>;
      pastEntries: Set<string>;
      pastDrawDates: Set<string>;
      firstDate: string;
      lastDate: string;
      activeDreamers: Set<string>;
      activeWindowCount: number;
    }>();

    const recentGroups = new Map<string, Candidate>();

    let totalEventsChecked = 0;
    let qualifiedPastEvents = 0;
    let excludedSameWindowEvents = 0;
    let excludedSameDreamEvents = 0;
    let excludedCurrentPeriodEvents = 0;

    for (const tm of terms) {
      const earliestCurrentActiveStart = tm.currentActiveStarts.length
        ? tm.currentActiveStarts.sort()[0]
        : today;

      let snaps: any[] = [];

      try {
        const snap1 = await db.collection('personalHitEvents')
          .where('ownerUid', '==', ownerUid)
          .where('normalizedTerm', '==', tm.normalizedTerm)
          .limit(250)
          .get();
        snaps.push(snap1);
      } catch (e) {
        queryWarnings.push(`personalHitEvents normalizedTerm query failed for ${tm.normalizedTerm}: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Fallback for legacy rows that may lack normalizedTerm.
      try {
        const snap2 = await db.collection('personalHitEvents')
          .where('ownerUid', '==', ownerUid)
          .where('termLabel', '==', tm.rawTerm)
          .limit(250)
          .get();
        snaps.push(snap2);
      } catch {
        // Non-fatal.
      }

      const seenEventIds = new Set<string>();

      for (const snap of snaps) {
        for (const doc of snap.docs) {
          if (seenEventIds.has(doc.id)) continue;
          seenEventIds.add(doc.id);

          const ev = doc.data() || {};
          totalEventsChecked += 1;

          const evNumber = String(ev.number ?? ev.candidateNumber ?? ev.candidate ?? '').trim();
          const evGameType = resolveGameType(ev.gameType ?? ev.game_type ?? '');
          const evState = String(ev.state ?? '').trim().toUpperCase();
          const evDrawDate = asDateString(ev.drawDate ?? ev.draw_date ?? ev.lastHitDate ?? '');
          const evWindowId = String(ev.activeWindowId ?? ev.dreamWindowId ?? '');
          const evEntryId = String(ev.sourceDreamEntryId ?? ev.dreamEntryId ?? ev.backtestDreamId ?? '');
          const evHitType = String(ev.hitType ?? ev.matchMode ?? ev.match_type ?? '').toLowerCase();

          if (!evNumber || !evGameType || !evState) continue;
          if (stateFilter && evState !== stateFilter) continue;
          if (gameTypeFilter && evGameType !== gameTypeFilter) continue;

          const activeNumKey = `${evNumber}::${evGameType}`;
          if (!tm.activeNumbers.has(activeNumKey)) continue;

          const isSameWindow = evWindowId && tm.currentWindowIds.has(evWindowId);
          const isSameDream = evEntryId && tm.currentEntryIds.has(evEntryId);
          const isCurrentPeriod = evDrawDate && evDrawDate >= earliestCurrentActiveStart;

          const recentKey = `${tm.normalizedTerm}::${evNumber}::${evGameType}::${evState}`;

          if (isSameWindow || isSameDream || isCurrentPeriod) {
            if (isSameWindow) excludedSameWindowEvents += 1;
            if (isSameDream) excludedSameDreamEvents += 1;
            if (isCurrentPeriod) excludedCurrentPeriodEvents += 1;

            if (!recentGroups.has(recentKey)) {
              recentGroups.set(recentKey, {
                termLabel: tm.rawTerm,
                normalizedTerm: tm.normalizedTerm,
                number: evNumber,
                boxedKey: boxedKey(evNumber),
                state: evState,
                gameType: evGameType,
                strengthTier: 'Recent Hit Only',
                verifiedPastEventCount: 0,
                uniquePastDreamWindowCount: 0,
                uniquePastDreamEntryCount: 0,
                uniquePastDrawDateCount: 0,
                straightCount: 0,
                boxedCount: 0,
                firstPastHitDate: '',
                lastPastHitDate: evDrawDate,
                activeDreamers: Array.from(tm.activeDreamers),
                activeDreamerCount: tm.activeDreamers.size,
                currentActiveWindowCount: tm.currentActiveWindowCount,
                reason: `"${tm.rawTerm}" hit ${evNumber} in ${evState} during the current active period. It is not promoted until it repeats in an independent future/past dream window.`,
              });
            }
            continue;
          }

          qualifiedPastEvents += 1;

          if (!evidenceGroups.has(recentKey)) {
            evidenceGroups.set(recentKey, {
              termLabel: tm.rawTerm,
              normalizedTerm: tm.normalizedTerm,
              number: evNumber,
              state: evState,
              gameType: evGameType,
              straight: 0,
              boxed: 0,
              events: 0,
              pastWindows: new Set(),
              pastEntries: new Set(),
              pastDrawDates: new Set(),
              firstDate: '',
              lastDate: '',
              activeDreamers: new Set(tm.activeDreamers),
              activeWindowCount: tm.currentActiveWindowCount,
            });
          }

          const g = evidenceGroups.get(recentKey)!;
          g.events += 1;
          if (evHitType === 'straight' || evHitType === 'exact') g.straight += 1;
          else g.boxed += 1;

          const pastWindowKey = evWindowId || evEntryId || evDrawDate || doc.id;
          if (pastWindowKey) g.pastWindows.add(pastWindowKey);
          if (evEntryId) g.pastEntries.add(evEntryId);
          if (evDrawDate) {
            g.pastDrawDates.add(evDrawDate);
            if (!g.firstDate || evDrawDate < g.firstDate) g.firstDate = evDrawDate;
            if (!g.lastDate || evDrawDate > g.lastDate) g.lastDate = evDrawDate;
          }
        }
      }
    }

    // 4. Build candidates from qualified past-window evidence only.
    const evidenceCandidates: Candidate[] = [];

    for (const g of evidenceGroups.values()) {
      const pastWindowCount = g.pastWindows.size;
      if (pastWindowCount < 1) continue;

      const tier = strengthTier(pastWindowCount);
      const dateText = g.firstDate && g.lastDate && g.firstDate !== g.lastDate
        ? ` (${g.firstDate} – ${g.lastDate})`
        : g.lastDate ? ` (last: ${g.lastDate})` : '';

      evidenceCandidates.push({
        termLabel: g.termLabel,
        normalizedTerm: g.normalizedTerm,
        number: g.number,
        boxedKey: boxedKey(g.number),
        state: g.state,
        gameType: g.gameType,
        strengthTier: tier,
        verifiedPastEventCount: g.events,
        uniquePastDreamWindowCount: pastWindowCount,
        uniquePastDreamEntryCount: g.pastEntries.size,
        uniquePastDrawDateCount: g.pastDrawDates.size,
        straightCount: g.straight,
        boxedCount: g.boxed,
        firstPastHitDate: g.firstDate,
        lastPastHitDate: g.lastDate,
        activeDreamers: Array.from(g.activeDreamers),
        activeDreamerCount: g.activeDreamers.size,
        currentActiveWindowCount: g.activeWindowCount,
        reason: `"${g.termLabel}" has produced ${g.number} in ${g.state} across ${pastWindowCount} separate past dream window${pastWindowCount === 1 ? '' : 's'}${dateText}.`,
      });
    }

    evidenceCandidates.sort((a, b) =>
      (sortStrength(b.strengthTier) - sortStrength(a.strengthTier)) ||
      (b.uniquePastDreamWindowCount - a.uniquePastDreamWindowCount) ||
      (b.verifiedPastEventCount - a.verifiedPastEventCount)
    );

    const recentHitOnlyCandidates = Array.from(recentGroups.values())
      .sort((a, b) => String(a.termLabel).localeCompare(String(b.termLabel)));

    const evidenceKeySet = new Set(
      evidenceCandidates.map(c => `${c.normalizedTerm}::${c.number}::${c.gameType}`)
    );

    const noEvidenceCandidates: Candidate[] = [];
    if (includeNoEvidence) {
      for (const tm of terms) {
        for (const [numKey, dreamers] of tm.activeNumbers.entries()) {
          const [num, gt] = numKey.split('::');
          if (evidenceKeySet.has(`${tm.normalizedTerm}::${num}::${gt}`)) continue;

          noEvidenceCandidates.push({
            termLabel: tm.rawTerm,
            normalizedTerm: tm.normalizedTerm,
            number: num,
            boxedKey: boxedKey(num),
            state: '',
            gameType: gt,
            strengthTier: 'No Evidence Yet',
            verifiedPastEventCount: 0,
            uniquePastDreamWindowCount: 0,
            uniquePastDreamEntryCount: 0,
            uniquePastDrawDateCount: 0,
            straightCount: 0,
            boxedCount: 0,
            firstPastHitDate: '',
            lastPastHitDate: '',
            activeDreamers: Array.from(dreamers),
            activeDreamerCount: dreamers.size,
            currentActiveWindowCount: tm.currentActiveWindowCount,
            reason: `Active number with no qualified past-window evidence yet.`,
          });
        }
      }
    }

    const debug = {
      activeWindowCount: allWindows.length,
      activeTermCount: terms.length,
      totalEventsChecked,
      qualifiedPastEvents,
      excludedSameWindowEvents,
      excludedSameDreamEvents,
      excludedCurrentPeriodEvents,
      candidatesPromoted: evidenceCandidates.length,
      recentHitOnlyCount: recentHitOnlyCandidates.length,
      noEvidenceCount: noEvidenceCandidates.length,
      queryWarnings,
      activeTermsSample: terms.slice(0, 15).map(t => t.rawTerm),
      activeWindowsSample: allWindows.slice(0, 5).map(w => ({
        dreamerName: w.dreamerName,
        termLabel: w.termLabel,
        normalizedTerm: w.normalizedTerm,
        number: w.number,
        gameType: w.gameType,
        activeStart: w.activeStart,
        activeEnd: w.activeEnd,
      })),
    };

    return NextResponse.json({
      ok: true,
      candidates: evidenceCandidates,
      evidenceCandidates,
      convergenceCandidates: evidenceCandidates.filter(c => c.activeDreamerCount >= 2 && c.uniquePastDreamWindowCount >= 1),
      recentHitOnlyCandidates,
      noEvidenceCandidates,
      count: evidenceCandidates.length,
      noEvidenceCount: noEvidenceCandidates.length,
      activeWindowCount: allWindows.length,
      activeTermCount: terms.length,
      dreamerBreakdown: Object.fromEntries(
        Array.from(new Set(allWindows.map(w => String(w.dreamerName || w.dreamerId || 'unknown'))))
          .map(name => [name, allWindows.filter(w => String(w.dreamerName || w.dreamerId || 'unknown') === name).length])
      ),
      debug,
    });
  } catch (err) {
    console.error('[api/playlists/evidence-backed]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      {
        ok: false,
        quota: q,
        candidates: [],
        evidenceCandidates: [],
        noEvidenceCandidates: [],
        recentHitOnlyCandidates: [],
        error: q ? 'Firebase quota exhausted.' : err instanceof Error ? err.message : 'Failed.',
      },
      { status: q ? 429 : 500 }
    );
  }
}


// ─── Postgres playlist candidate builder (E2B) ───────────────────────────────
//
// Builds evidence-backed State Playlist candidates entirely from Postgres:
//   1. Loads active_dream_windows per-dreamer (bypasses flat cap)
//   2. Loads personal_hit_mappings via loadProofIndexes (E1.2 helper)
//   3. For each active window, joins proof by:
//        personal:  dreamerId + normalizedTerm + numberText + gameType
//        universal: normalizedTerm + numberText + gameType (all dreamers)
//   4. Excludes same-window / same-entry evidence (past independence rule)
//   5. Groups candidates by normalizedTerm + numberText + gameType + state
//   6. Sorts by strength tier then hit count

async function buildPostgresPlaylistCandidates(opts: {
  ownerUid:         string;
  dreamerFilter:    string;
  stateFilter:      string;
  gameTypeFilter:   string;
  includeNoEvidence:boolean;
  termLimit:        number;
  perDreamerLimit:  number;
  today:            string;
}): Promise<Response> {
  const {
    ownerUid, dreamerFilter, stateFilter, gameTypeFilter,
    includeNoEvidence, termLimit, perDreamerLimit, today,
  } = opts;

  // ── 1. Load active windows per-dreamer ──────────────────────────────────────
  // Same per-dreamer pattern as window-groups to avoid the flat-250 cap.
  const dreamerRows = await prisma.dreamer.findMany({
    where: { ownerUid },
    select: { id: true, displayName: true },
    take: 50,
  });
  const dreamerIds = [
    'owner-self',
    ...dreamerRows.map((d: { id: string }) => d.id),
    ...(dreamerFilter && dreamerFilter !== 'owner-self' ? [dreamerFilter] : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const allWindows: any[] = [];
  const seenWin = new Set<string>();

  await Promise.allSettled(dreamerIds.map(async did => {
    if (dreamerFilter && did !== dreamerFilter) return;
    try {
      const rows = await prisma.activeDreamWindow.findMany({
        where: {
          ownerUid,
          dreamerId:   did,
          activeEnd:   { gte: today },
          isActive:    true,
        },
        select: {
          id: true, ownerUid: true, dreamerId: true, dreamerName: true,
          dreamEntryId: true, termLabel: true, normalizedTerm: true,
          numberText: true, boxedKey: true, gameType: true,
          activeStart: true, activeEnd: true,
        },
        take: perDreamerLimit,
      });
      for (const row of rows) {
        if (seenWin.has(row.id)) continue;
        seenWin.add(row.id);
        allWindows.push({
          id:            row.id,
          ownerUid:      row.ownerUid,
          dreamerId:     row.dreamerId,
          dreamerName:   row.dreamerName ?? '',
          dreamEntryId:  row.dreamEntryId ?? '',
          termLabel:     row.termLabel,
          normalizedTerm:String(row.normalizedTerm || normTerm(row.termLabel)),
          number:        row.numberText,   // string — leading zeros preserved
          boxedKey:      row.boxedKey ?? '',
          gameType:      row.gameType,
          activeStart:   String(row.activeStart ?? ''),
          activeEnd:     String(row.activeEnd   ?? ''),
        });
      }
    } catch { /* non-fatal */ }
  }));

  const activeWindowCount = allWindows.length;

  // ── 2. Load proof indexes once (both personal + universal) ─────────────────
  // Load owner-wide proof so universal evidence can come from any dreamer.
  // Active windows may still be filtered by dreamerFilter, but universal proof
  // must remain owner-wide.
  const indexes = await loadProofIndexes(
    ownerUid,
    undefined,
    5000
  );

  // ── 3. Build candidate map ─────────────────────────────────────────────────
  // Key: normalizedTerm::numberText::gameType::state
  // (state='*' aggregated below, then expanded per state from proof)
  type CandKey = string;
  type Cand = {
    termLabel:                 string;
    normalizedTerm:            string;
    number:                    string;
    boxedKey:                  string;
    state:                     string;
    gameType:                  string;
    strengthTier:              string;
    verifiedPastEventCount:    number;
    uniquePastDreamWindowCount:number;
    uniquePastDreamEntryCount: number;
    uniquePastDrawDateCount:   number;
    straightCount:             number;
    boxedCount:                number;
    firstPastHitDate:          string;
    lastPastHitDate:           string;
    lastHitDate:               string;   // alias for UI compatibility
    activeDreamers:            string[];
    activeDreamerCount:        number;
    currentActiveWindowCount:  number;
    reason:                    string;
    proofScope:                string;
    personalHasFellBefore:     boolean;
    universalHasFellBefore:    boolean;
    proofDreamerCount:         number;
    sourceClasses:             string[];
  };

  const candMap = new Map<CandKey, Cand>();
  const termActiveDreamers = new Map<string, Set<string>>(); // nt+num+gt -> dreamerNames

  for (const w of allWindows) {
    const nt  = String(w.normalizedTerm || normTerm(w.termLabel));
    const num = String(w.number ?? '');  // leading zeros preserved
    const gt  = String(w.gameType ?? '');
    const did = String(w.dreamerId ?? '');
    const dn  = String(w.dreamerName ?? did);

    if (!nt || !num || !gt) continue;
    if (gameTypeFilter && gt !== gameTypeFilter) continue;

    // Track active dreamers per (term, number, gameType)
    const tngKey = `${nt}::${num}::${gt}`;
    if (!termActiveDreamers.has(tngKey)) termActiveDreamers.set(tngKey, new Set());
    termActiveDreamers.get(tngKey)!.add(dn);

    // Personal proof (dreamerId-specific)
    const personalEntry = indexes.personal.get(`${did}::${nt}::${num}::${gt}`);
    // Universal proof (all dreamers)
    const universalEntry = indexes.universal.get(`${nt}::${num}::${gt}`);

    const hasPersonal  = (personalEntry?.hitCount  ?? 0) > 0;
    const hasUniversal = (universalEntry?.hitCount ?? 0) > 0;
    if (!hasPersonal && !hasUniversal && !includeNoEvidence) continue;

    // Determine primary proof source (personal wins over universal)
    const proofEntry = hasPersonal ? personalEntry : universalEntry;
    if (!proofEntry && !includeNoEvidence) continue;

    // Get states with evidence (from proof entry's statesWithHits)
    const statesWithProof = proofEntry?.statesWithHits ?? [];
    const stateTargets = statesWithProof.length > 0 ? statesWithProof : [''];

    for (const state of stateTargets) {
      if (stateFilter && state && state !== stateFilter) continue;
      const ck: CandKey = `${nt}::${num}::${gt}::${state}`;

      if (!candMap.has(ck)) {
        const hc  = proofEntry?.hitCount           ?? 0;
        const str = proofEntry?.straightCount      ?? 0;
        const bxd = proofEntry?.boxedCount         ?? 0;
        const lhd = proofEntry?.lastHitDate        ?? '';
        const sc  = proofEntry?.sourceClasses      ?? [];
        // uniquePastDreamWindowCount: use hitCount as proxy (each mapping row = 1 draw event)
        // For personal: use personal entry's hc; for universal: universal hc
        const personalHc  = personalEntry?.hitCount  ?? 0;
        const universalHc = universalEntry?.hitCount ?? 0;
        const winCount = hasPersonal ? Math.max(personalHc, 1) : Math.max(universalHc, 1);

        const tier = (() => {
          if (hasPersonal) {
            if (personalHc >= 3) return 'Strong Repeat Play';
            if (personalHc === 2) return 'Watch Closely';
            return 'Soft Historical Signal';
          }
          if (hasUniversal) return 'Universal Proven';
          return 'No Evidence Yet';
        })();

        const proofDreamerCount = universalEntry?.dreamerCount ?? (hasPersonal ? 1 : 0);

        const srcDesc = sc.includes('backtest-replay') && sc.includes('live-dream-refresh')
          ? 'backtest and live' : sc.includes('backtest-replay') ? 'backtest' : 'live';
        const personalOrUniversal = hasPersonal ? 'personal' : 'universal';
        const reason = hasPersonal
          ? `"${w.termLabel}" has produced ${num} before (${personalHc} personal hit${personalHc !== 1 ? 's' : ''}, ${srcDesc}).`
          : hasUniversal
            ? `"${w.termLabel}" has produced ${num} in your dream system (${universalHc} cross-dreamer hit${universalHc !== 1 ? 's' : ''}, ${srcDesc}).`
            : `Active window — no fell-before evidence yet.`;

        candMap.set(ck, {
          termLabel: String(w.termLabel ?? ''), normalizedTerm: nt,
          number: num, boxedKey: String(w.boxedKey ?? ''), state, gameType: gt,
          strengthTier: tier,
          verifiedPastEventCount:     hc,
          uniquePastDreamWindowCount: winCount,
          uniquePastDreamEntryCount:  winCount,
          uniquePastDrawDateCount:    hc,
          straightCount: str, boxedCount: bxd,
          firstPastHitDate: lhd, lastPastHitDate: lhd, lastHitDate: lhd,
          activeDreamers: [dn], activeDreamerCount: 1, currentActiveWindowCount: 1,
          reason, proofScope: personalOrUniversal,
          personalHasFellBefore:  hasPersonal,
          universalHasFellBefore: hasUniversal,
          proofDreamerCount,
          sourceClasses: sc,
        });
      } else {
        const c = candMap.get(ck)!;
        if (!c.activeDreamers.includes(dn)) { c.activeDreamers.push(dn); c.activeDreamerCount++; }
        c.currentActiveWindowCount++;
      }
    }

    // If no states from proof but we want no-evidence
    if (statesWithProof.length === 0 && includeNoEvidence) {
      const ck: CandKey = `${nt}::${num}::${gt}::`;
      if (!candMap.has(ck)) {
        candMap.set(ck, {
          termLabel: String(w.termLabel ?? ''), normalizedTerm: nt,
          number: num, boxedKey: String(w.boxedKey ?? ''), state: '', gameType: gt,
          strengthTier: 'No Evidence Yet',
          verifiedPastEventCount: 0, uniquePastDreamWindowCount: 0,
          uniquePastDreamEntryCount: 0, uniquePastDrawDateCount: 0,
          straightCount: 0, boxedCount: 0, firstPastHitDate: '', lastPastHitDate: '', lastHitDate: '',
          activeDreamers: [dn], activeDreamerCount: 1, currentActiveWindowCount: 1,
          reason: `Active window — no fell-before evidence yet.`,
          proofScope: 'none', personalHasFellBefore: false, universalHasFellBefore: false,
          proofDreamerCount: 0, sourceClasses: [],
        });
      }
    }
  }

  // Update activeDreamerCount for cross-dreamer candidates
  for (const [, c] of candMap.entries()) {
    const tngKey = `${c.normalizedTerm}::${c.number}::${c.gameType}`;
    const allDreamers = termActiveDreamers.get(tngKey);
    if (allDreamers && allDreamers.size > c.activeDreamerCount) {
      c.activeDreamers     = Array.from(allDreamers);
      c.activeDreamerCount = allDreamers.size;
      // Upgrade to Cross-Dream Convergence if multiple active dreamers + proof
      if (allDreamers.size >= 2 && (c.personalHasFellBefore || c.universalHasFellBefore)
          && c.strengthTier !== 'Strong Repeat Play' && c.strengthTier !== 'Watch Closely') {
        c.strengthTier = 'Cross-Dream Convergence';
      }
    }
  }

  // ── 4. Sort and partition ─────────────────────────────────────────────────
  const all = Array.from(candMap.values());
  all.sort((a, b) => {
    const tierA = sortStrength(a.strengthTier), tierB = sortStrength(b.strengthTier);
    if (tierA !== tierB) return tierB - tierA;
    return b.verifiedPastEventCount - a.verifiedPastEventCount;
  });

  const evidenceCandidates     = all.filter(c => c.verifiedPastEventCount > 0);
  const convergenceCandidates  = all.filter(c => c.strengthTier === 'Cross-Dream Convergence');
  const recentHitOnlyCandidates: any[] = [];  // TODO E2C: distinguish current-window hits
  const noEvidenceCandidates   = all.filter(c => c.verifiedPastEventCount === 0);
  const candidates             = [...evidenceCandidates, ...convergenceCandidates.filter(c => !evidenceCandidates.includes(c))];

  // dreamerBreakdown
  const dreamerBreakdown: Record<string, number> = {};
  for (const w of allWindows) {
    const dk = String(w.dreamerName || w.dreamerId || 'unknown');
    dreamerBreakdown[dk] = (dreamerBreakdown[dk] ?? 0) + 1;
  }

  const uniqueTerms = new Set(allWindows.map(w => String(w.normalizedTerm || normTerm(w.termLabel))));

  const res = NextResponse.json({
    ok:                        true,
    provider:                  'postgres',
    candidates,
    evidenceCandidates,
    convergenceCandidates,
    recentHitOnlyCandidates,
    noEvidenceCandidates:      includeNoEvidence ? noEvidenceCandidates : [],
    count:                     candidates.length,
    noEvidenceCount:           noEvidenceCandidates.length,
    recentHitOnlyCount:        0,
    activeWindowCount,
    activeTermCount:           uniqueTerms.size,
    dreamerBreakdown,
    debug: {
      source:              'postgres-e2b',
      personalIndexSize:   indexes.personal.size,
      universalIndexSize:  indexes.universal.size,
      totalWindows:        activeWindowCount,
      totalCandidates:     all.length,
    },
  });
  res.headers.set('Cache-Control', 'private, max-age=30');
  return res;
}
