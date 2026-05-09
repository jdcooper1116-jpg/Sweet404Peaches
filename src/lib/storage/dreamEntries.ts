import { getStorageAdapter } from '@/lib/storage/provider';
import type { DreamEntriesStorage } from '@/lib/storage/types';

export const dreamEntriesStorage: DreamEntriesStorage = getStorageAdapter().dreamEntries;

export const createDreamEntry: DreamEntriesStorage['createDreamEntry'] = (...args) =>
  getStorageAdapter().dreamEntries.createDreamEntry(...args);
export const createDreamEntryWithWindows: DreamEntriesStorage['createDreamEntryWithWindows'] = (
  ...args
) => getStorageAdapter().dreamEntries.createDreamEntryWithWindows(...args);
export const listDreamEntries: DreamEntriesStorage['listDreamEntries'] = (...args) =>
  getStorageAdapter().dreamEntries.listDreamEntries(...args);
export const getDreamEntry: DreamEntriesStorage['getDreamEntry'] = (...args) =>
  getStorageAdapter().dreamEntries.getDreamEntry(...args);
export const getLatestDreamEntry: DreamEntriesStorage['getLatestDreamEntry'] = (...args) =>
  getStorageAdapter().dreamEntries.getLatestDreamEntry(...args);
export const deleteDreamEntryCascade: DreamEntriesStorage['deleteDreamEntryCascade'] = (
  ...args
) => getStorageAdapter().dreamEntries.deleteDreamEntryCascade(...args);
