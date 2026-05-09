import { getStorageAdapter } from '@/lib/storage/provider';
import type { FellBeforeStorage } from '@/lib/storage/types';

export const fellBeforeStorage: FellBeforeStorage = getStorageAdapter().fellBefore;

export const listLotteryResults: FellBeforeStorage['listLotteryResults'] = (...args) =>
  getStorageAdapter().fellBefore.listLotteryResults(...args);
export const listLotteryResultsByDateRange: FellBeforeStorage['listLotteryResultsByDateRange'] = (
  ...args
) => getStorageAdapter().fellBefore.listLotteryResultsByDateRange(...args);
export const createLotteryResult: FellBeforeStorage['createLotteryResult'] = (...args) =>
  getStorageAdapter().fellBefore.createLotteryResult(...args);
export const bulkCreateLotteryResults: FellBeforeStorage['bulkCreateLotteryResults'] = (...args) =>
  getStorageAdapter().fellBefore.bulkCreateLotteryResults(...args);
export const deleteLotteryResultById: FellBeforeStorage['deleteLotteryResultById'] = (...args) =>
  getStorageAdapter().fellBefore.deleteLotteryResultById(...args);
