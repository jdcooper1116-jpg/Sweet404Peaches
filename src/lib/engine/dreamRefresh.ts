/**
 * Sweet404Peaches — Active Dream Refresh
 *
 * BATCHED approach: instead of calling the engine once per window per state
 * (50 windows × 37 states = 1,850 calls), we group all active candidates
 * by game type, then call the engine once per state per game type
 * (37 + 36 = 73 calls total).
 *
 * Each engine call sends ALL active candidates for that game/state at once.
 * Hits are matched back to their originating windows by candidate number.
 */

import type { firestore } from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { runBacktest } from './client';
import type { EngineHit } from './types';

type AdminFirestore = firestore.Firestore;
type AdminTimestamp = ReturnType<typeof Timestamp.now>;

const PICK3_STATES = [
  'AZ','CA','CO','CT','DE','DC','FL','GA','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MO','NH','NJ','NM','NY','NC','OH','OK','OR',
  'PA','RI','SC','TN','TX','VT','VA','WV','WI',
];
const PICK4_STATES = PICK3_STATES.filter(s => s !== 'AZ' && s !== 'MN');

// ─── Firestore shapes ─────────────────────────────────────────────────────────

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

function hitKey(candidate: string, state: string, draw_date: string, draw_time: string, match_type: string): string {
  return [candidate, state, draw_date, draw_time, match_type].join('::');
}

function calcLookahead(activeStart: string, activeEnd: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const end   = today < activeEnd ? today : activeEnd;
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(activeStart).getTime()) / 86_400_000) + 1);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface RefreshAllResult {
  windowsChecked: number;
  windowsWithNewHits: number;
  totalNewHits: number;
  engineCallsMade: number;
  errors: Array<{ context: string; error: string }>;
  checkedAt: string;
}

