import { getStorageAdapter } from '@/lib/storage/provider';
import type { DreamersStorage } from '@/lib/storage/types';

export const dreamersStorage: DreamersStorage = getStorageAdapter().dreamers;

export const createDreamer: DreamersStorage['createDreamer'] = (...args) =>
  getStorageAdapter().dreamers.createDreamer(...args);
export const updateDreamer: DreamersStorage['updateDreamer'] = (...args) =>
  getStorageAdapter().dreamers.updateDreamer(...args);
export const listDreamers: DreamersStorage['listDreamers'] = (...args) =>
  getStorageAdapter().dreamers.listDreamers(...args);
export const getDreamer: DreamersStorage['getDreamer'] = (...args) =>
  getStorageAdapter().dreamers.getDreamer(...args);
export const deleteDreamerCascade: DreamersStorage['deleteDreamerCascade'] = (...args) =>
  getStorageAdapter().dreamers.deleteDreamerCascade(...args);
