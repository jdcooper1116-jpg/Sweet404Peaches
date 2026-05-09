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

export interface DreamersStorage {
  createDreamer(ownerUid: string, input: DreamerInput): Promise<StorageId>;
  updateDreamer(id: string, patch: Partial<DreamerInput>): Promise<void>;
  listDreamers(ownerUid: string): Promise<Dreamer[]>;
  getDreamer(id: string): Promise<Dreamer | null>;
  deleteDreamerCascade(dreamerId: string): Promise<void>;
}

export interface DreamEntriesStorage {
  createDreamEntry(ownerUid: string, input: DreamEntryInput): Promise<StorageId>;
  createDreamEntryWithWindows(
    ownerUid: string,
    input: Omit<DreamEntryInput, 'allNumbers' | 'activeWindowStart' | 'activeWindowEnd'>
  ): Promise<StorageId>;
  listDreamEntries(ownerUid: string): Promise<DreamEntry[]>;
  getDreamEntry(id: string): Promise<DreamEntry | null>;
  getLatestDreamEntry(ownerUid: string): Promise<UnknownRecord | null>;
  deleteDreamEntryCascade(dreamEntryId: string): Promise<void>;
}

export interface DreamWindowsStorage {
  listActiveDreamWindows(ownerUid: string): Promise<ActiveDreamWindow[]>;
  listActiveDreamWindowsForDate(
    ownerUid: string,
    date: string
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
  listBacktestDreams(ownerUid: string): Promise<UnknownRecord[]>;
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
  listTermNumberMappings(ownerUid: string): Promise<TermNumberMapping[]>;
  createTermNumberMapping(
    ownerUid: string,
    input: TermNumberMappingInput
  ): Promise<StorageId>;
  deleteTermNumberMappingById(mappingId: string): Promise<void>;
  bulkDeleteManualDictionaryEntries(): Promise<void>;
}

export interface Sweet404StorageAdapter {
  provider: DreamDbProvider;
  dreamers: DreamersStorage;
  dreamEntries: DreamEntriesStorage;
  dreamWindows: DreamWindowsStorage;
  dreamHits: DreamHitsStorage;
  backtests: BacktestsStorage;
  fellBefore: FellBeforeStorage;
  dictionaries: DictionariesStorage;
}
