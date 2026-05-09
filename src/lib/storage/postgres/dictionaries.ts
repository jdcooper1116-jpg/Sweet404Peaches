import { prisma } from '@/lib/db/postgres';
import type { GameType, TermNumberMapping } from '@/lib/types';
import type { DictionariesStorage, StorageId, TermNumberMappingInput } from '@/lib/storage/types';

type PostgresTermNumberMapping = Awaited<ReturnType<typeof prisma.termNumberMapping.findFirst>>;

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

function toTermNumberMapping(
  row: NonNullable<PostgresTermNumberMapping>
): TermNumberMapping {
  return {
    id: row.id,
    sourceDocId: row.id,
    ownerUid: row.ownerUid,
    dreamerId: row.dreamerId,
    dreamerName: row.dreamerName ?? '',
    termId: '',
    termLabel: row.termLabel,
    normalizedTerm: row.normalizedTerm,
    number: row.numberText,
    numberText: row.numberText,
    boxedKey: row.boxedKey,
    gameType: row.gameType as GameType,
    source: row.source ?? 'manual',
    confidenceBasis: row.confidenceBasis ?? '',
    rawContext: row.rawContext ?? '',
    dreamEntryId: row.dreamEntryId ?? '',
    sourceDreamEntryId: row.sourceDreamEntryId ?? '',
    backtestDreamId: row.backtestDreamId ?? '',
    dreamDate: row.dreamDate ?? '',
    createdAt: row.createdAt as unknown as TermNumberMapping['createdAt'],
    updatedAt: row.updatedAt as unknown as TermNumberMapping['updatedAt'],
  } as TermNumberMapping;
}

async function ensureOwner(ownerUid: string): Promise<void> {
  await prisma.owner.upsert({
    where: { uid: ownerUid },
    create: { uid: ownerUid },
    update: {},
  });
}

export const postgresDictionariesStorage: DictionariesStorage = {
  async listTermNumberMappings(
    ownerUid: string,
    options?: {
      dreamerId?: string;
      term?: string;
      number?: string;
      gameType?: GameType;
      source?: string;
      limit?: number;
    }
  ): Promise<TermNumberMapping[]> {
    const rows = await prisma.termNumberMapping.findMany({
      where: {
        ownerUid,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
        ...(options?.number ? { numberText: options.number } : {}),
        ...(options?.gameType ? { gameType: options.gameType } : {}),
        ...(options?.source ? { source: options.source } : {}),
        ...(options?.term
          ? {
              OR: [
                { termLabel: { contains: options.term, mode: 'insensitive' } },
                { normalizedTerm: { contains: options.term.toLowerCase(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ termLabel: 'asc' }, { numberText: 'asc' }],
      take: Math.min(options?.limit ?? 500, 1000),
    });

    return rows.map(toTermNumberMapping);
  },

  async createTermNumberMapping(
    ownerUid: string,
    input: TermNumberMappingInput
  ): Promise<StorageId> {
    await ensureOwner(ownerUid);

    const dreamerId = (input as any).dreamerId || 'owner-self';
    const dreamerName = (input as any).dreamerName || (dreamerId === 'owner-self' ? 'Owner / Self' : '');
    const termLabel = input.termLabel.trim();
    const normalizedTerm = termLabel.toLowerCase().trim();
    const numberText = String(input.number ?? '').trim();
    const boxedKey = sortedDigits(numberText);

    const row = await prisma.termNumberMapping.upsert({
      where: {
        ownerUid_dreamerId_normalizedTerm_numberText_gameType: {
          ownerUid,
          dreamerId,
          normalizedTerm,
          numberText,
          gameType: input.gameType,
        },
      },
      create: {
        ownerUid,
        dreamerId,
        dreamerName,
        termLabel,
        normalizedTerm,
        numberText,
        boxedKey,
        gameType: input.gameType,
        source: input.source ?? 'manual',
        confidenceBasis: input.confidenceBasis ?? '',
        rawContext: input.rawContext ?? '',
        dreamDate: (input as any).dreamDate || null,
        sourceDreamEntryId: (input as any).sourceDreamEntryId || null,
        dreamEntryId: (input as any).sourceDreamEntryId || null,
        backtestDreamId: (input as any).backtestDreamId || null,
      },
      update: {
        dreamerName,
        termLabel,
        boxedKey,
        source: input.source ?? 'manual',
        confidenceBasis: input.confidenceBasis ?? '',
        rawContext: input.rawContext ?? '',
        dreamDate: (input as any).dreamDate || null,
        sourceDreamEntryId: (input as any).sourceDreamEntryId || null,
        dreamEntryId: (input as any).sourceDreamEntryId || null,
        backtestDreamId: (input as any).backtestDreamId || null,
      },
    });

    return row.id;
  },

  async deleteTermNumberMappingById(ownerUid: string, mappingId: string): Promise<void> {
    await prisma.termNumberMapping.deleteMany({
      where: { ownerUid, id: mappingId },
    });
  },

  async bulkDeleteManualDictionaryEntries(ownerUid: string): Promise<void> {
    await prisma.termNumberMapping.deleteMany({
      where: { ownerUid, source: 'manual' },
    });
  },
};
