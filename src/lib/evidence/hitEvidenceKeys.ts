import type {
  BacktestHitSourceContextInput,
  CanonicalHitType,
  HitEvidenceIdentityInput,
  HitMatchMode,
  LiveHitSourceContextInput,
} from '@/lib/evidence/hitEvidenceTypes';

function cleanKeyPart(value: unknown): string {
  return String(value ?? '').trim();
}

export function sortedDigits(value: string): string {
  return Array.from(value).sort().join('');
}

export function buildBoxedKey(value: string): string {
  return sortedDigits(value);
}

export function normalizeHitType(hitType: CanonicalHitType | HitMatchMode | string): CanonicalHitType {
  const normalized = String(hitType).trim().toLowerCase();
  if (normalized === 'exact' || normalized === 'straight') return 'exact';
  if (normalized === 'box' || normalized === 'boxed') return 'box';
  if (normalized === 'both') return 'exact';
  return 'box';
}

export function choosePrimaryHitType(hitTypes: Array<CanonicalHitType | HitMatchMode | string>): CanonicalHitType {
  const normalized = hitTypes.map(normalizeHitType);
  return normalized.includes('exact') ? 'exact' : 'box';
}

export function buildBacktestHitSourceContextId(input: BacktestHitSourceContextInput): string {
  return [
    'backtest',
    input.backtestDreamId,
    input.normalizedTerm,
    input.numberText,
    input.gameType,
    input.state,
    input.drawDate,
    input.drawTime,
    input.normalizedResult,
    normalizeHitType(input.hitType),
  ].map(cleanKeyPart).join(':');
}

export function buildLiveHitSourceContextId(input: LiveHitSourceContextInput): string {
  const dreamSourceId = input.dreamEntryId || input.sourceDreamEntryId;
  const windowOrTerm = input.activeWindowId || input.normalizedTerm;

  return [
    'live',
    dreamSourceId,
    windowOrTerm,
    input.numberText,
    input.gameType,
    input.state,
    input.drawDate,
    input.drawTime,
    input.normalizedResult,
    normalizeHitType(input.hitType),
  ].map(cleanKeyPart).join(':');
}

export function buildCanonicalHitEventKey(input: HitEvidenceIdentityInput): string {
  return [
    input.ownerUid,
    input.dreamerId,
    input.sourceType,
    input.sourceContextId,
    input.normalizedTerm,
    input.numberText,
    input.gameType,
    input.state,
    input.drawDate,
    input.drawTime,
    input.normalizedResult,
    normalizeHitType(input.hitType),
  ].map(cleanKeyPart).join(':');
}
