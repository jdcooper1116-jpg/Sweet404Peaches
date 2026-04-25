/**
 * Sweet404Peaches — Active Dream Refresh
 *
 * Calls the lottery engine in single-state mode for each state tracked
 * by a window. The engine does not accept scope:"all-states" directly —
 * the fan-out must be done here, the same way the /api/backtest bridge
 * does it for the backtesting UI.
 *
 * Leading zeros in candidate numbers are preserved throughout.
 * Hits are deduplicated — running twice produces no duplicate documents.
 */

import type { firestore } from 'firebase-admin';
import { Timestamp }      from 'firebase-admin/firestore';
import { runBacktest }    from './client';
import type { EngineHit } from './types';

type AdminFirestore = firestore.Firestore;
type AdminTimestamp = ReturnType<typeof Timestamp.now>;

// ─── States that have pick3/pick4 daily games ────────────────────────────────
// Used when a window has statesTracked: [...US_STATES] (all states)
const PICK3_STATES = [
  'AZ','CA','CO','CT','DE','DC','FL','GA','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MO','NH','NJ','NM','NY','NC','OH','OK','OR',
  'PA','RI','SC','TN','TX','VT','VA','WV','WI',
];
const PICK4_STATES = PICK3_STATES.filter(s => s !== 'AZ' && s !== 'MN');

function getStatesForGame(gameType: 'pick3' | 'pick4'): string[] {
  return gameType === 'pick3' ? PICK3_STATES : PICK4_STATES;
}

// ─── Firestore document shapes ────────────────────────────────────────────────

interface ActiveDreamWindowDoc {
  id: string;
  ownerUid: string;
  dreamEntryId: string;
  dreamerId: string;
  dreamerName: string;
  termLabel: string;
  number: string;
  gameType: 'pick3' | 'pick4';
  activeStart: string;
  activeEnd: string;
  isActive: boolean;
  statesTracked: string[];
  lastCheckedAt?: AdminTimestamp | null;
  lastHitCount?: number;
  newHitsSinceLastCheck?: number;
  lastRefreshSource?: string;
}

