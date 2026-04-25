/**
 * Sweet404Peaches — Active Dream Refresh
 *
 * Rewrites the Firestore access to use firebase-admin SDK directly,
 * which matches what the refresh API route passes in.
 *
 * The previous version imported from 'firebase/firestore' (client SDK)
 * but received a firebase-admin Firestore instance — a runtime mismatch
 * masked by a TypeScript cast. This version uses the admin SDK throughout.
 *
 * Leading zeros in candidate numbers are preserved throughout.
 * Hits are deduplicated — running twice produces no duplicate documents.
 * lastRefreshSource is now tracked on every window update.
 */

import type { firestore } from 'firebase-admin';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { runBacktest }         from './client';
import { isAllStatesResponse } from './types';
import type { EngineHit }      from './types';

// Use the admin Firestore type directly — no more client SDK cast
type AdminFirestore = firestore.Firestore;

// ─── Firestore document shapes ────────────────────────────────────────────────

interface ActiveDreamWindowDoc {
  id: string;
  ownerUid: string;
  dreamEntryId: string;
  dreamerId: string;
  dreamerName: string;
  termLabel: string;
  number: string;            // always string — leading zeros preserved
  gameType: 'pick3' | 'pick4';
  activeStart: string;       // YYYY-MM-DD
  activeEnd: string;         // YYYY-MM-DD
  isActive: boolean;
  statesTracked: string[];
  lastCheckedAt?: FirebaseFirestore.Timestamp | null;
  lastHitCount?: number;
  newHitsSinceLastCheck?: number;
  lastRefreshSource?: string;
}

interface DreamHitDoc {
  ownerUid: string;
  dreamWindowId: string;
  dreamEntryId: string;
  dreamerId: string;
  candidate: string;         // string — leading zeros intact
  state: string;
  draw_date: string;         // YYYY-MM-DD
  draw_time: string;
  winning_number: string;
  match_type: string;        // 'exact' | 'box'
  is_verified: boolean;
  source_name: string;
  game_type: 'pick3' | 'pick4';
  termLabel: string;
  anchor_date: string;
  lookahead_days: number;
  lastRefreshSource: string;
  detectedAt: FirebaseFirestore.Timestamp;
}

// ─── Dedup key ────────────────────────────────────────────────────────────────
// A hit is unique by candidate + state + draw_date + draw_time + match_type.
// String comparison preserves leading zeros correctly.

function hitKey(h: EngineHit & { state: string }): string {
  return [h.candidate, h.state, h.draw_date, h.draw_time, h.match_type].join('::');
}

// ─── Lookahead calculator ─────────────────────────────────────────────────────

function calcLookahead(activeStart: string, activeEnd: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const end   = today < activeEnd ? today : activeEnd;
  const days  = Math.max(
    1,
    Math.ceil((new Date(end).getTime() - new Date(activeStart).getTime()) / 86_400_000) + 1
  );
  return days;
}

// ─── Single window refresh ────────────────────────────────────────────────────

interface RefreshWindowResult {
  windowId: string;
  newHits: number;
  totalHits: number;
  error: string | null;
}

