/**
 * Sigil & Slumber — Active Dream Refresh  (v2.3)
 *
 * v2.3 changes:
 * - match_mode: "both" + filters: { match_mode: "both" } added to engine calls
 * - Hit type derived from candidate === winning_number, not engine's match_type
 * - match_type removed from dedup key (prevents duplicates when switching modes)
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

interface ActiveDreamWindowDoc {
  id: string;
  ownerUid: string;
  dreamEntryId: string;
  dreamerId: string;
  dreamerName: string;
  termLabel: string;
  number: string;
  gameType: 'cash3' | 'cash4' | 'pick3' | 'pick4';  // save-entry writes cash3/cash4
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
  ownerUid:           string;
  dreamWindowId:      string;
  activeWindowId:     string;   // alias for dreamWindowId
  dreamEntryId:       string;
  dreamerId:          string;
  dreamerName:        string;   // propagated from activeDreamWindow
  termLabel:          string;
  normalizedTerm:     string;
  // Raw fields (snake_case — preserved for backward compat)
  candidate:          string;
  winning_number:     string;
  game_type:          string;   // stored as cash3/cash4
  draw_date:          string;
  draw_time:          string;
  match_type:         string;
  // Normalized aliases (camelCase — for UI consumers)
  number:             string;
  candidateNumber:    string;
  winningNumber:      string;
  gameType:           string;
  drawDate:           string;
  drawTime:           string;
  hitType:            string;
  matchMode:          string;
  state:              string;
  is_verified:        boolean;
  source_name:        string;
  anchor_date:        string;
  lookahead_days:     number;
  lastRefreshSource:  string;
  detectedAt:         AdminTimestamp;
}

function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Dedup key — match_type intentionally excluded (see v2.3 change notes).
function hitKey(candidate: string, state: string, draw_date: string, draw_time: string): string {
  return [candidate, state, draw_date, draw_time].join('::');
}

function calcLookahead(activeStart: string, activeEnd: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const end   = today < activeEnd ? today : activeEnd;
  return Math.max(1, Math.ceil(
    (new Date(end).getTime() - new Date(activeStart).getTime()) / 86_400_000
  ) + 1);
}

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
    return {
      windowsChecked: 0, windowsWithNewHits: 0, totalNewHits: 0,
      engineCallsMade: 0, errors: [], checkedAt: new Date().toISOString(),
    };
  }

  type GroupKey = string;
  const groups = new Map<GroupKey, ActiveDreamWindowDoc[]>();
  for (const w of windows) {
    const key = `${w.gameType}::${w.activeStart}::${w.activeEnd}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  const existingSnap = await db
    .collection('dreamHits')
    .where('ownerUid', '==', ownerUid)
    .get();

  const existingHitsByWindow = new Map<string, Set<string>>();
  existingSnap.forEach(d => {
    const data = d.data() as DreamHitDoc;
    if (!existingHitsByWindow.has(data.dreamWindowId)) {
      existingHitsByWindow.set(data.dreamWindowId, new Set());
    }
    existingHitsByWindow
      .get(data.dreamWindowId)!
      .add(hitKey(data.candidate, data.state, data.draw_date, data.draw_time));
  });

  const now    = Timestamp.now();
  const errors: Array<{ context: string; error: string }> = [];
  let engineCallsMade = 0;

  const newHitsPerWindow = new Map<string, number>();
  const hitsToWrite: Array<{ docId: string; data: DreamHitDoc }> = [];

  for (const [groupKey, groupWindows] of groups.entries()) {
    const [gameType, activeStart, activeEnd] = groupKey.split('::') as ['cash3'|'cash4'|'pick3'|'pick4', string, string];
    const lookahead_days = calcLookahead(activeStart, activeEnd);
    const states = (gameType === 'cash3' || gameType === 'pick3') ? PICK3_STATES : PICK4_STATES;

    const candidateSet = new Set(groupWindows.map(w => w.number));
    const candidates   = Array.from(candidateSet);

    const candidateWindowIndex = new Map<string, ActiveDreamWindowDoc[]>();
    for (const w of groupWindows) {
      if (!candidateWindowIndex.has(w.number)) candidateWindowIndex.set(w.number, []);
      candidateWindowIndex.get(w.number)!.push(w);
    }

    for (const state of states) {
      try {
        const response = await runBacktest({
          state,
          game_type:      (gameType as string) === 'cash3' ? 'pick3' : (gameType as string) === 'cash4' ? 'pick4' : gameType,
          anchor_date:    activeStart,
          lookahead_days,
          candidates,
          match_mode:     'both',
          filters:        { match_mode: 'both' },
          label:          `refresh::${gameType}::${state}`,
        } as any);

        engineCallsMade++;
        const hits: Array<EngineHit & { state: string }> =
          ((response as any).hits ?? []).map((h: EngineHit) => ({ ...h, state }));

        for (const hit of hits) {
          const matchingWindows = candidateWindowIndex.get(hit.candidate) ?? [];
          // Derive match type from digit comparison — do NOT use hit.match_type
          // which the engine sets to "both" for all hits in both mode.
          const actualMatchType = hit.candidate === hit.winning_number ? 'exact' : 'box';

          for (const w of matchingWindows) {
            const key = hitKey(hit.candidate, state, hit.draw_date, hit.draw_time);
            const existingKeys = existingHitsByWindow.get(w.id) ?? new Set();
            if (existingKeys.has(key)) continue;

            const normalizedTerm = normalizeTerm(w.termLabel);
            const hitType        = actualMatchType === 'exact' ? 'straight' : 'boxed';
            const hitDoc: DreamHitDoc = {
              ownerUid,
              dreamWindowId:    w.id,
              activeWindowId:   w.id,
              dreamEntryId:     w.dreamEntryId,
              dreamerId:        w.dreamerId,
              dreamerName:      w.dreamerName,   // copied from active window
              termLabel:        w.termLabel,
              normalizedTerm,
              // Raw fields — preserved for backward compat
              candidate:        hit.candidate,
              winning_number:   hit.winning_number,
              game_type:        gameType,            // app-facing: cash3/cash4
              draw_date:        hit.draw_date,
              draw_time:        hit.draw_time,
              match_type:       actualMatchType,
              // Normalized aliases — added for UI consumers
              number:           hit.candidate,
              candidateNumber:  hit.candidate,
              winningNumber:    hit.winning_number,
              gameType,
              drawDate:         hit.draw_date,
              drawTime:         hit.draw_time,
              hitType,
              matchMode:        hitType,
              state,
              is_verified:      hit.is_verified ?? false,
              source_name:      hit.source_name ?? '',
              anchor_date:      activeStart,
              lookahead_days,
              lastRefreshSource: 'lottery-engine',
              detectedAt:       now,
            };

            const docId = `${w.id}__${key.replace(/::/g, '_')}`;
            hitsToWrite.push({ docId, data: hitDoc });

            newHitsPerWindow.set(w.id, (newHitsPerWindow.get(w.id) ?? 0) + 1);

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

  const BATCH_SIZE = 400;
  for (let i = 0; i < hitsToWrite.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const { docId, data } of hitsToWrite.slice(i, i + BATCH_SIZE)) {
      batch.set(db.collection('dreamHits').doc(docId), data);
    }
    await batch.commit();
  }

  const windowUpdateBatch = db.batch();
  for (const w of windows) {
    const newHits = newHitsPerWindow.get(w.id) ?? 0;
    const total   = (w.lastHitCount ?? 0) + newHits;
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
