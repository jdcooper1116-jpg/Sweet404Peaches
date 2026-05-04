/**
 * POST /api/admin/rebuild-hit-memory
 *
 * Global Hit Count Truth Rebuild.
 *
 * ROOT CAUSE OF 3-HIT BUG:
 *   Multiple write paths (batch9a, repair-backtest, promote-hits) each ran
 *   FieldValue increment for the same semantic event, using different
 *   idempotency registries (dreamHitPromotions, personalHitEvents, none).
 *   Each route "didn't know" the others had already incremented, so the
 *   aggregate accumulated 3 when only 2 distinct draw events exist.
 *
 * THE FIX:
 *   The event ledger (personalHitEvents + backtestHits + dreamHits) is the
 *   source of truth. This route:
 *     1. Reads all three ledger sources
 *     2. Deduplicates events by canonical event key
 *     3. Groups by semantic key (ownerUid+dreamerId+normalizedTerm+number+gameType+state)
 *     4. Computes absolute hitCount/straightCount/boxedCount from distinct events
 *     5. Compares to existing personalHitMappings aggregates
 *     6. If repair=true: writes absolute values back (no FieldValue.increment)
 *
 * This is idempotent: running it twice produces the same result because it
 * always writes the event-counted absolute value, not an increment.
 *
 * POST inputs:
 *   ownerUid  required
 *   term      optional — filter
 *   number    optional — filter
 *   state     optional — filter
 *   gameType  optional — filter
 *   dreamerId optional — filter
 *   source    optional — "backtest-replay" | "live-dream-refresh" | "all"
 *   repair    boolean, default false (dry run)
 *   limit     default 500, max 1000
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp }                 from 'firebase-admin/firestore';
import { getAdminDb }                from '@/lib/firebase/admin';
import {
  canonicalPmDocId, canonicalEventId, normalizeTerm,
  classifyHit, rowSemanticKey,
} from '@/lib/intelligence/hitClassification';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
}

function resolveGameType(raw: string): string {
  if (raw === 'pick3') return 'cash3';
  if (raw === 'pick4') return 'cash4';
  return raw;
}

type NormalizedEvent = {
  evKey:          string;   // dedup key
  semanticKey:    string;   // group key
  pmId:           string;   // canonical aggregate doc ID
  ownerUid:       string;
  dreamerId:      string;
  dreamerName:    string;
  termLabel:      string;
  normalizedTerm: string;
  number:         string;
  winningNumber:  string;
  gameType:       string;
  state:          string;
  drawDate:       string;
  drawTime:       string;
  hitType:        'straight' | 'boxed';
  source:         string;
  backtestDreamId:string;
  sourceDreamEntryId:string;
  activeWindowId: string;
  daysFromDream:  number | null;
  sameDay:        boolean | null;
};

function normalizeEvent(
  ownerUid: string,
  d: Record<string, any>
): NormalizedEvent | null {
  const candidate  = String(d.candidate   ?? d.number ?? d.candidateNumber ?? '').trim();
  const winning    = String(d.winningNumber ?? d.winning_number ?? '').trim();
  const rawGt      = String(d.gameType ?? d.game_type ?? '');
  const gameType   = resolveGameType(rawGt);
  const state      = String(d.state    ?? '').trim();
  const drawDate   = String(d.drawDate ?? d.draw_date ?? '').trim();
  const drawTime   = String(d.drawTime ?? d.draw_time ?? '').trim();
  const termLabel  = String(d.termLabel ?? '').trim();
  const dreamerId  = String(d.dreamerId ?? 'owner-self');
  const btid       = String(d.backtestDreamId ?? '');
  const sdeid      = String(d.sourceDreamEntryId ?? d.dreamEntryId ?? '');
  const wid        = String(d.activeWindowId ?? d.dreamWindowId ?? '');

  if (!candidate || !state || !gameType || !termLabel) return null;

  // Classify the hit to ensure straight/boxed are mutually exclusive
  const rawHitType = String(d.hitType ?? d.match_type ?? d.matchType ?? '');
  let hitType: 'straight' | 'boxed';
  if (rawHitType === 'straight' || rawHitType === 'exact') {
    hitType = 'straight';
  } else if (rawHitType === 'boxed') {
    hitType = 'boxed';
  } else if (winning) {
    // Re-classify from numbers for definitiveness
    const cls = classifyHit(candidate, winning);
    if (!cls.isHit) return null;
    hitType = cls.hitType!;
  } else {
    return null;
  }

  const nt = normalizeTerm(termLabel);
  const dreamSourceId = btid || sdeid || wid;

  const evKey     = canonicalEventId(ownerUid, dreamerId, nt, candidate, gameType, state, drawDate, drawTime, hitType, dreamSourceId);
  const pmId      = canonicalPmDocId(ownerUid, dreamerId, nt, candidate, gameType, state);
  const semKey    = `${ownerUid}|${dreamerId}|${nt}|${candidate}|${gameType}|${state}`;

  const dfd = typeof d.daysFromDream === 'number' ? d.daysFromDream : null;

  return {
    evKey, semanticKey: semKey, pmId,
    ownerUid, dreamerId,
    dreamerName:    String(d.dreamerName ?? ''),
    termLabel, normalizedTerm: nt,
    number: candidate, winningNumber: winning,
    gameType, state, drawDate, drawTime, hitType,
    source: String(d.source ?? ''),
    backtestDreamId: btid, sourceDreamEntryId: sdeid, activeWindowId: wid,
    daysFromDream: dfd, sameDay: dfd !== null ? dfd === 0 : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body       = await req.json().catch(() => ({}));
    const ownerUid   = String(body?.ownerUid   ?? '').trim();
    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid is required.' }, { status: 400 });
    }

    const termFilter   = String(body?.term      ?? '').trim().toLowerCase();
    const numFilter    = String(body?.number     ?? '').trim();
    const stateFilter  = String(body?.state      ?? '').trim();
    const gameFilter   = (() => { const raw = String(body?.gameType ?? '').trim(); return resolveGameType(raw); })();
    const dreamerFilter= String(body?.dreamerId  ?? '').trim();
    const sourceFilter = String(body?.source     ?? 'all').trim();
    const repair       = Boolean(body?.repair);
    const limit        = Math.min(Number(body?.limit ?? 500), 1000);

    const db  = getAdminDb();
    const now = Timestamp.now();

    // ── 1. Read event ledger from all three sources ──────────────────────────
    const allEvents: NormalizedEvent[] = [];
    const seen = new Set<string>();

    async function readCollection(col: string, useNormalizedTerm = false) {
      try {
        let q: any = db.collection(col).where('ownerUid', '==', ownerUid);
        if (dreamerFilter) q = q.where('dreamerId', '==', dreamerFilter);
        if (stateFilter)   q = q.where('state',     '==', stateFilter);
        if (gameFilter === 'cash3' || gameFilter === 'cash4') q = q.where('gameType', '==', gameFilter);
        if (termFilter) {
          const nt = normalizeTerm(termFilter);
          q = useNormalizedTerm
            ? q.where('normalizedTerm', '==', nt)
            : q.where('termLabel',      '==', termFilter);
        }
        const snap = await q.limit(limit).get();
        for (const doc of snap.docs) {
          const ev = normalizeEvent(ownerUid, doc.data());
          if (!ev) continue;
          if (numFilter && ev.number !== numFilter) continue;
          if (sourceFilter !== 'all') {
            const isBacktest = ev.backtestDreamId || ev.source.includes('backtest');
            if (sourceFilter === 'backtest-replay' && !isBacktest) continue;
            if (sourceFilter === 'live-dream-refresh' && isBacktest) continue;
          }
          if (!seen.has(ev.evKey)) { seen.add(ev.evKey); allEvents.push(ev); }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('FAILED_PRECONDITION')) console.warn(`[rebuild] ${col} query warn:`, msg);
      }
    }

    // Query each collection with both termLabel and normalizedTerm variants
    await Promise.all([
      readCollection('personalHitEvents',  false),
      readCollection('personalHitEvents',  true),
      readCollection('backtestHits',        false),
      readCollection('backtestHits',        true),
      readCollection('dreamHits',           false),
    ]);

    const distinctEvents = allEvents.length;

    // ── 2. Group by semantic key ──────────────────────────────────────────────
    type Group = {
      semanticKey:     string;
      pmId:            string;
      ownerUid:        string;
      dreamerId:       string;
      dreamerName:     string;
      termLabel:       string;
      normalizedTerm:  string;
      number:          string;
      gameType:        string;
      state:           string;
      events:          NormalizedEvent[];
      hitCount:        number;
      straightCount:   number;
      boxedCount:      number;
      firstHitDate:    string;
      lastHitDate:     string;
      uniqueDrawDates: string[];
      uniqueWindows:   string[];
      stateStrengthScore: number;
      sourceClasses:   string[];
    };

    const groups = new Map<string, Group>();

    for (const ev of allEvents) {
      if (!groups.has(ev.semanticKey)) {
        groups.set(ev.semanticKey, {
          semanticKey: ev.semanticKey, pmId: ev.pmId,
          ownerUid, dreamerId: ev.dreamerId, dreamerName: ev.dreamerName,
          termLabel: ev.termLabel, normalizedTerm: ev.normalizedTerm,
          number: ev.number, gameType: ev.gameType, state: ev.state,
          events: [], hitCount: 0, straightCount: 0, boxedCount: 0,
          firstHitDate: '', lastHitDate: '', uniqueDrawDates: [],
          uniqueWindows: [], stateStrengthScore: 0, sourceClasses: [],
        });
      }
      const g = groups.get(ev.semanticKey)!;
      g.events.push(ev);
      g.hitCount++;
      if (ev.hitType === 'straight') { g.straightCount++; g.stateStrengthScore += 3; }
      else                           { g.boxedCount++;    g.stateStrengthScore += 1; }
      if (ev.drawDate && !g.uniqueDrawDates.includes(ev.drawDate)) g.uniqueDrawDates.push(ev.drawDate);
      if (ev.drawDate && (!g.firstHitDate || ev.drawDate < g.firstHitDate)) g.firstHitDate = ev.drawDate;
      if (ev.drawDate && ev.drawDate > g.lastHitDate) g.lastHitDate = ev.drawDate;
      const wid = ev.backtestDreamId || ev.sourceDreamEntryId || ev.activeWindowId;
      if (wid && !g.uniqueWindows.includes(wid)) g.uniqueWindows.push(wid);
      const sc = ev.source || (ev.backtestDreamId ? 'backtest-replay' : 'live-dream-refresh');
      if (sc && !g.sourceClasses.includes(sc)) g.sourceClasses.push(sc);
    }

    // ── 3. Compare to existing personalHitMappings ────────────────────────────
    // Read current aggregates for the same filter
    let aggQ: any = db.collection('personalHitMappings').where('ownerUid', '==', ownerUid);
    if (dreamerFilter) aggQ = aggQ.where('dreamerId', '==', dreamerFilter);
    if (stateFilter)   aggQ = aggQ.where('state',     '==', stateFilter);
    if (gameFilter === 'cash3' || gameFilter === 'cash4') aggQ = aggQ.where('gameType', '==', gameFilter);

    const aggSnap = await aggQ.limit(limit).get();
    const aggDocs = aggSnap.docs
      .map((d: any) => ({ id: d.id, data: d.data() }))
      .filter(({ data: d }: any) => {
        if (d._deprecated) return false;
        if (numFilter   && String(d.number ?? '') !== numFilter) return false;
        if (termFilter) {
          const nt = normalizeTerm(String(d.termLabel ?? ''));
          if (!nt.includes(normalizeTerm(termFilter))) return false;
        }
        return true;
      });

    // Build a map of existing aggregates by semantic key
    const aggBySemKey = new Map<string, { id: string; hitCount: number; straight: number; boxed: number }>();
    for (const { id, data: d } of aggDocs) {
      const sk = rowSemanticKey(d);
      const existing = aggBySemKey.get(sk);
      // If duplicate agg docs, prefer canonical (higher hitCount) — just as audit-hit-counts does
      if (!existing || Number(d.hitCount ?? 0) > existing.hitCount) {
        aggBySemKey.set(sk, { id, hitCount: Number(d.hitCount ?? 0), straight: Number(d.straightCount ?? 0), boxed: Number(d.boxedCount ?? 0) });
      }
    }

    const mismatchedAggregates: any[] = [];
    const matchedAggregates:    any[] = [];
    const newGroups:             any[] = [];

    for (const [semKey, g] of groups.entries()) {
      const existing = aggBySemKey.get(semKey);
      if (!existing) {
        newGroups.push({ semanticKey: semKey, eventCount: g.hitCount });
      } else if (existing.hitCount !== g.hitCount || existing.straight !== g.straightCount || existing.boxed !== g.boxedCount) {
        mismatchedAggregates.push({
          semanticKey:    semKey,
          term:           g.termLabel,
          number:         g.number,
          state:          g.state,
          gameType:       g.gameType,
          existingAggregate: { hitCount: existing.hitCount, straight: existing.straight, boxed: existing.boxed },
          eventTruth:        { hitCount: g.hitCount, straight: g.straightCount, boxed: g.boxedCount },
          canonicalDocId: g.pmId,
        });
      } else {
        matchedAggregates.push(semKey);
      }
    }

    // Find non-canonical legacy aggregate docs (wrong field order)
    const nonCanonicalDocs = aggDocs.filter(({ id, data: d }: any) => {
      const expectedId = canonicalPmDocId(
        String(d.ownerUid ?? ''), String(d.dreamerId ?? 'owner-self'),
        normalizeTerm(String(d.termLabel ?? '')), String(d.number ?? ''),
        resolveGameType(String(d.gameType ?? '')), String(d.state ?? '')
      );
      return id !== expectedId;
    });

    // ── 4. Repair (if requested) ──────────────────────────────────────────────
    let repairedMappings  = 0;
    let deprecatedDocs    = 0;
    const repairExamples: any[] = [];

    if (repair) {
      const BATCH = 400;

      // Write canonical aggregates from event truth
      const groupsList = Array.from(groups.values());
      for (let i = 0; i < groupsList.length; i += BATCH) {
        const bw = db.batch();
        for (const g of groupsList.slice(i, i + BATCH)) {
          // Use absolute set — NOT FieldValue.increment
          bw.set(db.collection('personalHitMappings').doc(g.pmId), {
            ownerUid:        g.ownerUid,
            dreamerId:       g.dreamerId,
            dreamerName:     g.dreamerName,
            termLabel:       g.termLabel,
            normalizedTerm:  g.normalizedTerm,
            number:          g.number,
            candidateNumber: g.number,
            gameType:        g.gameType,
            state:           g.state,
            hitCount:        g.hitCount,        // ABSOLUTE — from event count
            straightCount:   g.straightCount,   // ABSOLUTE — from event count
            boxedCount:      g.boxedCount,      // ABSOLUTE — from event count
            stateStrengthScore: g.stateStrengthScore,
            firstHitDate:    g.firstHitDate,
            lastHitDate:     g.lastHitDate,
            lastHitAt:       now,
            sourceClasses:   g.sourceClasses,
            _rebuiltAt:      now,
            _rebuildNote:    'Rebuilt from event ledger by rebuild-hit-memory.',
            _eventCount:     g.hitCount,
            _eventVerified:  true,
            updatedAt:       now,
          }, { merge: true });  // merge to preserve fields like createdAt, dreamEntryId
          repairedMappings++;
          if (repairExamples.length < 5) {
            const existing = aggBySemKey.get(g.semanticKey);
            if (existing && existing.hitCount !== g.hitCount) {
              repairExamples.push({
                term:     g.termLabel,
                number:   g.number,
                state:    g.state,
                before:   { hitCount: existing.hitCount, straight: existing.straight, boxed: existing.boxed },
                after:    { hitCount: g.hitCount, straight: g.straightCount, boxed: g.boxedCount },
              });
            }
          }
        }
        await bw.commit();
      }

      // Deprecate non-canonical legacy docs
      for (let i = 0; i < nonCanonicalDocs.length; i += BATCH) {
        const bw = db.batch();
        for (const { id } of nonCanonicalDocs.slice(i, i + BATCH)) {
          bw.set(db.collection('personalHitMappings').doc(id), {
            _deprecated:   true,
            _deprecatedAt: now,
            _deprecateNote: 'Non-canonical doc ID format. Counts migrated to canonical doc by rebuild-hit-memory.',
          }, { merge: true });
          deprecatedDocs++;
        }
        await bw.commit();
      }
    }

    return NextResponse.json({
      ok:                    true,
      scannedEvents:         seen.size + allEvents.length,   // includes dupes before dedup
      distinctEvents,
      aggregateGroups:       groups.size,
      mismatchedAggregates:  mismatchedAggregates.length,
      matchedAggregates:     matchedAggregates.length,
      newGroups:             newGroups.length,
      nonCanonicalDocs:      nonCanonicalDocs.length,
      deprecatedDuplicates:  deprecatedDocs,
      repairedMappings,
      repairRan:             repair,
      examples:              repair ? repairExamples : mismatchedAggregates.slice(0, 5),
    });

  } catch (err) {
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, quota: q, error: q ? 'Firebase quota exhausted.' : err instanceof Error ? err.message : 'Rebuild failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
