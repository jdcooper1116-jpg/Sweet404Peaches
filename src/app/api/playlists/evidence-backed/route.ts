import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

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
  if (tier === 'Strong Repeat Play') return 4;
  if (tier === 'Watch Closely') return 3;
  if (tier === 'Soft Historical Signal') return 2;
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
