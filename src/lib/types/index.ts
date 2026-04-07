import type { Timestamp } from 'firebase/firestore';

export type GameType = 'cash3' | 'cash4';
export type DrawTime = 'midday' | 'evening' | 'night' | 'unknown';
export type HitType = 'straight' | 'boxed';
export type SourceType = 'manual' | 'paste' | 'upload' | 'auto';
export type DreamerScope = 'individual' | 'universal';

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
] as const;

export type USState = typeof US_STATES[number];

export interface OwnerProfile {
  uid: string;
  displayName: string;
  email: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Dreamer {
  id: string;
  ownerUid: string;
  displayName: string;
  alias?: string;
  avatarUrl?: string;
  preferredStates: string[];
  preferredGames: GameType[];
  preferredDrawTimes: DrawTime[];
  isGuest: boolean;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DreamerInput = Omit<
  Dreamer,
  'id' | 'ownerUid' | 'createdAt' | 'updatedAt'
>;

export interface ParsedLine {
  original: string;
  cleaned: string;
  terms: string[];
  numbers: string[];
  isNumbersOnly: boolean;
  lineIndex: number;
}

export interface TermMapping {
  term: string;
  normalizedTerm: string;
  relatedTerms: string[];
  cash3Numbers: string[];
  cash4Numbers: string[];
  archivedNumbers: string[];
  lineContexts: string[];
}

export interface ExtractedNumber {
  value: string;
  gameType: GameType | 'archive';
  associatedTerms: string[];
  raw: string;
  lineIndex: number;
}

export interface ParseResult {
  rawText: string;
  cleanedText: string;
  lines: ParsedLine[];
  termMappings: TermMapping[];
  allNumbers: ExtractedNumber[];
  cash3Numbers: string[];
  cash4Numbers: string[];
  archivedNumbers: string[];
}

export interface DreamEntry {
  id: string;
  ownerUid: string;
  dreamerId: string;
  dreamerName: string;
  rawText: string;
  cleanedText: string;
  dreamDate: string;
  uploadedAt: Timestamp;
  termMappings: TermMapping[];
  allNumbers: string[];
  activeWindowStart: string;
  activeWindowEnd: string;
  sourceType: SourceType;
  notes?: string;
  isReviewed: boolean;
}

export type DreamEntryInput = Omit<
  DreamEntry,
  'id' | 'ownerUid' | 'uploadedAt'
>;

export interface DreamTerm {
  id: string;
  ownerUid: string;
  label: string;
  normalizedLabel: string;
  category?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TermNumberMapping {
  id: string;
  ownerUid: string;
  termId: string;
  termLabel: string;
  number: string;
  gameType: GameType;
  source: 'dreambook' | 'manual' | 'parsed';
  confidenceBasis?: string;
  rawContext?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ActiveDreamWindow {
  id: string;
  ownerUid: string;
  dreamEntryId: string;
  dreamerId: string;
  dreamerName: string;
  termLabel: string;
  number: string;
  gameType: GameType;
  boxedKey: string;
  activeStart: string;
  activeEnd: string;
  isActive: boolean;
  statesTracked: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LotteryResult {
  id: string;
  ownerUid: string;
  state: string;
  date: string;
  gameType: GameType;
  drawTime: DrawTime;
  rawResult: string;
  normalizedResult: string;
  boxedKey: string;
  sourceType: SourceType;
  importedAt: Timestamp;
}

export interface DreamHit {
  id: string;
  ownerUid: string;
  dreamerId: string;
  dreamerName: string;
  dreamEntryId: string;
  termLabel?: string;
  trackedNumber: string;
  gameType: GameType;
  state: string;
  drawTime: DrawTime;
  drawDate: string;
  winningResult: string;
  hitType: HitType;
  sameDay: boolean;
  daysFromDream: number;
  isPersonalizedCandidate: boolean;
  createdAt: Timestamp;
}

export interface PersonalHitMapping {
  id: string;
  ownerUid: string;
  dreamerId: string;
  dreamerName: string;
  termId?: string;
  termLabel: string;
  number: string;
  gameType: GameType;
  hitType: HitType;
  state: string;
  drawTime: DrawTime;
  drawDate: string;
  sourceDreamEntryId: string;
  daysFromDream: number;
  hitCount: number;
  sameDay: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ScoreComponents {
  termOverlap: number;
  dreamOverlap: number;
  dreamerOverlap: number;
  priorHits: number;
  georgiaHits: number;
  allStateHits: number;
  boxedBehavior: number;
  straightBehavior: number;
  sameDayBehavior: number;
  universalGroupScore: number;
}

export interface HotNumber {
  number: string;
  gameType: GameType;
  score: number;
  rank: number;
  reasons: string[];
  activeTerms: string[];
  activeDreamers: string[];
  priorHitCount: number;
  georgiaHitCount: number;
  universalScore: number;
  termOverlapCount: number;
  dreamOverlapCount: number;
  dreamerOverlapCount: number;
  scoreComponents: ScoreComponents;
}

export interface PredictionSnapshot {
  id: string;
  ownerUid: string;
  dreamerScope: DreamerScope;
  generatedAt: Timestamp;
  stateFocus: string;
  gameFocus: GameType | 'both';
  hotNumbers: HotNumber[];
  explanations: Record<string, string[]>;
  scoreComponents: Record<string, ScoreComponents>;
}

export interface ConvergenceGroup {
  numbers: string[];
  terms: string[];
  dreamers: string[];
  convergenceScore: number;
  explanation: string;
}

export interface UniversalScopeSnapshot {
  id: string;
  ownerUid: string;
  generatedAt: Timestamp;
  activeWindowRange: { start: string; end: string };
  repeatedTerms: Array<{ term: string; dreamers: string[]; count: number }>;
  repeatedNumbers: Array<{
    number: string;
    terms: string[];
    dreamers: string[];
    count: number;
  }>;
  convergenceGroups: ConvergenceGroup[];
  rankedUniversalNumbers: HotNumber[];
  explanations: Record<string, string[]>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
  grounded: boolean;
  dataSnapshot?: Record<string, unknown>;
}

export interface ChatLog {
  id: string;
  ownerUid: string;
  dreamerScope: string;
  messages: ChatMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DateRange {
  start: string;
  end: string;
}

export type LoadState = 'idle' | 'loading' | 'success' | 'error';
