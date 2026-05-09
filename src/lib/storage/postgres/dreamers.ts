import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/postgres';
import type { Dreamer, DreamerInput } from '@/lib/types';
import type { DreamersStorage, StorageId } from '@/lib/storage/types';

type PostgresDreamer = Awaited<ReturnType<typeof prisma.dreamer.findFirst>>;

function stringArrayFromJson(value: Prisma.JsonValue | null, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map(String);
}

function toDreamer(row: NonNullable<PostgresDreamer>): Dreamer {
  return {
    id: row.id,
    ownerUid: row.ownerUid,
    displayName: row.displayName,
    alias: row.alias ?? undefined,
    preferredStates: stringArrayFromJson(row.preferredStates, []),
    preferredGames: stringArrayFromJson(row.preferredGames, []) as Dreamer['preferredGames'],
    preferredDrawTimes: stringArrayFromJson(
      row.preferredDrawTimes,
      []
    ) as Dreamer['preferredDrawTimes'],
    isGuest: row.isGuest,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt as unknown as Dreamer['createdAt'],
    updatedAt: row.updatedAt as unknown as Dreamer['updatedAt'],
  };
}

async function ensureOwner(ownerUid: string): Promise<void> {
  await prisma.owner.upsert({
    where: { uid: ownerUid },
    create: { uid: ownerUid },
    update: {},
  });
}

export const postgresDreamersStorage: DreamersStorage = {
  async createDreamer(ownerUid: string, input: DreamerInput): Promise<StorageId> {
    await ensureOwner(ownerUid);

    const row = await prisma.dreamer.create({
      data: {
        ownerUid,
        displayName: input.displayName,
        alias: input.alias || null,
        preferredStates: input.preferredStates ?? [],
        preferredGames: input.preferredGames ?? [],
        preferredDrawTimes: input.preferredDrawTimes ?? [],
        isGuest: input.isGuest ?? false,
        notes: input.notes ?? '',
      },
    });

    return row.id;
  },

  async updateDreamer(id: string, patch: Partial<DreamerInput>): Promise<void> {
    await prisma.dreamer.update({
      where: { id },
      data: {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.alias !== undefined ? { alias: patch.alias || null } : {}),
        ...(patch.preferredStates !== undefined
          ? { preferredStates: patch.preferredStates }
          : {}),
        ...(patch.preferredGames !== undefined ? { preferredGames: patch.preferredGames } : {}),
        ...(patch.preferredDrawTimes !== undefined
          ? { preferredDrawTimes: patch.preferredDrawTimes }
          : {}),
        ...(patch.isGuest !== undefined ? { isGuest: patch.isGuest } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes ?? '' } : {}),
      },
    });
  },

  async listDreamers(ownerUid: string): Promise<Dreamer[]> {
    const rows = await prisma.dreamer.findMany({
      where: { ownerUid },
      orderBy: { displayName: 'asc' },
      take: 100,
    });

    return rows.map(toDreamer);
  },

  async getDreamer(id: string): Promise<Dreamer | null> {
    const row = await prisma.dreamer.findUnique({ where: { id } });
    return row ? toDreamer(row) : null;
  },

  async deleteDreamerCascade(dreamerId: string): Promise<void> {
    await prisma.$transaction([
      prisma.personalHitMapping.deleteMany({ where: { dreamerId } }),
      prisma.personalHitEvent.deleteMany({ where: { dreamerId } }),
      prisma.dreamHit.deleteMany({ where: { dreamerId } }),
      prisma.activeDreamWindow.deleteMany({ where: { dreamerId } }),
      prisma.dreamCandidate.deleteMany({ where: { dreamerId } }),
      prisma.dreamTerm.deleteMany({ where: { dreamerId } }),
      prisma.dreamEntry.deleteMany({ where: { dreamerId } }),
      prisma.dreamer.deleteMany({ where: { id: dreamerId } }),
    ]);
  },
};
