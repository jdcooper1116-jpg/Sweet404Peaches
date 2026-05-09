import { getStorageAdapter } from '@/lib/storage/provider';
import type { BacktestsStorage } from '@/lib/storage/types';

export const backtestsStorage: BacktestsStorage = getStorageAdapter().backtests;

export const createBacktestDreamIntake: BacktestsStorage['createBacktestDreamIntake'] = (
  ...args
) => getStorageAdapter().backtests.createBacktestDreamIntake(...args);
export const listBacktestDreams: BacktestsStorage['listBacktestDreams'] = (...args) =>
  getStorageAdapter().backtests.listBacktestDreams(...args);
export const bulkCreateBacktestResults: BacktestsStorage['bulkCreateBacktestResults'] = (
  ...args
) => getStorageAdapter().backtests.bulkCreateBacktestResults(...args);
export const listBacktestResultsForDream: BacktestsStorage['listBacktestResultsForDream'] = (
  ...args
) => getStorageAdapter().backtests.listBacktestResultsForDream(...args);
export const getBacktestDreamById: BacktestsStorage['getBacktestDreamById'] = (...args) =>
  getStorageAdapter().backtests.getBacktestDreamById(...args);
export const listBacktestHitsForDream: BacktestsStorage['listBacktestHitsForDream'] = (
  ...args
) => getStorageAdapter().backtests.listBacktestHitsForDream(...args);
export const listAllBacktestHits: BacktestsStorage['listAllBacktestHits'] = (...args) =>
  getStorageAdapter().backtests.listAllBacktestHits(...args);
export const getBacktestSummaryForDream: BacktestsStorage['getBacktestSummaryForDream'] = (
  ...args
) => getStorageAdapter().backtests.getBacktestSummaryForDream(...args);
export const runBacktestReplayForDream: BacktestsStorage['runBacktestReplayForDream'] = (
  ...args
) => getStorageAdapter().backtests.runBacktestReplayForDream(...args);
export const listSafeBacktestSummariesForDreams: BacktestsStorage['listSafeBacktestSummariesForDreams'] = (
  ...args
) => getStorageAdapter().backtests.listSafeBacktestSummariesForDreams(...args);
export const saveEngineReplayHits: BacktestsStorage['saveEngineReplayHits'] = (...args) =>
  getStorageAdapter().backtests.saveEngineReplayHits(...args);
