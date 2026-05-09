import { getAdminDb } from '@/lib/firebase/admin';
import type { OwnerProfilesStorage } from '@/lib/storage/types';

export const firebaseOwnerProfilesStorage: OwnerProfilesStorage = {
  async getOwnerProfile(ownerUid) {
    const db = getAdminDb();
    const snap = await db.collection('ownerProfiles').doc(ownerUid).get();

    if (!snap.exists) return null;

    const data = snap.data() ?? {};
    return {
      ownerUid,
      displayName: typeof data.displayName === 'string' ? data.displayName : '',
      email: typeof data.email === 'string' ? data.email : undefined,
      updatedAt: data.updatedAt ?? null,
      createdAt: data.createdAt,
      metadata: null,
    };
  },

  async upsertOwnerProfile(ownerUid, input) {
    const db = getAdminDb();
    await db.collection('ownerProfiles').doc(ownerUid).set(
      {
        ownerUid,
        displayName: input.displayName.trim(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  },
};