export async function refreshAllActiveWindows(
  db: AdminFirestore,
  ownerUid: string,
  today: string
): Promise<RefreshAllResult> {
  // 1. Load all active windows
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
    return { windowsChecked: 0, windowsWithNewHits: 0, totalNewHits: 0, engineCallsMade: 0, errors: [], checkedAt: new Date().toISOString() };
  }

  // 2. Group windows by gameType + anchorDate combination
  type GroupKey = string; // `${gameType}::${activeStart}::${activeEnd}`
  const groups = new Map<GroupKey, ActiveDreamWindowDoc[]>();
  for (const w of windows) {
    const key = `${w.gameType}::${w.activeStart}::${w.activeEnd}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  // 3. Load ALL existing hit keys for this owner upfront (one query)
  const existingSnap = await db
    .collection('dreamHits')
    .where('ownerUid', '==', ownerUid)
    .get();

  // Map: windowId → Set of hit keys
  const existingHitsByWindow = new Map<string, Set<string>>();
  existingSnap.forEach(d => {
    const data = d.data() as DreamHitDoc;
    if (!existingHitsByWindow.has(data.dreamWindowId)) {
      existingHitsByWindow.set(data.dreamWindowId, new Set());
    }
    existingHitsByWindow.get(data.dreamWindowId)!.add(
      hitKey(data.candidate, data.state, data.draw_date, data.draw_time, data.match_type)
    );
  });

  const now = Timestamp.now();
  const errors: Array<{ context: string; error: string }> = [];
  let engineCallsMade = 0;

  // Track new hits per window
  const newHitsPerWindow = new Map<string, number>();
  const hitsToWrite: Array<{ docId: string; data: DreamHitDoc }> = [];

  // 4. For each group, call engine once per state with ALL candidates
  for (const [groupKey, groupWindows] of groups.entries()) {
    const [gameType, activeStart, activeEnd] = groupKey.split('::') as ['pick3'|'pick4', string, string];
    const lookahead_days = calcLookahead(activeStart, activeEnd);
    const states = gameType === 'pick3' ? PICK3_STATES : PICK4_STATES;

    // Unique candidates for this group
    const candidateSet = new Set(groupWindows.map(w => w.number));
    const candidates   = Array.from(candidateSet);

    // Build candidate → windows index for fast lookup
    const candidateWindowIndex = new Map<string, ActiveDreamWindowDoc[]>();
    for (const w of groupWindows) {
      if (!candidateWindowIndex.has(w.number)) candidateWindowIndex.set(w.number, []);
      candidateWindowIndex.get(w.number)!.push(w);
    }

    // One engine call per state
    for (const state of states) {
      try {
        const response = await runBacktest({
          state,
          game_type:   (gameType as string) === 'cash3' ? 'pick3' : (gameType as string) === 'cash4' ? 'pick4' : gameType,
          anchor_date: activeStart,
          lookahead_days,
          candidates,
          label:       `refresh::${gameType}::${state}`,
        });

        engineCallsMade++;
        const hits: Array<EngineHit & { state: string }> =
          ((response as any).hits ?? []).map((h: EngineHit) => ({ ...h, state }));

        // Match each hit back to the windows tracking that candidate
        for (const hit of hits) {
          const matchingWindows = candidateWindowIndex.get(hit.candidate) ?? [];
          for (const w of matchingWindows) {
            const key = hitKey(hit.candidate, state, hit.draw_date, hit.draw_time, hit.match_type);
            const existingKeys = existingHitsByWindow.get(w.id) ?? new Set();
            if (existingKeys.has(key)) continue;

            const hitDoc: DreamHitDoc = {
              ownerUid,
              dreamWindowId:    w.id,
              dreamEntryId:     w.dreamEntryId,
              dreamerId:        w.dreamerId,
              candidate:        hit.candidate,
              state,
              draw_date:        hit.draw_date,
              draw_time:        hit.draw_time,
              winning_number:   hit.winning_number,
              match_type:       hit.match_type,
              is_verified:      hit.is_verified ?? false,
              source_name:      hit.source_name ?? '',
              game_type:        gameType,
              termLabel:        w.termLabel,
              anchor_date:      activeStart,
              lookahead_days,
              lastRefreshSource: 'lottery-engine',
              detectedAt:       now,
            };

            hitsToWrite.push({
              docId: `${w.id}__${key.replace(/::/g, '_')}`,
              data:  hitDoc,
            });

            // Track for window update
            newHitsPerWindow.set(w.id, (newHitsPerWindow.get(w.id) ?? 0) + 1);

            // Add to local dedup set so same hit isn't written twice
            if (!existingHitsByWindow.has(w.id)) existingHitsByWindow.set(w.id, new Set());
            existingHitsByWindow.get(w.id)!.add(key);
          }
        }
      } catch (err: unknown) {
        errors.push({
          context: `${gameType}::${state}::${activeStart}`,
          error:   err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 5. Write all new hits in batches of 500 (Firestore batch limit)
  const BATCH_SIZE = 400;
  for (let i = 0; i < hitsToWrite.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const { docId, data } of hitsToWrite.slice(i, i + BATCH_SIZE)) {
      batch.set(db.collection('dreamHits').doc(docId), data);
    }
    await batch.commit();
  }

  // 6. Update all windows with their new hit counts
  const windowUpdateBatch = db.batch();
  for (const w of windows) {
    const newHits  = newHitsPerWindow.get(w.id) ?? 0;
    const total    = (w.lastHitCount ?? 0) + newHits;
    windowUpdateBatch.update(db.collection('activeDreamWindows').doc(w.id), {
      lastCheckedAt:         now,
      lastHitCount:          total,
      newHitsSinceLastCheck: newHits,
      lastRefreshSource:     'lottery-engine',
    });
  }
  await windowUpdateBatch.commit();

  const windowsWithNewHits = Array.from(newHitsPerWindow.values()).filter(n => n > 0).length;
  const totalNewHits       = Array.from(newHitsPerWindow.values()).reduce((a, b) => a + b, 0);

  return {
    windowsChecked: windows.length,
    windowsWithNewHits,
    totalNewHits,
    engineCallsMade,
    errors,
    checkedAt: new Date().toISOString(),
  };
}
