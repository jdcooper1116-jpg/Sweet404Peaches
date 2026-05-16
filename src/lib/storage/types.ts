import type {
  ActiveDreamWindow,
  DreamEntry,
  DreamEntryInput,
  DreamHit,
  Dreamer,
  DreamerInput,
  GameType,
  HitType,
  LotteryResult,
  PersonalHitMapping,
  TermNumberMapping,
} from '@/lib/types';

export type DreamDbProvider = 'firebase' | 'postgres';

export type StorageId = string;

export type UnknownRecord = Record<string, unknown>;

export type LotteryResultInput = Omit<
  LotteryResult,
  'id' | 'ownerUid' | 'importedAt' | 'boxedKey'
>;

export type DreamHitInput = Omit<DreamHit, 'id' | 'ownerUid' | 'createdAt'>;

export type PersonalHitMappingInput = Omit<
  PersonalHitMapping,
  'id' | 'ownerUid' | 'createdAt' | 'updatedAt' | 'hitCount'
>;

export interface BacktestDreamIntakeInput {
  dreamDate: string;
  rawText: string;
  source: string;
  confidence: string;
  notes?: string;
  parseResult: unknown;
  dreamerId?: string;
  dreamerName?: string;
}

export interface BacktestResultInput extends LotteryResultInput {
  gameLabel?: string;
  bonusText?: string;
}

export interface EngineReplayHitInput {
  termLabel: string;
  number: string;
  gameType: GameType;
  state: string;
  drawDate: string;
  drawTime: string;
  normalizedResult: string;
  resultBoxedKey: string;
  hitType: HitType;
  daysFromDream: number;
  sameDay: boolean;
  is_verified: boolean;
  source_name: string;
}

export interface BacktestReplaySummary {
  totalHits: number;
  straightHits: number;
  boxedHits: number;
  uniqueStates: string[];
  bestState: string;
  bestTerm: string;
}

export interface TermNumberMappingInput {
  termLabel: string;
  number: string;
  gameType: GameType;
  source: 'dreambook' | 'manual' | 'parsed';
  confidenceBasis?: string;
  rawContext?: string;
}

export interface BacktestHitEvidenceInput {
  dreamerId: string;
  dreamerName?: string;
  dreamDate?: string;
  termLabel: string;
  normalizedTerm?: string;
  numberText: string;
  boxedKey?: string;
  gameType: GameType | string;
  state: string;
  drawDate: string;
  drawTime: string;
  rawResult?: string;
  normalizedResult: string;
  resultBoxedKey?: string;
  hitType: 'exact' | 'box' | 'straight' | 'boxed' | 'both' | string;
  daysFromDream?: number;
  sameDay?: boolean;
  isVerified?: boolean;
  sourceName?: string;
  replaySource?: string;
  metadata?: UnknownRecord;
}

export interface PersonalHitEventEvidenceInput {
  dreamerId: string;
  dreamerName?: string;
  sourceType: 'live' | 'backtest' | 'replay';
  dreamEntryId?: string;
  sourceDreamEntryId?: string;
  activeWindowId?: string;
  backtestDreamId?: string;
  sourceContextId?: string;
  termLabel: string;
  normalizedTerm?: string;
  numberText: string;
  boxedKey?: string;
  gameType: GameType | string;
  state: string;
  drawDate: string;
  drawTime: string;
  rawResult?: string;
  normalizedResult: string;
  resultBoxedKey?: string;
  hitType: 'exact' | 'box' | 'straight' | 'boxed' | 'both' | string;
  daysFromDream?: number;
  sameDay?: boolean;
  metadata?: UnknownRecord;
}

export interface HitEvidenceWriteResult {
  attempted: number;
  created: number;
}

