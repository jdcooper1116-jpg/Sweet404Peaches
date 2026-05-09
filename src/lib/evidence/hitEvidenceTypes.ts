export type HitEvidenceSourceType = 'live' | 'backtest' | 'replay';
export type CanonicalHitType = 'exact' | 'box';
export type HitMatchMode = CanonicalHitType | 'both';
export type EvidenceGameType = 'cash3' | 'cash4' | string;

export interface HitEvidenceDreamerSource {
  dreamerId?: string | null;
  dreamerName?: string | null;
}

export interface ResolveHitDreamerInput {
  explicit?: HitEvidenceDreamerSource | null;
  dreamEntry?: HitEvidenceDreamerSource | null;
  backtestDream?: HitEvidenceDreamerSource | null;
  activeWindow?: HitEvidenceDreamerSource | null;
  ownerSelfName?: string | null;
  allowOwnerSelfFallback?: boolean;
}

export interface ResolvedHitDreamer {
  dreamerId: string;
  dreamerName?: string;
  source: 'explicit' | 'dreamEntry' | 'backtestDream' | 'activeWindow' | 'owner-self';
  isOwnerSelf: boolean;
}

export interface HitEvidenceIdentityInput {
  ownerUid: string;
  dreamerId: string;
  sourceType: HitEvidenceSourceType;
  sourceContextId: string;
  normalizedTerm: string;
  numberText: string;
  gameType: EvidenceGameType;
  state: string;
  drawDate: string;
  drawTime: string;
  normalizedResult: string;
  hitType: CanonicalHitType | HitMatchMode;
}

export interface BacktestHitSourceContextInput {
  backtestDreamId: string;
  normalizedTerm: string;
  numberText: string;
  gameType: EvidenceGameType;
  state: string;
  drawDate: string;
  drawTime: string;
  normalizedResult: string;
  hitType: CanonicalHitType | HitMatchMode;
}

export interface LiveHitSourceContextInput {
  dreamEntryId?: string | null;
  sourceDreamEntryId?: string | null;
  activeWindowId?: string | null;
  normalizedTerm: string;
  numberText: string;
  gameType: EvidenceGameType;
  state: string;
  drawDate: string;
  drawTime: string;
  normalizedResult: string;
  hitType: CanonicalHitType | HitMatchMode;
}

export interface HitEvidenceValidationResult {
  ok: boolean;
  errors: string[];
}

export interface HitEvidenceCardInput extends HitEvidenceIdentityInput {
  id?: string;
  dreamerName?: string | null;
  termLabel?: string | null;
  rawResult?: string | null;
  resultBoxedKey?: string | null;
  dreamDate?: string | null;
  sourceLabel?: string | null;
  evidenceCount?: number;
}

export interface GroupedHitEvidenceCard extends HitEvidenceCardInput {
  canonicalIdentity: string;
  evidenceCount: number;
  relatedEvents: HitEvidenceCardInput[];
}
