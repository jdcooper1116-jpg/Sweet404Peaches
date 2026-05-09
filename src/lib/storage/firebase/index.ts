import * as firestore from '@/lib/firebase/firestore';
import { firebaseBacktestsStorage } from '@/lib/storage/firebase/backtests';
import { firebaseDictionariesStorage } from '@/lib/storage/firebase/dictionaries';
import { firebaseDreamEntriesStorage } from '@/lib/storage/firebase/dreamEntries';
import { firebaseDreamersStorage } from '@/lib/storage/firebase/dreamers';
import { firebaseDreamWindowsStorage } from '@/lib/storage/firebase/dreamWindows';
import type { Sweet404StorageAdapter } from '@/lib/storage/types';

export const firebaseStorageAdapter: Sweet404StorageAdapter = {
  provider: 'firebase',
  dreamers: firebaseDreamersStorage,
  dreamEntries: firebaseDreamEntriesStorage,
  dreamWindows: firebaseDreamWindowsStorage,
  dreamHits: {
    createDreamHit: firestore.createDreamHit,
    listDreamHits: firestore.listDreamHits,
    upsertPersonalHitMapping: firestore.upsertPersonalHitMapping,
    listPersonalHitMappings: firestore.listPersonalHitMappings,
    deletePersonalHitMappingById: firestore.deletePersonalHitMappingById,
  },
  backtests: {
    createBacktestDreamIntake: firebaseBacktestsStorage.createBacktestDreamIntake,
    listBacktestDreams: firebaseBacktestsStorage.listBacktestDreams,
    bulkCreateBacktestResults: firestore.bulkCreateBacktestResults,
    listBacktestResultsForDream: firestore.listBacktestResultsForDream,
    getBacktestDreamById: firebaseBacktestsStorage.getBacktestDreamById,
    listBacktestHitsForDream: firebaseBacktestsStorage.listBacktestHitsForDream,
    listAllBacktestHits: firestore.listAllBacktestHits,
    getBacktestSummaryForDream: firebaseBacktestsStorage.getBacktestSummaryForDream,
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
  dictionaries: firebaseDictionariesStorage,
};
