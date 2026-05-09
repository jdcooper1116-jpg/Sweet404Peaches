import { getStorageAdapter } from '@/lib/storage/provider';
import type { DictionariesStorage } from '@/lib/storage/types';

export const dictionariesStorage: DictionariesStorage = getStorageAdapter().dictionaries;

export const listTermNumberMappings: DictionariesStorage['listTermNumberMappings'] = (...args) =>
  getStorageAdapter().dictionaries.listTermNumberMappings(...args);
export const createTermNumberMapping: DictionariesStorage['createTermNumberMapping'] = (
  ...args
) => getStorageAdapter().dictionaries.createTermNumberMapping(...args);
export const deleteTermNumberMappingById: DictionariesStorage['deleteTermNumberMappingById'] = (
  ...args
) => getStorageAdapter().dictionaries.deleteTermNumberMappingById(...args);
export const bulkDeleteManualDictionaryEntries: DictionariesStorage['bulkDeleteManualDictionaryEntries'] = (
  ...args
) => getStorageAdapter().dictionaries.bulkDeleteManualDictionaryEntries(...args);
