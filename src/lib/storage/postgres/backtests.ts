import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/postgres';
import type {
  BacktestDreamIntakeInput,
  BacktestsStorage,
  StorageId,
  UnknownRecord,
} from '@/lib/storage/types';

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeTerm(term: string): string {
  return String(term || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

function parseResultObject(input: unknown): Record<string, any> {
  return input && typeof input === 'object' ? input as Record<string, any> : {};
}

async function ensureOwner(ownerUid: string, tx: Prisma.TransactionClient): Promise<void> {
  await tx.owner.upsert({
    where: { uid: ownerUid },
    create: { uid: ownerUid },
    update: {},
  });
}

export const postgresBacktestsStorage: Pick<
  BacktestsStorage,
  | 'createBacktestDreamIntake'
  | 'listBacktestDreams'
  | 'bulkCreateBacktestResults'
  | 'listBacktestResultsForDream'
  | 'getBacktestDreamById'
  | 'listBacktestHitsForDream'
  | 'getBacktestSummaryForDream'
> = {
  async createBacktestDreamIntake(
    ownerUid: string,
    input: BacktestDreamIntakeInput
  ): Promise<StorageId> {
    const parseResult = parseResultObject(input.parseResult);
    const dreamerId = String(input.dreamerId || 'owner-self');
    const dreamerName = String(input.dreamerName || '');
    const parsedTermMappings = Array.isArray(parseResult.termMappings) ? parseResult.termMappings : [];
    const cash3Numbers = Array.isArray(parseResult.cash3Numbers)
      ? parseResult.cash3Numbers.map(String)
      : [];
    const cash4Numbers = Array.isArray(parseResult.cash4Numbers)
      ? parseResult.cash4Numbers.map(String)
      : [];
    const archivedNumbers = Array.isArray(parseResult.archivedNumbers)
      ? parseResult.archivedNumbers.map(String)
      : [];
    const activeWindowStart = input.dreamDate;
    const activeWindowEnd = addDays(input.dreamDate, 6);

    return prisma.$transaction(async (tx) => {
      await ensureOwner(ownerUid, tx);

      const dream = await tx.backtestDream.create({
        data: {
          ownerUid,
          dreamerId,
          dreamerName,
          dreamDate: input.dreamDate,
          rawText: input.rawText,
          cleanedText: parseResult.cleanedText ?? input.rawText.trim(),
          source: input.source,
          confidence: input.confidence,
          notes: input.notes ?? '',
          parseResult: parseResult as Prisma.InputJsonValue,
          parsedTermMappings: parsedTermMappings as Prisma.InputJsonValue,
          cash3Numbers,
          cash4Numbers,
          archivedNumbers,
          activeWindowStart,
          activeWindowEnd,
          status: 'intake-saved',
          replaySource: '',
        },
      });

      await tx.backtestWindow.create({
        data: {
          ownerUid,
          backtestDreamId: dream.id,
          dreamerId,
          dreamerName,
          dreamDate: input.dreamDate,
          activeWindowStart,
          activeWindowEnd,
          lookaheadDays: 7,
          cash3Numbers,
          cash4Numbers,
          status: 'intake-saved',
        },
      });

      const dictRows = new Map<string, Prisma.TermNumberMappingCreateManyInput>();

      for (const mapping of parsedTermMappings) {
        const termLabel = String(mapping?.term || '').trim();
        if (!termLabel) continue;
        const normalizedTerm = normalizeTerm(termLabel);

        for (const [gameType, numbers] of [
          ['cash3', Array.isArray(mapping?.cash3Numbers) ? mapping.cash3Numbers : []],
          ['cash4', Array.isArray(mapping?.cash4Numbers) ? mapping.cash4Numbers : []],
        ] as const) {
          for (const raw of numbers) {
            const numberText = String(raw ?? '').trim();
            if (!numberText) continue;
            const key = [ownerUid, dreamerId, normalizedTerm, numberText, gameType].join('\u001f');
            if (dictRows.has(key)) continue;
            dictRows.set(key, {
              ownerUid,
              dreamerId,
              dreamerName,
              termLabel,
              normalizedTerm,
              numberText,
              boxedKey: sortedDigits(numberText),
              gameType,
              source: 'historical-dream-intake',
              backtestDreamId: dream.id,
              dreamDate: input.dreamDate,
            });
          }
        }
      }

      if (dictRows.size) {
        await tx.termNumberMapping.createMany({
          data: Array.from(dictRows.values()),
          skipDuplicates: true,
        });
      }

      return dream.id;
    }, { timeout: 20000 });
  },

  async listBacktestDreams(
    ownerUid: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<UnknownRecord[]> {
    const rows = await prisma.backtestDream.findMany({
      where: {
        ownerUid,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(options?.limit ?? 100, 300),
    });

    return rows.map((row) => ({
      id: row.id,
      ownerUid: row.ownerUid,
      backtestDreamId: row.id,
      dreamerId: row.dreamerId,
      dreamerName: row.dreamerName ?? '',
      dreamDate: row.dreamDate,
      rawText: row.rawText,
      source: row.source ?? '',
      confidence: row.confidence ?? '',
      notes: row.notes ?? '',
      parseResult: row.parseResult,
      parsedTermMappings: row.parsedTermMappings,
      cash3Numbers: row.cash3Numbers,
      cash4Numbers: row.cash4Numbers,
      archivedNumbers: row.archivedNumbers,
      activeWindowStart: row.activeWindowStart,
      activeWindowEnd: row.activeWindowEnd,
      status: row.status,
      replaySource: row.replaySource ?? '',
      termMappings: row.parsedTermMappings,
      termCount: Array.isArray(row.parsedTermMappings) ? row.parsedTermMappings.length : 0,
      hitCount: 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async bulkCreateBacktestResults(
    ownerUid: string,
    backtestDreamId: string,
    rows
  ): Promise<void> {
    if (!rows.length) return;

    const dream = await prisma.backtestDream.findFirst({
      where: { ownerUid, id: backtestDreamId },
      select: { id: true },
    });

    if (!dream) {
      throw new Error('Backtest dream not found for owner.');
    }

    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      await prisma.backtestResult.createMany({
        data: chunk.map((row) => {
          const normalizedResult = String(row.normalizedResult ?? '').trim();
          return {
            ownerUid,
            backtestDreamId,
            state: String(row.state ?? ''),
            date: String(row.date ?? ''),
            gameType: String(row.gameType ?? ''),
            drawTime: String(row.drawTime ?? ''),
            rawResult: row.rawResult ? String(row.rawResult) : null,
            normalizedResult,
            boxedKey: sortedDigits(normalizedResult),
            sourceType: row.sourceType ? String(row.sourceType) : null,
            gameLabel: row.gameLabel ? String(row.gameLabel) : null,
            bonusText: row.bonusText ? String(row.bonusText) : null,
          };
        }),
        skipDuplicates: true,
      });
    }
  },

  async listBacktestResultsForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord[]> {
    const rows = await prisma.backtestResult.findMany({
      where: { ownerUid, backtestDreamId },
      orderBy: [{ date: 'asc' }, { drawTime: 'asc' }],
      take: 1000,
    });

    return rows.map((row) => ({
      id: row.id,
      ownerUid: row.ownerUid,
      backtestDreamId: row.backtestDreamId,
      state: row.state,
      date: row.date,
      gameType: row.gameType,
      drawTime: row.drawTime,
      rawResult: row.rawResult ?? '',
      normalizedResult: row.normalizedResult,
      boxedKey: row.boxedKey,
      sourceType: row.sourceType ?? '',
      gameLabel: row.gameLabel ?? '',
      bonusText: row.bonusText ?? '',
      importedAt: row.importedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async getBacktestDreamById(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null> {
    const row = await prisma.backtestDream.findFirst({
      where: { ownerUid, id: backtestDreamId },
    });

    if (!row) return null;

    return {
      id: row.id,
      ownerUid: row.ownerUid,
      backtestDreamId: row.id,
      dreamerId: row.dreamerId,
      dreamerName: row.dreamerName ?? '',
      dreamDate: row.dreamDate,
      rawText: row.rawText,
      cleanedText: row.cleanedText ?? '',
      source: row.source ?? '',
      confidence: row.confidence ?? '',
      notes: row.notes ?? '',
      parseResult: row.parseResult,
      parsedTermMappings: row.parsedTermMappings,
      cash3Numbers: row.cash3Numbers,
      cash4Numbers: row.cash4Numbers,
      archivedNumbers: row.archivedNumbers,
      activeWindowStart: row.activeWindowStart,
      activeWindowEnd: row.activeWindowEnd,
      status: row.status,
      replaySource: row.replaySource ?? '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  async listBacktestHitsForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord[]> {
    const rows = await prisma.backtestHit.findMany({
      where: { ownerUid, backtestDreamId },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }],
      take: 2000,
    });

    return rows.map((row) => ({
      id: row.id,
      ownerUid: row.ownerUid,
      backtestDreamId: row.backtestDreamId,
      dreamerId: row.dreamerId,
      dreamerName: row.dreamerName ?? '',
      dreamDate: row.dreamDate ?? '',
      termLabel: row.termLabel,
      normalizedTerm: row.normalizedTerm ?? '',
      number: row.numberText,
      numberText: row.numberText,
      boxedKey: row.boxedKey ?? '',
      gameType: row.gameType,
      state: row.state,
      drawDate: row.drawDate,
      drawTime: row.drawTime,
      rawResult: row.rawResult ?? '',
      normalizedResult: row.normalizedResult,
      resultBoxedKey: row.resultBoxedKey ?? '',
      hitType: row.hitType,
      daysFromDream: row.daysFromDream ?? 0,
      sameDay: row.sameDay,
      is_verified: row.isVerified ?? false,
      isVerified: row.isVerified ?? false,
      source_name: row.sourceName ?? '',
      sourceName: row.sourceName ?? '',
      replaySource: row.replaySource ?? '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async getBacktestSummaryForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null> {
    const row = await prisma.backtestSummary.findFirst({
      where: { ownerUid, backtestDreamId },
    });

    if (!row) return null;

    return {
      id: row.id,
      ownerUid: row.ownerUid,
      backtestDreamId: row.backtestDreamId,
      dreamerId: row.dreamerId ?? '',
      dreamDate: row.dreamDate ?? '',
      totalHits: row.totalHits,
      straightHits: row.straightHits,
      boxedHits: row.boxedHits,
      uniqueStates: Array.isArray(row.uniqueStates) ? row.uniqueStates.map(String) : [],
      bestState: row.bestState ?? '',
      bestTerm: row.bestTerm ?? '',
      status: row.status ?? '',
      replaySource: row.replaySource ?? '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  },
};
