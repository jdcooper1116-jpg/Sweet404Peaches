import { prisma } from '@/lib/db/postgres';
import type { ActiveDreamWindow, GameType } from '@/lib/types';
import type { DreamWindowsStorage } from '@/lib/storage/types';

type PostgresWindow = Awaited<ReturnType<typeof prisma.activeDreamWindow.findFirst>>;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toActiveDreamWindow(row: NonNullable<PostgresWindow>): ActiveDreamWindow {
  return {
    id: row.id,
    ownerUid: row.ownerUid,
    dreamEntryId: row.dreamEntryId,
    dreamerId: row.dreamerId,
    dreamerName: row.dreamerName ?? '',
    termLabel: row.termLabel,
    number: row.numberText,
    gameType: row.gameType as GameType,
    boxedKey: row.boxedKey,
    activeStart: row.activeStart,
    activeEnd: row.activeEnd,
    isActive: row.isActive,
    statesTracked: stringArray(row.statesTracked),
    createdAt: row.createdAt as unknown as ActiveDreamWindow['createdAt'],
    updatedAt: row.updatedAt as unknown as ActiveDreamWindow['updatedAt'],
    lastCheckedAt: row.lastCheckedAt,
    lastHitCount: row.lastHitCount,
    newHitsSinceLastCheck: row.newHitsSinceLastCheck,
  } as ActiveDreamWindow;
}

export const postgresDreamWindowsStorage: DreamWindowsStorage = {
  async listActiveDreamWindows(
    ownerUid: string,
    options?: {
      dreamerId?: string;
      dreamEntryId?: string;
      gameType?: GameType;
      includeExpired?: boolean;
      limit?: number;
    }
  ): Promise<ActiveDreamWindow[]> {
    const today = todayDateString();
    const maxRows = Math.min(Math.max(options?.limit ?? 100, 1), 1000);

    const rows = await prisma.activeDreamWindow.findMany({
      where: {
        ownerUid,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
        ...(options?.dreamEntryId ? { dreamEntryId: options.dreamEntryId } : {}),
        ...(options?.gameType ? { gameType: options.gameType } : {}),
        ...(!options?.includeExpired ? { activeEnd: { gte: today } } : {}),
      },
      orderBy: [
        { activeEnd: 'asc' },
        { activeStart: 'desc' },
        { dreamerName: 'asc' },
        { termLabel: 'asc' },
        { numberText: 'asc' },
      ],
      take: maxRows,
    });

    return rows.map(toActiveDreamWindow);
  },

  async listActiveDreamWindowsForDate(
    ownerUid: string,
    date: string,
    options?: {
      dreamerId?: string;
      dreamEntryId?: string;
      gameType?: GameType;
      limit?: number;
    }
  ): Promise<ActiveDreamWindow[]> {
    const rows = await prisma.activeDreamWindow.findMany({
      where: {
        ownerUid,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
        ...(options?.dreamEntryId ? { dreamEntryId: options.dreamEntryId } : {}),
        ...(options?.gameType ? { gameType: options.gameType } : {}),
        activeStart: { lte: date },
        activeEnd: { gte: date },
      },
      orderBy: [
        { activeEnd: 'asc' },
        { activeStart: 'desc' },
        { dreamerName: 'asc' },
        { termLabel: 'asc' },
        { numberText: 'asc' },
      ],
      take: Math.min(Math.max(options?.limit ?? 100, 1), 1000),
    });

    return rows.map(toActiveDreamWindow);
  },
};
