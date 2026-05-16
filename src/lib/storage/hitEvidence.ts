/**
 * src/lib/storage/hitEvidence.ts
 *
 * Server-side shim for hit evidence reads that need provider-awareness.
 *
 * listFellBeforeMappings — reads personal_hit_mappings in Postgres mode,
 * or falls back to Firestore personalHitMappings via the admin SDK.
 *
 * NOTE: This shim does NOT go through Sweet404StorageAdapter because
 * HitEvidenceStorage is not currently a slot on that interface. It
 * dispatches directly by provider to avoid adding an interface slot
 * before the full hit-memory migration is complete.
 */
import { getDreamDbProvider } from '@/lib/storage/provider';
import { postgresHitEvidenceStorage } from '@/lib/storage/postgres/hitEvidence';
import type { UnknownRecord } from '@/lib/storage/types';

export interface FellBeforeMapOptions {
  dreamerId?:      string;
  normalizedTerm?: string;
  limit?:          number;
}

/**
 * List personal hit mappings for fell-before display.
 *
 * Postgres mode: reads personal_hit_mappings via Prisma.
 *   Rows excluded: isDeprecated=true, isShadowedByCorrectedMapping=true.
 *
 * Firebase mode: returns null — caller must use Firestore directly.
 *   The fell-before route retains its Firestore path for firebase mode.
 */
export async function listFellBeforeMappings(
  ownerUid: string,
  options?: FellBeforeMapOptions
): Promise<UnknownRecord[] | null> {
  if (getDreamDbProvider() === 'postgres') {
    return postgresHitEvidenceStorage.listFellBeforeMappings(ownerUid, options);
  }
  return null; // firebase mode — caller uses Firestore
}
