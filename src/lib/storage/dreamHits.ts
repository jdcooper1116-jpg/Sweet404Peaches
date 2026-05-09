import { getStorageAdapter } from '@/lib/storage/provider';
import type { DreamHitsStorage } from '@/lib/storage/types';

export const dreamHitsStorage: DreamHitsStorage = getStorageAdapter().dreamHits;

export const createDreamHit: DreamHitsStorage['createDreamHit'] = (...args) =>
  getStorageAdapter().dreamHits.createDreamHit(...args);
export const listDreamHits: DreamHitsStorage['listDreamHits'] = (...args) =>
  getStorageAdapter().dreamHits.listDreamHits(...args);
export const upsertPersonalHitMapping: DreamHitsStorage['upsertPersonalHitMapping'] = (
  ...args
) => getStorageAdapter().dreamHits.upsertPersonalHitMapping(...args);
export const listPersonalHitMappings: DreamHitsStorage['listPersonalHitMappings'] = (...args) =>
  getStorageAdapter().dreamHits.listPersonalHitMappings(...args);
export const deletePersonalHitMappingById: DreamHitsStorage['deletePersonalHitMappingById'] = (
  ...args
) => getStorageAdapter().dreamHits.deletePersonalHitMappingById(...args);
