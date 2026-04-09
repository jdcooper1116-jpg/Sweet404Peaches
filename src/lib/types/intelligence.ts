export type PromotionTier =
  | 'Canonize'
  | 'Promote'
  | 'Watch'
  | 'Emerging'
  | 'Lock'
  | 'Strong'
  | 'Early';

export type LearningTier =
  | 'Heavy Boost'
  | 'Strong Boost'
  | 'Light Boost'
  | 'No Boost';

export type FamilyPatternTag =
  | 'triple'
  | 'double'
  | 'double-double'
  | 'quad'
  | 'triple-plus-single'
  | 'all-different'
  | 'other'
  | 'unknown';

export type StateStrengthRow = {
  state: string;
  hits: number;
  strength?: number;
  numberCount?: number;
  termCount?: number;
};

export type TermStrengthRow = {
  term: string;
  hits: number;
  strength?: number;
  stateCount?: number;
  numberCount?: number;
};

export type FamilyAnalyticsRow = {
  familyKey: string;
  sampleNumbers: string[];
  reversals: string[];
  gameTypes: string[];
  totalHits: number;
  straightHits: number;
  boxedHits: number;
  totalStrength: number;
  patternTag: FamilyPatternTag;
  stateCount: number;
  termCount: number;
  topStates: StateStrengthRow[];
  topTerms: TermStrengthRow[];
};

export type EvidenceTermCandidate = {
  term: string;
  totalHits: number;
  straight: number;
  boxed: number;
  stateCount: number;
  numberCount: number;
  gameTypes: string[];
  backtestTermBoost: number;
  familyBoost: number;
  promotionScore: number;
  promotionTier: PromotionTier;
};

export type EvidenceComboCandidate = {
  term: string;
  number: string;
  state: string;
  gameType: string;
  hitCount: number;
  straightCount: number;
  boxedCount: number;
  stateStrengthScore: number;
  promotionScore: number;
  promotionTier: PromotionTier;
  backtestStateBoost: number;
  backtestTermBoost: number;
  familyBoost: number;
  recencyBoost: number;
};

export type BoostedRecommendationRow = {
  term: string;
  number: string;
  state: string;
  gameType: string;
  forecastScore: number;
  boostedScore: number;
  learningBoost: number;
  learningTier: LearningTier;
  learningReasons: string[];
  confidenceTier?: string;
};

export type BoostedStateGroup = {
  state: string;
  rows: BoostedRecommendationRow[];
  boostedScore: number;
  totalLearningBoost: number;
  topLearningTier: LearningTier | string;
};

export type IntegritySnapshot = Record<string, number>;
