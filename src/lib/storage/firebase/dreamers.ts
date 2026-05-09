import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { Dreamer, DreamerInput } from '@/lib/types';
import type { DreamersStorage, StorageId } from '@/lib/storage/types';

function mapAdminDreamer(id: string, data: FirebaseFirestore.DocumentData): Dreamer {
  return {
    id,
    ...data,
  } as Dreamer;
}

export const firebaseDreamersStorage: DreamersStorage = {
  async createDreamer(ownerUid: string, input: DreamerInput): Promise<StorageId> {
    const db = getAdminDb();
    const now = Timestamp.now();
    const payload: Record<string, unknown> = {
      ownerUid,
      displayName: input.displayName,
      preferredStates: input.preferredStates ?? ['GA'],
      preferredGames: input.preferredGames ?? ['cash3', 'cash4'],
      preferredDrawTimes: input.preferredDrawTimes ?? ['midday', 'evening', 'night'],
      isGuest: Boolean(input.isGuest ?? false),
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
    };

    if (input.alias) payload.alias = input.alias;

    const ref = await db.collection('dreamers').add(payload);
    return ref.id;
  },

  async updateDreamer(id: string, patch: Partial<DreamerInput>): Promise<void> {
    const db = getAdminDb();
    const payload: Record<string, unknown> = {
      ...patch,
      updatedAt: Timestamp.now(),
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) delete payload[key];
    });

    await db.collection('dreamers').doc(id).update(payload);
  },

  async listDreamers(ownerUid: string): Promise<Dreamer[]> {
    const db = getAdminDb();
    const snap = await db
      .collection('dreamers')
      .where('ownerUid', '==', ownerUid)
      .limit(100)
      .get();

    const dreamers = snap.docs.map((doc) => mapAdminDreamer(doc.id, doc.data()));
    return dreamers.sort((a, b) =>
      String(a.displayName ?? '').localeCompare(String(b.displayName ?? ''))
    );
  },

  async getDreamer(id: string): Promise<Dreamer | null> {
    const db = getAdminDb();
    const snap = await db.collection('dreamers').doc(id).get();
    if (!snap.exists) return null;
    return mapAdminDreamer(snap.id, snap.data() ?? {});
  },

  async deleteDreamerCascade(dreamerId: string): Promise<void> {
    const db = getAdminDb();
    const batch = db.batch();

    batch.delete(db.collection('dreamers').doc(dreamerId));

    for (const collectionName of [
      'dreamEntries',
      'activeDreamWindows',
      'dreamHits',
      'personalHitMappings',
    ]) {
      const snap = await db.collection(collectionName).where('dreamerId', '==', dreamerId).get();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
    }

    await batch.commit();
  },
};
