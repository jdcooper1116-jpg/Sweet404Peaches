import * as firestore from '@/lib/firebase/firestore';
import type { Sweet404StorageAdapter } from '@/lib/storage/types';

export const firebaseStorageAdapter: Sweet404StorageAdapter = {
  provider: 'firebase',
  dreamers: {
    createDreamer: firestore.createDreamer,
    updateDreamer: firestore.updateDreamer,
    listDreamers: firestore.listDreamers,
    getDreamer: firestore.getDreamer,
    deleteDreamerCascade: firestore.deleteDreamerCascade,
  },
  dreamEntries: {
    createDreamEntry: firestore.createDreamEntry,
    createDreamEntryWithWindows: firestore.createDreamEntryWithWindows,
    listDreamEntries: firestore.listDreamEntries,
    getDreamEntry: firestore.getDreamEntry,
    getLatestDreamEntry: firestore.getLatestDreamEntry,
    deleteDreamEntryCascade: firestore.deleteDreamEntryCascade,
  },
  dreamWindows: {
    listActiveDreamWindows: firestore.listActiveDreamWindows,
    listActiveDreamWindowsForDate: firestore.listActiveDreamWindowsForDate,
  },
  dreamHits: {
    createDreamHit: firestore.createDreamHit,
    listDreamHits: firestore.listDreamHits,
    upsertPersonalHitMapping: firestore.upsertPersonalHitMapping,
    listPersonalHitMappings: firestore.listPersonalHitMappings,
    deletePersonalHitMappingById: firestore.deletePersonalHitMappingById,
  },
  backtests: {
    createBacktestDreamIntake: firestore.createBacktestDreamIntake,
    listBacktestDreams: firestore.listBacktestDreams,
    bulkCreateBacktestResults: firestore.bulkCreateBacktestResults,
    listBacktestResultsForDream: firestore.listBacktestResultsForDream,
    getBacktestDreamById: firestore.getBacktestDreamById,
    listBacktestHitsForDream: firestore.listBacktestHitsForDream,
    listAllBacktestHits: firestore.listAllBacktestHits,
    getBacktestSummaryForDream: firestore.getBacktestSummaryForDream,
    runBacktestReplayForDream: firestore.runBacktestReplayForDream,
    listSafeBacktestSummariesForDreams: firestore.listSafeBacktestSummariesForDreams,
    saveEngineReplayHits: firestore.saveEngineReplayHits,
  },
  fellBefore: {
    listLotteryResults: firestore.listLotteryResults,
    listLotteryResultsByDateRange: firestore.listLotteryResultsByDateRange,
    createLotteryResult: firestore.createLotteryResult,
    bulkCreateLotteryResults: firestore.bulkCreateLotteryResults,
    deleteLotteryResultById: firestore.deleteLotteryResultById,
  },
  dictionaries: {
    listTermNumberMappings: firestore.listTermNumberMappings,
    createTermNumberMapping: firestore.createTermNumberMapping,
    deleteTermNumberMappingById: firestore.deleteTermNumberMappingById,
    bulkDeleteManualDictionaryEntries: firestore.bulkDeleteManualDictionaryEntries,
  },
};
