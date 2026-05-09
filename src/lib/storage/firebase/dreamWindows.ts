import { getAdminDb } from '@/lib/firebase/admin';
import type { ActiveDreamWindow, GameType } from '@/lib/types';
import type { DreamWindowsStorage } from '@/lib/storage/types';

function mapWindow(id: string, data: FirebaseFirestore.DocumentData): ActiveDreamWindow {
  return { id, ...data } as ActiveDreamWindow;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const firebaseDreamWindowsStorage: DreamWindowsStorage = {
  async listActiveDreamWindows(
    ownerUid: string,
    options?: {
      dreamerId?: string;
      dreamEntryId?: string;
      gameType?: GameType;
      includeExpired?: boolean;
      limit?: number;
    }
  ): Promise<ActiveDreamWindow[]> {
    const db = getAdminDb();
    const maxRows = Math.min(Math.max(options?.limit ?? 100, 1), 1000);
    const today = todayDateString();
    const dreamerId = options?.dreamerId?.trim();
    const dreamEntryId = options?.dreamEntryId?.trim();
    const gameType = options?.gameType;

    let query: any = db.collection('activeDreamWindows').where('ownerUid', '==', ownerUid);

    if (dreamerId) query = query.where('dreamerId', '==', dreamerId);
    if (dreamEntryId) query = query.where('dreamEntryId', '==', dreamEntryId);
    if (gameType === 'cash3' || gameType === 'cash4') {
      query = query.where('gameType', '==', gameType);
    }

    const shouldUseActiveEndQuery =
      !options?.includeExpired && !dreamerId && !dreamEntryId && !gameType;

    if (shouldUseActiveEndQuery) {
      query = query.where('activeEnd', '>=', today);
    }

    const snap = await query.limit(maxRows).get();
    let windows = snap.docs.map((doc: any) => mapWindow(doc.id, doc.data()));

    if (!options?.includeExpired && !shouldUseActiveEndQuery) {
      windows = windows.filter((window: any) => String(window.activeEnd ?? '') >= today);
    }

    return windows;
  },

  async listActiveDreamWindowsForDate(
    ownerUid: string,
    date: string,
    options?: {
      dreamerId?: string;
      dreamEntryId?: string;
      gameType?: GameType;
      limit?: number;
    }
  ): Promise<ActiveDreamWindow[]> {
    const windows = await this.listActiveDreamWindows(ownerUid, {
      ...options,
      includeExpired: true,
    });

    return windows.filter((window) => window.activeStart <= date && window.activeEnd >= date);
  },
};
