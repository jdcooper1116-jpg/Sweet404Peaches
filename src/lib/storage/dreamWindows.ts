import { getStorageAdapter } from '@/lib/storage/provider';
import type { DreamWindowsStorage } from '@/lib/storage/types';

export const dreamWindowsStorage: DreamWindowsStorage = getStorageAdapter().dreamWindows;

export const listActiveDreamWindows: DreamWindowsStorage['listActiveDreamWindows'] = (...args) =>
  getStorageAdapter().dreamWindows.listActiveDreamWindows(...args);
export const listActiveDreamWindowsForDate: DreamWindowsStorage['listActiveDreamWindowsForDate'] = (
  ...args
) => getStorageAdapter().dreamWindows.listActiveDreamWindowsForDate(...args);
