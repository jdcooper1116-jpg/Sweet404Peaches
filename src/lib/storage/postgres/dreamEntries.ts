import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/postgres';
import type { DreamEntry, DreamEntryInput, GameType, TermMapping } from '@/lib/types';
import type { DreamEntriesStorage, StorageId, UnknownRecord } from '@/lib/storage/types';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

type PostgresDreamEntry = Awaited<ReturnType<typeof prisma.dreamEntry.findFirst>>;

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function jsonArray(value: Prisma.JsonValue | null): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  return jsonArray(value).map(String);
}

function termMappings(value: Prisma.JsonValue | null): TermMapping[] {
  return jsonArray(value) as TermMapping[];
}

function toDreamEntry(row: NonNullable<PostgresDreamEntry>): DreamEntry {
  return {
    id: row.id,
    ownerUid: row.ownerUid,
    dreamerId: row.dreamerId,
    dreamerName: row.dreamerName ?? '',
    rawText: row.rawText,
    cleanedText: row.cleanedText ?? row.rawText,
    dreamDate: row.dreamDate,
    uploadedAt: row.uploadedAt as unknown as DreamEntry['uploadedAt'],
    termMappings: termMappings(row.termMappings),
    allNumbers: stringArray(row.allNumbers),
    activeWindowStart: row.activeWindowStart ?? row.dreamDate,
    activeWindowEnd: row.activeWindowEnd ?? addDays(row.dreamDate, 6),
    sourceType: (row.sourceType ?? 'manual') as DreamEntry['sourceType'],
    notes: row.notes ?? undefined,
    isReviewed: row.isReviewed,
  };
}

function flattenNumbers(mappings: TermMapping[]): string[] {
  const values = new Set<string>();
  for (const mapping of mappings) {
    (mapping.cash3Numbers ?? []).forEach((n) => values.add(String(n)));
    (mapping.cash4Numbers ?? []).forEach((n) => values.add(String(n)));
  }
  return Array.from(values);
}

async function ensureOwner(ownerUid: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  await tx.owner.upsert({
    where: { uid: ownerUid },
    create: { uid: ownerUid },
    update: {},
  });
}

function sortedEntries<T extends { dreamDate?: string; uploadedAt?: unknown; createdAt?: unknown }>(
  entries: T[]
): T[] {
  return [...entries].sort((a, b) => {
    const dateA = String(a.dreamDate ?? '');
    const dateB = String(b.dreamDate ?? '');
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;
    const upA = String(a.uploadedAt ?? a.createdAt ?? '');
    const upB = String(b.uploadedAt ?? b.createdAt ?? '');
    return upA < upB ? 1 : -1;
  });
}

