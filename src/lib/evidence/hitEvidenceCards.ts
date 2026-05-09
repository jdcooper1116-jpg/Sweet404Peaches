import { buildCanonicalHitEventKey, choosePrimaryHitType, normalizeHitType } from '@/lib/evidence/hitEvidenceKeys';
import type {
  GroupedHitEvidenceCard,
  HitEvidenceCardInput,
} from '@/lib/evidence/hitEvidenceTypes';

function displayIdentity(event: HitEvidenceCardInput): string {
  return [
    event.ownerUid,
    event.dreamerId,
    event.sourceType,
    event.sourceContextId,
    event.state,
    event.drawDate,
    event.drawTime,
    event.gameType,
    event.normalizedResult,
  ].map(value => String(value ?? '').trim()).join(':');
}

export function groupHitCardsByCanonicalIdentity(
  events: HitEvidenceCardInput[]
): GroupedHitEvidenceCard[] {
  const groups = new Map<string, HitEvidenceCardInput[]>();

  for (const event of events) {
    const key = displayIdentity(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return Array.from(groups.entries()).map(([canonicalIdentity, group]) => {
    const primaryHitType = choosePrimaryHitType(group.map(event => event.hitType));
    const primary =
      group.find(event => normalizeHitType(event.hitType) === primaryHitType) ?? group[0];

    return {
      ...primary,
      hitType: primaryHitType,
      canonicalIdentity:
        canonicalIdentity || buildCanonicalHitEventKey({ ...primary, hitType: primaryHitType }),
      evidenceCount: group.reduce((sum, event) => sum + (event.evidenceCount ?? 1), 0),
      relatedEvents: group,
    };
  });
}
