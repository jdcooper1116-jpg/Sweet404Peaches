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
  'createBacktestDreamIntake' | 'listBacktestDreams'
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
};
