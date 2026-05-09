import type { Prisma } from '@prisma/client';
import {
  buildBacktestHitSourceContextId,
  buildBoxedKey,
  buildLiveHitSourceContextId,
  normalizeHitType,
} from '@/lib/evidence/hitEvidenceKeys';
import { validateHitEvidenceInput } from '@/lib/evidence/hitEvidenceService';
import { prisma } from '@/lib/db/postgres';
import type {
  BacktestHitEvidenceInput,
  HitEvidenceStorage,
  PersonalHitEventEvidenceInput,
  UnknownRecord,
} from '@/lib/storage/types';

function normalizeTerm(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function requireText(name: string, value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function optionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function toJson(value: UnknownRecord | undefined): Prisma.InputJsonValue | undefined {
  return value && Object.keys(value).length > 0
    ? value as Prisma.InputJsonObject
    : undefined;
}

function mapBacktestHit(row: Awaited<ReturnType<typeof prisma.backtestHit.findMany>>[number]): UnknownRecord {
  return {
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
    canonicalKey: row.canonicalKey ?? '',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapHitEvent(row: Awaited<ReturnType<typeof prisma.personalHitEvent.findMany>>[number]): UnknownRecord {
  return {
    id: row.id,
    ownerUid: row.ownerUid,
    dreamerId: row.dreamerId,
    dreamerName: row.dreamerName ?? '',
    termLabel: row.termLabel,
    normalizedTerm: row.normalizedTerm,
    number: row.numberText,
    numberText: row.numberText,
    boxedKey: row.boxedKey ?? '',
    gameType: row.gameType,
    state: row.state,
    drawDate: row.drawDate,
    drawTime: row.drawTime,
    hitType: row.hitType,
    winningNumber: row.winningNumber ?? '',
    normalizedResult: row.normalizedResult ?? '',
    source: row.source ?? '',
    sourceType: row.source ?? '',
    sourceContextId: row.sourceContextId,
    sourceDreamEntryId: row.sourceDreamEntryId ?? '',
    activeWindowId: row.activeWindowId ?? '',
    backtestDreamId: row.backtestDreamId ?? '',
    daysFromDream: row.daysFromDream ?? 0,
    sameDay: row.sameDay,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMapping(row: Awaited<ReturnType<typeof prisma.personalHitMapping.findMany>>[number]): UnknownRecord {
  return {
    id: row.id,
    ownerUid: row.ownerUid,
    dreamerId: row.dreamerId,
    dreamerName: row.dreamerName ?? '',
    termLabel: row.termLabel,
    normalizedTerm: row.normalizedTerm,
    number: row.numberText,
    numberText: row.numberText,
    boxedKey: row.boxedKey ?? '',
    gameType: row.gameType,
    state: row.state,
    drawTime: row.drawTime ?? '',
    drawDate: row.drawDate ?? '',
    lastHitDate: row.lastHitDate ?? '',
    hitType: row.hitType ?? '',
    hitCount: row.hitCount,
    straightCount: row.straightCount,
    exactCount: row.straightCount,
    boxedCount: row.boxedCount,
    stateStrengthScore: row.stateStrengthScore,
    source: row.source ?? '',
    sourceDreamEntryId: row.sourceDreamEntryId ?? '',
    activeWindowId: row.activeWindowId ?? '',
    backtestDreamId: row.backtestDreamId ?? '',
    daysFromDream: row.daysFromDream ?? 0,
    sameDay: row.sameDay,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSummary(row: NonNullable<Awaited<ReturnType<typeof prisma.backtestSummary.findFirst>>>): UnknownRecord {
  return {
    id: row.id,
    ownerUid: row.ownerUid,
    backtestDreamId: row.backtestDreamId,
    dreamerId: row.dreamerId ?? '',
    dreamDate: row.dreamDate ?? '',
    totalHits: row.totalHits,
    straightHits: row.straightHits,
    exactHits: row.straightHits,
    boxedHits: row.boxedHits,
    uniqueStates: Array.isArray(row.uniqueStates) ? row.uniqueStates.map(String) : [],
    bestState: row.bestState ?? '',
    bestTerm: row.bestTerm ?? '',
    status: row.status ?? '',
    replaySource: row.replaySource ?? '',
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBacktestHitRow(
  ownerUid: string,
  backtestDreamId: string,
  input: BacktestHitEvidenceInput
): Prisma.BacktestHitCreateManyInput {
  const dreamerId = requireText('dreamerId', input.dreamerId);
  const termLabel = requireText('termLabel', input.termLabel);
  const normalizedTerm = optionalText(input.normalizedTerm) ?? normalizeTerm(termLabel);
  const numberText = requireText('numberText', input.numberText);
  const normalizedResult = requireText('normalizedResult', input.normalizedResult);
  const hitType = normalizeHitType(input.hitType);
  const metadata = toJson(input.metadata);

  return {
    ownerUid,
    backtestDreamId,
    dreamerId,
    dreamerName: optionalText(input.dreamerName),
    dreamDate: optionalText(input.dreamDate),
    termLabel,
    normalizedTerm,
    numberText,
    boxedKey: optionalText(input.boxedKey) ?? buildBoxedKey(numberText),
    gameType: requireText('gameType', input.gameType),
    state: requireText('state', input.state),
    drawDate: requireText('drawDate', input.drawDate),
    drawTime: requireText('drawTime', input.drawTime),
    rawResult: optionalText(input.rawResult),
    normalizedResult,
    resultBoxedKey: optionalText(input.resultBoxedKey) ?? buildBoxedKey(normalizedResult),
    hitType,
    daysFromDream: input.daysFromDream ?? null,
    sameDay: input.sameDay ?? false,
    isVerified: input.isVerified ?? null,
    sourceName: optionalText(input.sourceName),
    replaySource: optionalText(input.replaySource),
    canonicalKey: buildBacktestHitSourceContextId({
      backtestDreamId,
      normalizedTerm,
      numberText,
      gameType: input.gameType,
      state: input.state,
      drawDate: input.drawDate,
      drawTime: input.drawTime,
      normalizedResult,
      hitType,
    }),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function sourceContextIdForEvent(input: PersonalHitEventEvidenceInput): string {
  const hitType = normalizeHitType(input.hitType);
  const term = optionalText(input.normalizedTerm) ?? normalizeTerm(input.termLabel);

  if (input.sourceContextId?.trim()) return input.sourceContextId.trim();
  if (input.sourceType === 'backtest' || input.sourceType === 'replay') {
    return buildBacktestHitSourceContextId({
      backtestDreamId: requireText('backtestDreamId', input.backtestDreamId || ''),
      normalizedTerm: term,
      numberText: input.numberText,
      gameType: input.gameType,
      state: input.state,
      drawDate: input.drawDate,
      drawTime: input.drawTime,
      normalizedResult: input.normalizedResult,
      hitType,
    });
  }

  return buildLiveHitSourceContextId({
    dreamEntryId: input.dreamEntryId,
    sourceDreamEntryId: input.sourceDreamEntryId,
    activeWindowId: input.activeWindowId,
    normalizedTerm: term,
    numberText: input.numberText,
    gameType: input.gameType,
    state: input.state,
    drawDate: input.drawDate,
    drawTime: input.drawTime,
    normalizedResult: input.normalizedResult,
    hitType,
  });
}

function toHitEventRow(
  ownerUid: string,
  input: PersonalHitEventEvidenceInput
): Prisma.PersonalHitEventCreateManyInput {
  const dreamerId = requireText('dreamerId', input.dreamerId);
  const termLabel = requireText('termLabel', input.termLabel);
  const normalizedTerm = optionalText(input.normalizedTerm) ?? normalizeTerm(termLabel);
  const numberText = requireText('numberText', input.numberText);
  const normalizedResult = requireText('normalizedResult', input.normalizedResult);
  const hitType = normalizeHitType(input.hitType);
  const sourceContextId = sourceContextIdForEvent({ ...input, normalizedTerm, hitType });
  const validation = validateHitEvidenceInput({
    ownerUid,
    dreamerId,
    sourceType: input.sourceType,
    sourceContextId,
    normalizedTerm,
    numberText,
    gameType: input.gameType,
    state: input.state,
    drawDate: input.drawDate,
    drawTime: input.drawTime,
    normalizedResult,
    hitType,
  });

  if (!validation.ok) {
    throw new Error(`Invalid hit evidence input: ${validation.errors.join(', ')}`);
  }

  const metadata = toJson({
    ...(input.metadata ?? {}),
    ...(input.rawResult !== undefined ? { rawResult: input.rawResult } : {}),
    ...(input.resultBoxedKey !== undefined ? { resultBoxedKey: input.resultBoxedKey } : {}),
  });

  return {
    ownerUid,
    dreamerId,
    dreamerName: optionalText(input.dreamerName),
    termLabel,
    normalizedTerm,
    numberText,
    boxedKey: optionalText(input.boxedKey) ?? buildBoxedKey(numberText),
    gameType: requireText('gameType', input.gameType),
    state: requireText('state', input.state),
    drawDate: requireText('drawDate', input.drawDate),
    drawTime: requireText('drawTime', input.drawTime),
    hitType,
    winningNumber: normalizedResult,
    normalizedResult,
    source: input.sourceType,
    sourceContextId,
    sourceDreamEntryId: optionalText(input.sourceDreamEntryId ?? input.dreamEntryId),
    activeWindowId: optionalText(input.activeWindowId),
    backtestDreamId: optionalText(input.backtestDreamId),
    daysFromDream: input.daysFromDream ?? null,
    sameDay: input.sameDay ?? false,
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

async function readAggregateEvents(ownerUid: string, dreamerId?: string) {
  return prisma.personalHitEvent.findMany({
    where: {
      ownerUid,
      ...(dreamerId ? { dreamerId } : {}),
      isDeprecated: false,
      isShadowedByCorrectedMapping: false,
    },
    orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }, { createdAt: 'asc' }],
  });
}

function buildMappingRows(
  events: Awaited<ReturnType<typeof readAggregateEvents>>
): Prisma.PersonalHitMappingCreateManyInput[] {
  const groups = new Map<string, {
    events: typeof events;
    latest: typeof events[number];
  }>();

  for (const event of events) {
    const key = [
      event.ownerUid,
      event.dreamerId,
      event.normalizedTerm,
      event.numberText,
      event.gameType,
      event.state,
    ].join('\u001f');
    const current = groups.get(key);
    if (!current || event.drawDate >= current.latest.drawDate) {
      groups.set(key, { events: [...(current?.events ?? []), event], latest: event });
    } else {
      current.events.push(event);
    }
  }

  return Array.from(groups.values()).map(({ events: group, latest }) => {
    const exactCount = group.filter(event => normalizeHitType(event.hitType) === 'exact').length;
    const boxedCount = group.filter(event => normalizeHitType(event.hitType) === 'box').length;
    const metadata: Prisma.InputJsonObject = {
      sourceEventIds: group.map(event => event.id),
    };

    return {
      ownerUid: latest.ownerUid,
      dreamerId: latest.dreamerId,
      dreamerName: latest.dreamerName,
      termLabel: latest.termLabel,
      normalizedTerm: latest.normalizedTerm,
      numberText: latest.numberText,
      boxedKey: latest.boxedKey,
      gameType: latest.gameType,
      state: latest.state,
      drawTime: latest.drawTime,
      drawDate: latest.drawDate,
      lastHitDate: latest.drawDate,
      hitType: exactCount > 0 ? 'exact' : 'box',
      hitCount: group.length,
      straightCount: exactCount,
      boxedCount,
      stateStrengthScore: group.length,
      source: 'personal_hit_events',
      sourceDreamEntryId: latest.sourceDreamEntryId,
      activeWindowId: latest.activeWindowId,
      backtestDreamId: latest.backtestDreamId,
      daysFromDream: latest.daysFromDream,
      sameDay: latest.sameDay,
      metadata,
    };
  });
}

export const postgresHitEvidenceStorage: HitEvidenceStorage = {
  async bulkUpsertBacktestHits(ownerUid, backtestDreamId, hits) {
    requireText('ownerUid', ownerUid);
    requireText('backtestDreamId', backtestDreamId);
    if (!hits.length) return { attempted: 0, created: 0 };

    const dream = await prisma.backtestDream.findFirst({
      where: { ownerUid, id: backtestDreamId },
      select: { id: true },
    });
    if (!dream) throw new Error('Backtest dream not found for owner.');

    let created = 0;
    for (let i = 0; i < hits.length; i += 1000) {
      const chunk = hits.slice(i, i + 1000).map(hit =>
        toBacktestHitRow(ownerUid, backtestDreamId, hit)
      );
      const result = await prisma.backtestHit.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      created += result.count;
    }

    return { attempted: hits.length, created };
  },

  async listBacktestHitsForDream(ownerUid, backtestDreamId) {
    const rows = await prisma.backtestHit.findMany({
      where: { ownerUid, backtestDreamId },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    });
    return rows.map(mapBacktestHit);
  },

  async bulkUpsertPersonalHitEvents(ownerUid, events) {
    requireText('ownerUid', ownerUid);
    if (!events.length) return { attempted: 0, created: 0 };

    let created = 0;
    for (let i = 0; i < events.length; i += 1000) {
      const chunk = events.slice(i, i + 1000).map(event => toHitEventRow(ownerUid, event));
      const result = await prisma.personalHitEvent.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      created += result.count;
    }

    return { attempted: events.length, created };
  },

  async listHitEventsForDreamer(ownerUid, dreamerId, options) {
    const rows = await prisma.personalHitEvent.findMany({
      where: { ownerUid, dreamerId },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(options?.limit ?? 500, 5000),
    });
    return rows.map(mapHitEvent);
  },

  async listHitEventsForTerm(ownerUid, normalizedTerm, options) {
    const rows = await prisma.personalHitEvent.findMany({
      where: {
        ownerUid,
        normalizedTerm,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
      },
      orderBy: [{ drawDate: 'desc' }, { drawTime: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(options?.limit ?? 500, 5000),
    });
    return rows.map(mapHitEvent);
  },

  async listHitEventsForBacktestDream(ownerUid, backtestDreamId, options) {
    const rows = await prisma.personalHitEvent.findMany({
      where: { ownerUid, backtestDreamId },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(options?.limit ?? 1000, 5000),
    });
    return rows.map(mapHitEvent);
  },

  async listHitEventsForDreamEntry(ownerUid, dreamEntryId, options) {
    const rows = await prisma.personalHitEvent.findMany({
      where: {
        ownerUid,
        OR: [
          { sourceDreamEntryId: dreamEntryId },
          { sourceContextId: { startsWith: `live:${dreamEntryId}:` } },
        ],
      },
      orderBy: [{ drawDate: 'asc' }, { drawTime: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(options?.limit ?? 1000, 5000),
    });
    return rows.map(mapHitEvent);
  },

  async rebuildPersonalHitMappingsFromEvents(ownerUid, options) {
    const events = await readAggregateEvents(ownerUid, options?.dreamerId);
    const rows = buildMappingRows(events);

    await prisma.$transaction(async (tx) => {
      await tx.personalHitMapping.deleteMany({
        where: {
          ownerUid,
          ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
        },
      });
      if (rows.length) {
        await tx.personalHitMapping.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }
    });

    return { attempted: rows.length, created: rows.length };
  },

  async upsertPersonalHitMappingsFromEvents(ownerUid, options) {
    const events = await readAggregateEvents(ownerUid, options?.dreamerId);
    const rows = buildMappingRows(events);
    let createdOrUpdated = 0;

    for (const row of rows) {
      await prisma.personalHitMapping.upsert({
        where: {
          ownerUid_dreamerId_normalizedTerm_numberText_gameType_state: {
            ownerUid: row.ownerUid,
            dreamerId: row.dreamerId,
            normalizedTerm: row.normalizedTerm,
            numberText: row.numberText,
            gameType: row.gameType,
            state: row.state,
          },
        },
        create: row,
        update: {
          dreamerName: row.dreamerName,
          termLabel: row.termLabel,
          boxedKey: row.boxedKey,
          drawTime: row.drawTime,
          drawDate: row.drawDate,
          lastHitDate: row.lastHitDate,
          hitType: row.hitType,
          hitCount: row.hitCount,
          straightCount: row.straightCount,
          boxedCount: row.boxedCount,
          stateStrengthScore: row.stateStrengthScore,
          source: row.source,
          sourceDreamEntryId: row.sourceDreamEntryId,
          activeWindowId: row.activeWindowId,
          backtestDreamId: row.backtestDreamId,
          daysFromDream: row.daysFromDream,
          sameDay: row.sameDay,
          metadata: row.metadata,
        },
      });
      createdOrUpdated += 1;
    }

    return { attempted: rows.length, created: createdOrUpdated };
  },

  async listFellBeforeMappings(ownerUid, options) {
    const rows = await prisma.personalHitMapping.findMany({
      where: {
        ownerUid,
        ...(options?.dreamerId ? { dreamerId: options.dreamerId } : {}),
        ...(options?.normalizedTerm ? { normalizedTerm: options.normalizedTerm } : {}),
        isDeprecated: false,
        isShadowedByCorrectedMapping: false,
      },
      orderBy: [{ lastHitDate: 'desc' }, { hitCount: 'desc' }],
      take: Math.min(options?.limit ?? 500, 5000),
    });
    return rows.map(mapMapping);
  },

  async upsertBacktestSummary(ownerUid, backtestDreamId) {
    return this.rebuildBacktestSummary(ownerUid, backtestDreamId);
  },

  async rebuildBacktestSummary(ownerUid, backtestDreamId) {
    const dream = await prisma.backtestDream.findFirst({
      where: { ownerUid, id: backtestDreamId },
      select: { id: true, dreamerId: true, dreamDate: true, replaySource: true },
    });
    if (!dream) return null;

    const hits = await prisma.backtestHit.findMany({
      where: { ownerUid, backtestDreamId },
      orderBy: [{ drawDate: 'asc' }, { createdAt: 'asc' }],
    });

    const exactHits = hits.filter(hit => normalizeHitType(hit.hitType) === 'exact').length;
    const boxedHits = hits.filter(hit => normalizeHitType(hit.hitType) === 'box').length;
    const stateCounts = new Map<string, number>();
    const termCounts = new Map<string, number>();
    for (const hit of hits) {
      stateCounts.set(hit.state, (stateCounts.get(hit.state) ?? 0) + 1);
      termCounts.set(hit.termLabel, (termCounts.get(hit.termLabel) ?? 0) + 1);
    }
    const uniqueStates = Array.from(stateCounts.keys()).sort();
    const bestState = Array.from(stateCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const bestTerm = Array.from(termCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const row = await prisma.backtestSummary.upsert({
      where: { backtestDreamId },
      create: {
        ownerUid,
        backtestDreamId,
        dreamerId: dream.dreamerId,
        dreamDate: dream.dreamDate,
        totalHits: hits.length,
        straightHits: exactHits,
        boxedHits,
        uniqueStates,
        bestState,
        bestTerm,
        status: 'summary-built',
        replaySource: dream.replaySource,
      },
      update: {
        dreamerId: dream.dreamerId,
        dreamDate: dream.dreamDate,
        totalHits: hits.length,
        straightHits: exactHits,
        boxedHits,
        uniqueStates,
        bestState,
        bestTerm,
        status: 'summary-built',
        replaySource: dream.replaySource,
      },
    });

    return mapSummary(row);
  },
};
