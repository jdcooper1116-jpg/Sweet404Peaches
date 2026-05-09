import { getStorageAdapter } from '@/lib/storage/provider';
import type { OwnerProfilesStorage } from '@/lib/storage/types';

export const ownerProfilesStorage: OwnerProfilesStorage = getStorageAdapter().ownerProfiles;

export const getOwnerProfile: OwnerProfilesStorage['getOwnerProfile'] = (...args) =>
  getStorageAdapter().ownerProfiles.getOwnerProfile(...args);

export const upsertOwnerProfile: OwnerProfilesStorage['upsertOwnerProfile'] = (...args) =>
  getStorageAdapter().ownerProfiles.upsertOwnerProfile(...args);
