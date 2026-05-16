import { postgresDictionariesStorage } from '@/lib/storage/postgres/dictionaries';
import { postgresBacktestsStorage } from '@/lib/storage/postgres/backtests';
import { postgresDreamEntriesStorage } from '@/lib/storage/postgres/dreamEntries';
import { postgresDreamersStorage } from '@/lib/storage/postgres/dreamers';
import { postgresDreamWindowsStorage } from '@/lib/storage/postgres/dreamWindows';
import { postgresOwnerProfilesStorage } from '@/lib/storage/postgres/ownerProfiles';
import { postgresHitEvidenceStorage } from '@/lib/storage/postgres/hitEvidence';
import type { Sweet404StorageAdapter } from '@/lib/storage/types';

function unsupportedStorageOperation(operation: string): never {
  throw new Error(
    `Postgres storage adapter is not implemented for ${operation}. Keep DREAM_DB_PROVIDER=firebase until this route is migrated.`
  );
}

export const postgresStorageAdapter: Sweet404StorageAdapter = {
  provider: 'postgres',
  ownerProfiles: postgresOwnerProfilesStorage,
  dreamers: postgresDreamersStorage,
  dreamEntries: postgresDreamEntriesStorage,
  dreamWindows: postgresDreamWindowsStorage,
  dreamHits: {
    createDreamHit: async () => unsupportedStorageOperation('dreamHits.createDreamHit'),
    listDreamHits: async () => unsupportedStorageOperation('dreamHits.listDreamHits'),
    upsertPersonalHitMapping: async () =>
      unsupportedStorageOperation('dreamHits.upsertPersonalHitMapping'),
    listPersonalHitMappings: async () =>
      unsupportedStorageOperation('dreamHits.listPersonalHitMappings'),
    deletePersonalHitMappingById: async () =>
      unsupportedStorageOperation('dreamHits.deletePersonalHitMappingById'),
  },
  backtests: {
    createBacktestDreamIntake: postgresBacktestsStorage.createBacktestDreamIntake,
    listBacktestDreams: postgresBacktestsStorage.listBacktestDreams,
    bulkCreateBacktestResults: postgresBacktestsStorage.bulkCreateBacktestResults,
    listBacktestResultsForDream: postgresBacktestsStorage.listBacktestResultsForDream,
    getBacktestDreamById: postgresBacktestsStorage.getBacktestDreamById,
    listBacktestHitsForDream: postgresBacktestsStorage.listBacktestHitsForDream,
    listAllBacktestHits: async () =>
      unsupportedStorageOperation('backtests.listAllBacktestHits'),
    getBacktestSummaryForDream: postgresBacktestsStorage.getBacktestSummaryForDream,
    runBacktestReplayForDream: async () =>
      unsupportedStorageOperation('backtests.runBacktestReplayForDream'),
    listSafeBacktestSummariesForDreams: async () =>
      unsupportedStorageOperation('backtests.listSafeBacktestSummariesForDreams'),
    saveEngineReplayHits: async () =>
      unsupportedStorageOperation('backtests.saveEngineReplayHits'),
    updateBacktestDreamStatus: postgresBacktestsStorage.updateBacktestDreamStatus,
  },
  fellBefore: {
    listLotteryResults: async () => unsupportedStorageOperation('fellBefore.listLotteryResults'),
    listLotteryResultsByDateRange: async () =>
      unsupportedStorageOperation('fellBefore.listLotteryResultsByDateRange'),
    createLotteryResult: async () =>
      unsupportedStorageOperation('fellBefore.createLotteryResult'),
    bulkCreateLotteryResults: async () =>
      unsupportedStorageOperation('fellBefore.bulkCreateLotteryResults'),
    deleteLotteryResultById: async () =>
      unsupportedStorageOperation('fellBefore.deleteLotteryResultById'),
  },
  dictionaries: postgresDictionariesStorage,
};