export interface HitEvidenceStorage {
  bulkUpsertBacktestHits(
    ownerUid: string,
    backtestDreamId: string,
    hits: BacktestHitEvidenceInput[]
  ): Promise<HitEvidenceWriteResult>;
  listBacktestHitsForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord[]>;
  bulkUpsertPersonalHitEvents(
    ownerUid: string,
    events: PersonalHitEventEvidenceInput[]
  ): Promise<HitEvidenceWriteResult>;
  listHitEventsForDreamer(
    ownerUid: string,
    dreamerId: string,
    options?: { limit?: number }
  ): Promise<UnknownRecord[]>;
  listHitEventsForTerm(
    ownerUid: string,
    normalizedTerm: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<UnknownRecord[]>;
  listHitEventsForBacktestDream(
    ownerUid: string,
    backtestDreamId: string,
    options?: { limit?: number }
  ): Promise<UnknownRecord[]>;
  listHitEventsForDreamEntry(
    ownerUid: string,
    dreamEntryId: string,
    options?: { limit?: number }
  ): Promise<UnknownRecord[]>;
  rebuildPersonalHitMappingsFromEvents(
    ownerUid: string,
    options?: { dreamerId?: string }
  ): Promise<HitEvidenceWriteResult>;
  upsertPersonalHitMappingsFromEvents(
    ownerUid: string,
    options?: { dreamerId?: string }
  ): Promise<HitEvidenceWriteResult>;
  listFellBeforeMappings(
    ownerUid: string,
    options?: { dreamerId?: string; normalizedTerm?: string; limit?: number }
  ): Promise<UnknownRecord[]>;
  upsertBacktestSummary(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null>;
  rebuildBacktestSummary(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null>;
}

export interface DreamersStorage {
  createDreamer(ownerUid: string, input: DreamerInput): Promise<StorageId>;
  updateDreamer(id: string, patch: Partial<DreamerInput>): Promise<void>;
  listDreamers(ownerUid: string): Promise<Dreamer[]>;
  getDreamer(id: string): Promise<Dreamer | null>;
  deleteDreamerCascade(dreamerId: string): Promise<void>;
}

export interface OwnerProfileRecord {
  ownerUid: string;
  displayName: string;
  email?: string;
  metadata?: UnknownRecord | null;
  createdAt?: unknown;
  updatedAt: unknown;
}

export interface OwnerProfileInput {
  displayName: string;
  email?: string;
  metadata?: UnknownRecord;
}

export interface OwnerProfilesStorage {
  getOwnerProfile(ownerUid: string): Promise<OwnerProfileRecord | null>;
  upsertOwnerProfile(ownerUid: string, input: OwnerProfileInput): Promise<void>;
}

export interface DreamEntriesStorage {
  createDreamEntry(ownerUid: string, input: DreamEntryInput): Promise<StorageId>;
  createDreamEntryWithWindows(
    ownerUid: string,
    input: Omit<DreamEntryInput, 'allNumbers' | 'activeWindowStart' | 'activeWindowEnd'>
  ): Promise<StorageId>;
  listDreamEntries(
    ownerUid: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<DreamEntry[]>;
  getDreamEntry(id: string): Promise<DreamEntry | null>;
  getLatestDreamEntry(
    ownerUid: string,
    options?: { dreamerId?: string }
  ): Promise<UnknownRecord | null>;
  deleteDreamEntryCascade(dreamEntryId: string): Promise<void>;
}

export interface DreamWindowsStorage {
  listActiveDreamWindows(
    ownerUid: string,
    options?: {
      dreamerId?: string;
      dreamEntryId?: string;
      gameType?: GameType;
      includeExpired?: boolean;
      limit?: number;
    }
  ): Promise<ActiveDreamWindow[]>;
  listActiveDreamWindowsForDate(
    ownerUid: string,
    date: string,
    options?: {
      dreamerId?: string;
      dreamEntryId?: string;
      gameType?: GameType;
      limit?: number;
    }
  ): Promise<ActiveDreamWindow[]>;
}

export interface DreamHitsStorage {
  createDreamHit(ownerUid: string, input: DreamHitInput): Promise<StorageId>;
  listDreamHits(ownerUid: string): Promise<DreamHit[]>;
  upsertPersonalHitMapping(
    ownerUid: string,
    input: PersonalHitMappingInput
  ): Promise<void>;
  listPersonalHitMappings(ownerUid: string): Promise<PersonalHitMapping[]>;
  deletePersonalHitMappingById(mappingId: string): Promise<void>;
}

export interface BacktestsStorage {
  createBacktestDreamIntake(
    ownerUid: string,
    input: BacktestDreamIntakeInput
  ): Promise<StorageId>;
  listBacktestDreams(
    ownerUid: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<UnknownRecord[]>;
  bulkCreateBacktestResults(
    ownerUid: string,
    backtestDreamId: string,
    rows: BacktestResultInput[]
  ): Promise<void>;
  listBacktestResultsForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord[]>;
  getBacktestDreamById(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null>;
  listBacktestHitsForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord[]>;
  listAllBacktestHits(ownerUid: string): Promise<UnknownRecord[]>;
  getBacktestSummaryForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null>;
  runBacktestReplayForDream(ownerUid: string, backtestDreamId: string): Promise<unknown>;
  listSafeBacktestSummariesForDreams(
    ownerUid: string,
    dreams: UnknownRecord[]
  ): Promise<UnknownRecord[]>;
  saveEngineReplayHits(
    ownerUid: string,
    backtestDreamId: string,
    dreamDate: string,
    hits: EngineReplayHitInput[]
  ): Promise<BacktestReplaySummary>;
  updateBacktestDreamStatus(
    ownerUid: string,
    backtestDreamId: string,
    status: string
  ): Promise<void>;
}

export interface FellBeforeStorage {
  listLotteryResults(ownerUid: string, maxRows?: number): Promise<LotteryResult[]>;
  listLotteryResultsByDateRange(
    ownerUid: string,
    start: string,
    end: string
  ): Promise<LotteryResult[]>;
  createLotteryResult(ownerUid: string, input: LotteryResultInput): Promise<StorageId>;
  bulkCreateLotteryResults(ownerUid: string, rows: LotteryResultInput[]): Promise<void>;
  deleteLotteryResultById(resultId: string): Promise<void>;
}

export interface DictionariesStorage {
  listTermNumberMappings(
    ownerUid: string,
    options?: {
      dreamerId?: string;
      term?: string;
      number?: string;
      gameType?: GameType;
      source?: string;
      limit?: number;
    }
  ): Promise<TermNumberMapping[]>;
  createTermNumberMapping(
    ownerUid: string,
    input: TermNumberMappingInput
  ): Promise<StorageId>;
  deleteTermNumberMappingById(ownerUid: string, mappingId: string): Promise<void>;
  bulkDeleteManualDictionaryEntries(ownerUid: string): Promise<void>;
}

export interface Sweet404StorageAdapter {
  provider: DreamDbProvider;
  ownerProfiles: OwnerProfilesStorage;
  dreamers: DreamersStorage;
  dreamEntries: DreamEntriesStorage;
  dreamWindows: DreamWindowsStorage;
  dreamHits: DreamHitsStorage;
  backtests: BacktestsStorage;
  fellBefore: FellBeforeStorage;
  dictionaries: DictionariesStorage;
}
