import type {
  HitEvidenceIdentityInput,
  HitEvidenceValidationResult,
  ResolveHitDreamerInput,
  ResolvedHitDreamer,
} from '@/lib/evidence/hitEvidenceTypes';

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateHitEvidenceInput(
  input: Partial<HitEvidenceIdentityInput>
): HitEvidenceValidationResult {
  const errors: string[] = [];

  if (!nonEmpty(input.ownerUid)) errors.push('ownerUid is required');
  if (!nonEmpty(input.dreamerId)) errors.push('dreamerId is required');
  if (!nonEmpty(input.sourceType)) errors.push('sourceType is required');
  if (!nonEmpty(input.sourceContextId)) errors.push('sourceContextId is required');
  if (!nonEmpty(input.normalizedTerm)) errors.push('normalizedTerm is required');
  if (!nonEmpty(input.numberText)) errors.push('numberText is required');
  if (!nonEmpty(input.gameType)) errors.push('gameType is required');
  if (!nonEmpty(input.state)) errors.push('state is required');
  if (!nonEmpty(input.drawDate)) errors.push('drawDate is required');
  if (!nonEmpty(input.drawTime)) errors.push('drawTime is required');
  if (!nonEmpty(input.normalizedResult)) errors.push('normalizedResult is required');
  if (!nonEmpty(input.hitType)) errors.push('hitType is required');

  return { ok: errors.length === 0, errors };
}

function resolveCandidate(
  source: ResolvedHitDreamer['source'],
  candidate?: { dreamerId?: string | null; dreamerName?: string | null } | null
): ResolvedHitDreamer | null {
  if (!candidate?.dreamerId?.trim()) return null;
  const dreamerId = candidate.dreamerId.trim();
  return {
    dreamerId,
    dreamerName: candidate.dreamerName?.trim() || undefined,
    source,
    isOwnerSelf: dreamerId === 'owner-self',
  };
}

export function resolveHitDreamer(input: ResolveHitDreamerInput): ResolvedHitDreamer | null {
  return (
    resolveCandidate('explicit', input.explicit) ??
    resolveCandidate('dreamEntry', input.dreamEntry) ??
    resolveCandidate('backtestDream', input.backtestDream) ??
    resolveCandidate('activeWindow', input.activeWindow) ??
    (input.allowOwnerSelfFallback
      ? {
          dreamerId: 'owner-self',
          dreamerName: input.ownerSelfName?.trim() || undefined,
          source: 'owner-self',
          isOwnerSelf: true,
        }
      : null)
  );
}