function pushUnique<T>(map: Map<string, T>, key: string, value: T): void {
  if (!map.has(key)) map.set(key, value);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export const postgresDreamEntriesStorage: DreamEntriesStorage = {
  async createDreamEntry(ownerUid: string, input: DreamEntryInput): Promise<StorageId> {
    return prisma.$transaction(async (tx) => {
      await ensureOwner(ownerUid, tx);

      const row = await tx.dreamEntry.create({
        data: {
          ownerUid,
          dreamerId: input.dreamerId,
          dreamerName: input.dreamerName,
          dreamDate: input.dreamDate,
          rawText: input.rawText,
          cleanedText: input.cleanedText,
          sourceType: input.sourceType,
          notes: input.notes ?? '',
          allNumbers: input.allNumbers ?? [],
          termMappings: input.termMappings as unknown as Prisma.InputJsonValue,
          activeWindowStart: input.activeWindowStart,
          activeWindowEnd: input.activeWindowEnd,
          isReviewed: input.isReviewed,
        },
      });

      return row.id;
    });
  },

  async createDreamEntryWithWindows(
    ownerUid: string,
    input: Omit<DreamEntryInput, 'allNumbers' | 'activeWindowStart' | 'activeWindowEnd'>
  ): Promise<StorageId> {
    const activeWindowStart = input.dreamDate;
    const activeWindowEnd = addDays(input.dreamDate, 6);
    const mappings = input.termMappings ?? [];
    const allNumbers = flattenNumbers(mappings);
    const termRows = new Map<
      string,
      {
        termLabel: string;
        normalizedTerm: string;
        relatedTerms: Prisma.InputJsonValue;
        lineContexts: Prisma.InputJsonValue;
      }
    >();
    const numberRows: Array<{
      termLabel: string;
      normalizedTerm: string;
      numberText: string;
      boxedKey: string;
      gameType: GameType;
    }> = [];

    for (const mapping of mappings) {
      const termLabel = String(mapping.term || '').trim() || 'unknown-term';
      const normalizedTerm = normalizeTerm(termLabel) || 'unknown-term';

      termRows.set(normalizedTerm, {
        termLabel,
        normalizedTerm,
        relatedTerms: (mapping.relatedTerms ?? []) as Prisma.InputJsonValue,
        lineContexts: (mapping.lineContexts ?? []) as Prisma.InputJsonValue,
      });

      const candidateGroups: Array<{ gameType: GameType; numbers: string[] }> = [
        { gameType: 'cash3', numbers: (mapping.cash3Numbers ?? []).map(String) },
        { gameType: 'cash4', numbers: (mapping.cash4Numbers ?? []).map(String) },
      ];

      for (const group of candidateGroups) {
        for (const rawNumber of group.numbers) {
          const numberText = String(rawNumber ?? '').trim();
          if (!numberText) continue;

          numberRows.push({
            termLabel,
            normalizedTerm,
            numberText,
            boxedKey: sortedDigits(numberText),
            gameType: group.gameType,
          });
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      await ensureOwner(ownerUid, tx);

      const dream = await tx.dreamEntry.create({
        data: {
          ownerUid,
          dreamerId: input.dreamerId,
          dreamerName: input.dreamerName,
          dreamDate: input.dreamDate,
          rawText: input.rawText,
          cleanedText: input.cleanedText,
          sourceType: input.sourceType,
          notes: input.notes ?? '',
          allNumbers,
          termMappings: mappings as unknown as Prisma.InputJsonValue,
          activeWindowStart,
          activeWindowEnd,
          isReviewed: input.isReviewed,
        },
      });

      const terms = Array.from(termRows.values());

      if (terms.length) {
        await tx.dreamTerm.createMany({
          data: terms.map((term) => ({
            ownerUid,
            dreamEntryId: dream.id,
            dreamerId: input.dreamerId,
            termLabel: term.termLabel,
            normalizedTerm: term.normalizedTerm,
            relatedTerms: term.relatedTerms,
            lineContexts: term.lineContexts,
          })),
          skipDuplicates: true,
        });
      }

      const savedTerms = await tx.dreamTerm.findMany({
        where: {
          ownerUid,
          dreamEntryId: dream.id,
          normalizedTerm: { in: terms.map((term) => term.normalizedTerm) },
        },
        select: { id: true, normalizedTerm: true },
      });
      const termIdsByNormalizedTerm = new Map(
        savedTerms.map((term) => [term.normalizedTerm, term.id])
      );

      const candidateRows = new Map<string, Prisma.DreamCandidateCreateManyInput>();
      const windowRows = new Map<string, Prisma.ActiveDreamWindowCreateManyInput>();
      const dictionaryRows = new Map<string, Prisma.TermNumberMappingCreateManyInput>();

      for (const row of numberRows) {
        const dreamTermId = termIdsByNormalizedTerm.get(row.normalizedTerm);

        pushUnique(
          candidateRows,
          [
            ownerUid,
            dream.id,
            row.normalizedTerm,
            row.numberText,
            row.gameType,
          ].join('\u001f'),
          {
            ownerUid,
            dreamEntryId: dream.id,
            dreamTermId,
            dreamerId: input.dreamerId,
            termLabel: row.termLabel,
            normalizedTerm: row.normalizedTerm,
            numberText: row.numberText,
            boxedKey: row.boxedKey,
            gameType: row.gameType,
            source: 'live-dream-intake',
          }
        );

        pushUnique(
          windowRows,
          [
            ownerUid,
            dream.id,
            input.dreamerId,
            row.normalizedTerm,
            row.numberText,
            row.gameType,
            activeWindowStart,
            activeWindowEnd,
          ].join('\u001f'),
          {
            ownerUid,
            dreamEntryId: dream.id,
            dreamerId: input.dreamerId,
            dreamerName: input.dreamerName,
            termLabel: row.termLabel,
            normalizedTerm: row.normalizedTerm,
            numberText: row.numberText,
            boxedKey: row.boxedKey,
            gameType: row.gameType,
            activeStart: activeWindowStart,
            activeEnd: activeWindowEnd,
            isActive: true,
            statesTracked: US_STATES,
          }
        );

        pushUnique(
          dictionaryRows,
          [
            ownerUid,
            input.dreamerId,
            row.normalizedTerm,
            row.numberText,
            row.gameType,
          ].join('\u001f'),
          {
            ownerUid,
            dreamerId: input.dreamerId,
            dreamerName: input.dreamerName,
            termLabel: row.termLabel,
            normalizedTerm: row.normalizedTerm,
            numberText: row.numberText,
            boxedKey: row.boxedKey,
            gameType: row.gameType,
            source: 'live-dream-intake',
            dreamEntryId: dream.id,
            sourceDreamEntryId: dream.id,
            dreamDate: input.dreamDate,
          }
        );
      }

      for (const batch of chunks(Array.from(candidateRows.values()), 1000)) {
        await tx.dreamCandidate.createMany({ data: batch, skipDuplicates: true });
      }

      for (const batch of chunks(Array.from(windowRows.values()), 1000)) {
        await tx.activeDreamWindow.createMany({ data: batch, skipDuplicates: true });
      }

      for (const batch of chunks(Array.from(dictionaryRows.values()), 1000)) {
        await tx.termNumberMapping.createMany({ data: batch, skipDuplicates: true });
      }

      return dream.id;
    }, { timeout: 20000 });
  },

  async listDreamEntries(
    ownerUid: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<DreamEntry[]> {
    const rows = await prisma.dreamEntry.findMany({
      where: {
        ownerUid,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
      },
      orderBy: [{ dreamDate: 'desc' }, { uploadedAt: 'desc' }],
      take: Math.min(options?.limit ?? 200, 1000),
    });

    return rows.map(toDreamEntry);
  },

  async getDreamEntry(id: string): Promise<DreamEntry | null> {
    const row = await prisma.dreamEntry.findUnique({ where: { id } });
    return row ? toDreamEntry(row) : null;
  },

  async getLatestDreamEntry(
    ownerUid: string,
    options?: { dreamerId?: string }
  ): Promise<UnknownRecord | null> {
    const entries = await this.listDreamEntries(ownerUid, {
      dreamerId: options?.dreamerId,
      limit: 50,
    });

    return (sortedEntries(entries)[0] as unknown as UnknownRecord) ?? null;
  },

  async deleteDreamEntryCascade(dreamEntryId: string): Promise<void> {
    await prisma.$transaction([
      prisma.termNumberMapping.deleteMany({ where: { sourceDreamEntryId: dreamEntryId } }),
      prisma.dreamHit.deleteMany({ where: { sourceDreamEntryId: dreamEntryId } }),
      prisma.activeDreamWindow.deleteMany({ where: { dreamEntryId } }),
      prisma.dreamCandidate.deleteMany({ where: { dreamEntryId } }),
      prisma.dreamTerm.deleteMany({ where: { dreamEntryId } }),
      prisma.dreamEntry.deleteMany({ where: { id: dreamEntryId } }),
    ]);
  },
};