async function refreshOneWindow(
  db: AdminFirestore,
  window: ActiveDreamWindowDoc,
  ownerUid: string
): Promise<RefreshWindowResult> {
  const lookahead_days = calcLookahead(window.activeStart, window.activeEnd);
  const isAllStates    = window.statesTracked.length > 1 || window.statesTracked.includes('ALL');

  const engineBody = isAllStates
    ? {
        scope:          'all-states' as const,
        game_type:      window.gameType,
        anchor_date:    window.activeStart,
        lookahead_days,
        candidates:     [window.number],
        label:          window.termLabel,
      }
    : {
        state:          window.statesTracked[0] ?? 'GA',
        game_type:      window.gameType,
        anchor_date:    window.activeStart,
        lookahead_days,
        candidates:     [window.number],
        label:          window.termLabel,
      };

  let engineResponse;
  try {
    engineResponse = await runBacktest(engineBody);
  } catch (err: unknown) {
    return {
      windowId:  window.id,
      newHits:   0,
      totalHits: window.lastHitCount ?? 0,
      error:     err instanceof Error ? err.message : String(err),
    };
  }

  // Flatten hits from either response shape
  const rawHits: Array<EngineHit & { state: string }> = [];

  if (isAllStatesResponse(engineResponse)) {
    for (const h of engineResponse.combined_hits) rawHits.push(h);
  } else {
    const fallbackState = isAllStates ? 'UNKNOWN' : (window.statesTracked[0] ?? 'GA');
    for (const h of engineResponse.hits ?? []) rawHits.push({ ...h, state: fallbackState });
  }

  // Load existing hit keys for this window — admin SDK method-based API
  const existingHitsSnap = await db
    .collection('dreamHits')
    .where('ownerUid',      '==', ownerUid)
    .where('dreamWindowId', '==', window.id)
    .get();

  const existingKeys = new Set<string>();
  existingHitsSnap.forEach(d => {
    const data = d.data() as DreamHitDoc;
    existingKeys.add(
      [data.candidate, data.state, data.draw_date, data.draw_time, data.match_type].join('::')
    );
  });

  const now   = Timestamp.now();
  let newHits = 0;

  for (const hit of rawHits) {
    const key = hitKey(hit);
    if (existingKeys.has(key)) continue;

    // Deterministic document ID — dedup-safe across multiple runs
    const hitDocId  = `${window.id}__${key.replace(/::/g, '_')}`;

    const hitDoc: DreamHitDoc = {
      ownerUid,
      dreamWindowId:   window.id,
      dreamEntryId:    window.dreamEntryId,
      dreamerId:       window.dreamerId,
      candidate:       hit.candidate,       // string — leading zeros intact
      state:           hit.state,
      draw_date:       hit.draw_date,
      draw_time:       hit.draw_time,
      winning_number:  hit.winning_number,
      match_type:      hit.match_type,      // 'exact' | 'box'
      is_verified:     hit.is_verified ?? false,
      source_name:     hit.source_name ?? '',
      game_type:       window.gameType,
      termLabel:       window.termLabel,
      anchor_date:     window.activeStart,
      lookahead_days,
      lastRefreshSource: 'lottery-engine',
      detectedAt:      now,
    };

    await db.collection('dreamHits').doc(hitDocId).set(hitDoc);
    newHits++;
  }

  const totalHits = (window.lastHitCount ?? 0) + newHits;

  // Update the window — admin SDK method-based API
  await db.collection('activeDreamWindows').doc(window.id).update({
    lastCheckedAt:         now,
    lastHitCount:          totalHits,
    newHitsSinceLastCheck: newHits,
    lastRefreshSource:     'lottery-engine',
  });

  return { windowId: window.id, newHits, totalHits, error: null };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface RefreshAllResult {
  windowsChecked:     number;
  windowsWithNewHits: number;
  totalNewHits:       number;
  errors:             Array<{ windowId: string; error: string }>;
  checkedAt:          string;
}

/**
 * Refresh all active dream windows for the given owner.
 * Calls the lottery engine once per window, deduplicates hits,
 * and persists new hits to the dreamHits Firestore collection.
 *
 * Safe to call from a Vercel cron route or a manual UI trigger.
 */
export async function refreshAllActiveWindows(
  db: AdminFirestore,
  ownerUid: string,
  today: string   // YYYY-MM-DD
): Promise<RefreshAllResult> {
  // Load all active windows using admin SDK method-based API
  const windowsSnap = await db
    .collection('activeDreamWindows')
    .where('ownerUid', '==', ownerUid)
    .where('isActive', '==', true)
    .where('activeEnd', '>=', today)
    .get();

  const windows: ActiveDreamWindowDoc[] = windowsSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<ActiveDreamWindowDoc, 'id'>),
  }));

  if (windows.length === 0) {
    return {
      windowsChecked:     0,
      windowsWithNewHits: 0,
      totalNewHits:       0,
      errors:             [],
      checkedAt:          new Date().toISOString(),
    };
  }

  // Refresh windows sequentially — avoids hammering the engine
  const results: RefreshWindowResult[] = [];
  for (const window of windows) {
    results.push(await refreshOneWindow(db, window, ownerUid));
  }

  const errors             = results.filter(r => r.error !== null).map(r => ({ windowId: r.windowId, error: r.error! }));
  const windowsWithNewHits = results.filter(r => r.newHits > 0).length;
  const totalNewHits       = results.reduce((sum, r) => sum + r.newHits, 0);

  return {
    windowsChecked: windows.length,
    windowsWithNewHits,
    totalNewHits,
    errors,
    checkedAt: new Date().toISOString(),
  };
}