interface DreamHitDoc {
  ownerUid: string;
  dreamWindowId: string;
  dreamEntryId: string;
  dreamerId: string;
  candidate: string;
  state: string;
  draw_date: string;
  draw_time: string;
  winning_number: string;
  match_type: string;
  is_verified: boolean;
  source_name: string;
  game_type: 'pick3' | 'pick4';
  termLabel: string;
  anchor_date: string;
  lookahead_days: number;
  lastRefreshSource: string;
  detectedAt: AdminTimestamp;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hitKey(candidate: string, state: string, draw_date: string, draw_time: string, match_type: string): string {
  return [candidate, state, draw_date, draw_time, match_type].join('::');
}

function calcLookahead(activeStart: string, activeEnd: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const end   = today < activeEnd ? today : activeEnd;
  return Math.max(
    1,
    Math.ceil((new Date(end).getTime() - new Date(activeStart).getTime()) / 86_400_000) + 1
  );
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

  // Determine which states to check
  // If statesTracked has many entries (full US_STATES), use our curated list
  // If statesTracked has 1-3 entries, use exactly those
  const isAllStates = window.statesTracked.length > 5;
  const statesToCheck: string[] = isAllStates
    ? getStatesForGame(window.gameType)
    : window.statesTracked.length > 0
    ? window.statesTracked
    : ['GA'];

  // Collect hits across all states — call engine once per state (single-state mode)
  const rawHits: Array<EngineHit & { state: string }> = [];
  const stateErrors: string[] = [];

  for (const state of statesToCheck) {
    try {
      const response = await runBacktest({
        state,                          // single-state — engine requires this
        game_type:      window.gameType,
        anchor_date:    window.activeStart,
        lookahead_days,
        candidates:     [window.number],
        label:          window.termLabel,
      });

      // Single-state response has .hits array
      const hits = (response as any).hits ?? [];
      for (const h of hits) {
        rawHits.push({ ...h, state });
      }
    } catch (err: unknown) {
      // One state failing should not abort the whole window
      stateErrors.push(`${state}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Load existing hit keys for deduplication
  const existingSnap = await db
    .collection('dreamHits')
    .where('ownerUid',      '==', ownerUid)
    .where('dreamWindowId', '==', window.id)
    .get();

  const existingKeys = new Set<string>();
  existingSnap.forEach(d => {
    const data = d.data() as DreamHitDoc;
    existingKeys.add(hitKey(data.candidate, data.state, data.draw_date, data.draw_time, data.match_type));
  });

  const now   = Timestamp.now();
  let newHits = 0;

  for (const hit of rawHits) {
    const key = hitKey(hit.candidate, hit.state, hit.draw_date, hit.draw_time, hit.match_type);
    if (existingKeys.has(key)) continue;

    const hitDoc: DreamHitDoc = {
      ownerUid,
      dreamWindowId:    window.id,
      dreamEntryId:     window.dreamEntryId,
      dreamerId:        window.dreamerId,
      candidate:        hit.candidate,        // string — leading zeros intact
      state:            hit.state,
      draw_date:        hit.draw_date,
      draw_time:        hit.draw_time,
      winning_number:   hit.winning_number,
      match_type:       hit.match_type,       // 'exact' | 'box'
      is_verified:      hit.is_verified ?? false,
      source_name:      hit.source_name ?? '',
      game_type:        window.gameType,
      termLabel:        window.termLabel,
      anchor_date:      window.activeStart,
      lookahead_days,
      lastRefreshSource: 'lottery-engine',
      detectedAt:       now,
    };

    await db
      .collection('dreamHits')
      .doc(`${window.id}__${key.replace(/::/g, '_')}`)
      .set(hitDoc);
    newHits++;
  }

  const totalHits = (window.lastHitCount ?? 0) + newHits;

  await db.collection('activeDreamWindows').doc(window.id).update({
    lastCheckedAt:         now,
    lastHitCount:          totalHits,
    newHitsSinceLastCheck: newHits,
    lastRefreshSource:     'lottery-engine',
  });

  const errorSummary = stateErrors.length > 0
    ? `${stateErrors.length} state(s) failed: ${stateErrors.slice(0, 3).join('; ')}`
    : null;

  return { windowId: window.id, newHits, totalHits, error: errorSummary };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface RefreshAllResult {
  windowsChecked:     number;
  windowsWithNewHits: number;
  totalNewHits:       number;
  errors:             Array<{ windowId: string; error: string }>;
  checkedAt:          string;
}

export async function refreshAllActiveWindows(
  db: AdminFirestore,
  ownerUid: string,
  today: string
): Promise<RefreshAllResult> {
  const snap = await db
    .collection('activeDreamWindows')
    .where('ownerUid', '==', ownerUid)
    .where('isActive', '==', true)
    .where('activeEnd', '>=', today)
    .get();

  const windows: ActiveDreamWindowDoc[] = snap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<ActiveDreamWindowDoc, 'id'>),
  }));

  if (windows.length === 0) {
    return { windowsChecked: 0, windowsWithNewHits: 0, totalNewHits: 0, errors: [], checkedAt: new Date().toISOString() };
  }

  const results: RefreshWindowResult[] = [];
  for (const window of windows) {
    results.push(await refreshOneWindow(db, window, ownerUid));
  }

  return {
    windowsChecked:     windows.length,
    windowsWithNewHits: results.filter(r => r.newHits > 0).length,
    totalNewHits:       results.reduce((sum, r) => sum + r.newHits, 0),
    errors:             results.filter(r => r.error !== null).map(r => ({ windowId: r.windowId, error: r.error! })),
    checkedAt:          new Date().toISOString(),
  };
}
