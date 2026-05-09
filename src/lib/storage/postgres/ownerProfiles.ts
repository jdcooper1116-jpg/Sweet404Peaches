import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/postgres';
import type { OwnerProfileRecord, OwnerProfilesStorage, UnknownRecord } from '@/lib/storage/types';

function metadataToJson(metadata: UnknownRecord | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata || Object.keys(metadata).length === 0) return undefined;
  return metadata as Prisma.InputJsonObject;
}

function metadataFromJson(value: Prisma.JsonValue | null): UnknownRecord | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as UnknownRecord;
}

function toOwnerProfileRecord(row: {
  uid: string;
  displayName: string | null;
  email: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): OwnerProfileRecord {
  return {
    ownerUid: row.uid,
    displayName: row.displayName ?? '',
    email: row.email ?? undefined,
    metadata: metadataFromJson(row.metadata),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const postgresOwnerProfilesStorage: OwnerProfilesStorage = {
  async getOwnerProfile(ownerUid) {
    const row = await prisma.owner.findUnique({
      where: { uid: ownerUid },
    });

    return row ? toOwnerProfileRecord(row) : null;
  },

  async upsertOwnerProfile(ownerUid, input) {
    const metadata = metadataToJson(input.metadata);

    await prisma.owner.upsert({
      where: { uid: ownerUid },
      create: {
        uid: ownerUid,
        displayName: input.displayName.trim(),
        email: input.email,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      update: {
        displayName: input.displayName.trim(),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  },
};
