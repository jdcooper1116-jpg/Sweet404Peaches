import {
  buildBacktestHitSourceContextId,
  buildBoxedKey,
  choosePrimaryHitType,
  normalizeHitType,
} from '@/lib/evidence/hitEvidenceKeys';
import { validateHitEvidenceInput } from '@/lib/evidence/hitEvidenceService';
import { postgresHitEvidenceStorage } from '@/lib/storage/postgres/hitEvidence';
import type {
  BacktestHitEvidenceInput,
  HitEvidenceStorage,
  PersonalHitEventEvidenceInput,
} from '@/lib/storage/types';

export interface BacktestReplayHitCandidate {
  dreamerId?: string | null;
  dreamerName?: string | null;
  dreamDate?: string | null;
  termLabel?: string | null;
  normalizedTerm?: string | null;
  number?: string | null;
  numberText?: string | null;
  boxedKey?: string | null;
  gameType?: string | null;
  state?: string | null;
  drawDate?: string | null;
  drawTime?: string | null;
  rawResult?: string | null;
  normalizedResult?: string | null;
  resultBoxedKey?: string | null;
  hitType?: string | null;
  daysFromDream?: number | null;
  sameDay?: boolean | null;
  isVerified?: boolean | null;
  is_verified?: boolean | null;
  sourceName?: string | null;
  source_name?: string | null;
  replaySource?: string | null;
  sourceContextId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PersistBacktestReplayEvidenceInput {
  ownerUid: string;
  backtestDreamId: string;
  dreamerId?: string | null;
  dreamerName?: string | null;
  dreamDate?: string | null;
  replaySource?: string | null;
  hits: BacktestReplayHitCandidate[];
  storage?: HitEvidenceStorage;
  rebuildMappings?: boolean;
}

export interface PersistBacktestReplayEvidenceResult {
  backtestHitsAttempted: number;
  backtestHitsCreated: number;
  personalEventsAttempted: number;
  personalEventsCreated: number;
  mappingsUpdated: number;
  summaryUpdated: boolean;
  skippedInvalidRows: number;
  warnings: string[];
}

interface NormalizedReplayHit {
  backtestHit: BacktestHitEvidenceInput;
  event: PersonalHitEventEvidenceInput;
  canonicalDrawKey: string;
}

function trimString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function canonicalDrawKey(hit: {
  dreamerId: string;
  normalizedTerm: string;
  numberText: string;
  gameType: string;
  state: string;
  drawDate: string;
  drawTime: string;
  normalizedResult: string;
}): string {
  return [
    hit.dreamerId,
    hit.normalizedTerm,
    hit.numberText,
    hit.gameType,
    hit.state,
    hit.drawDate,
    hit.drawTime,
    hit.normalizedResult,
  ].join('\u001f');
}

function normalizeCandidate(
  input: PersistBacktestReplayEvidenceInput,
  candidate: BacktestReplayHitCandidate,
  index: number
): { hit?: NormalizedReplayHit; warning?: string } {
  const dreamerId = trimString(candidate.dreamerId) || trimString(input.dreamerId);
  if (!dreamerId) {
    return { warning: `Skipped hit ${index}: dreamerId is required` };
  }

  const termLabel = trimString(candidate.termLabel);
  const numberText = trimString(candidate.numberText) || trimString(candidate.number);
  const gameType = trimString(candidate.gameType);
  const state = trimString(candidate.state);
  const drawDate = trimString(candidate.drawDate);
  const drawTime = trimString(candidate.drawTime);
  const normalizedResult = trimString(candidate.normalizedResult);

  const missing = [
    ['termLabel', termLabel],
    ['numberText', numberText],
    ['gameType', gameType],
    ['state', state],
    ['drawDate', drawDate],
    ['drawTime', drawTime],
    ['normalizedResult', normalizedResult],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    return { warning: `Skipped hit ${index}: ${missing.join(', ')} required` };
  }

  const normalizedTerm = trimString(candidate.normalizedTerm) || normalizeTerm(termLabel);
  const primaryHitType = choosePrimaryHitType([candidate.hitType || 'box']);
  const sourceContextId = trimString(candidate.sourceContextId) || buildBacktestHitSourceContextId({
    backtestDreamId: input.backtestDreamId,
    normalizedTerm,
    numberText,
    gameType,
    state,
    drawDate,
    drawTime,
    normalizedResult,
    hitType: primaryHitType,
  });
  const validation = validateHitEvidenceInput({
    ownerUid: input.ownerUid,
    dreamerId,
    sourceType: 'backtest',
    sourceContextId,
    normalizedTerm,
    numberText,
    gameType,
    state,
    drawDate,
    drawTime,
    normalizedResult,
    hitType: primaryHitType,
  });

  if (!validation.ok) {
    return { warning: `Skipped hit ${index}: ${validation.errors.join(', ')}` };
  }

  const dreamerName = trimString(candidate.dreamerName) || trimString(input.dreamerName);
  const dreamDate = trimString(candidate.dreamDate) || trimString(input.dreamDate);
  const boxedKey = trimString(candidate.boxedKey) || buildBoxedKey(numberText);
  const resultBoxedKey = trimString(candidate.resultBoxedKey) || buildBoxedKey(normalizedResult);
  const replaySource = trimString(candidate.replaySource) || trimString(input.replaySource);
  const sourceName = trimString(candidate.sourceName) || trimString(candidate.source_name);
  const rawResult = trimString(candidate.rawResult);
  const sameDay = candidate.sameDay ?? false;
  const daysFromDream = candidate.daysFromDream ?? undefined;
  const metadata = {
    ...(candidate.metadata ?? {}),
    sourceContextId,
    exactSupersedesBox: normalizeHitType(candidate.hitType || primaryHitType) === 'exact',
  };

  return {
    hit: {
      canonicalDrawKey: canonicalDrawKey({
        dreamerId,
        normalizedTerm,
        numberText,
        gameType,
        state,
        drawDate,
        drawTime,
        normalizedResult,
      }),
      backtestHit: {
        dreamerId,
        ...(dreamerName ? { dreamerName } : {}),
        ...(dreamDate ? { dreamDate } : {}),
        termLabel,
        normalizedTerm,
        numberText,
        boxedKey,
        gameType,
        state,
        drawDate,
        drawTime,
        ...(rawResult ? { rawResult } : {}),
        normalizedResult,
        resultBoxedKey,
        hitType: primaryHitType,
        ...(daysFromDream !== undefined ? { daysFromDream } : {}),
        sameDay,
        isVerified: candidate.isVerified ?? candidate.is_verified ?? undefined,
        ...(sourceName ? { sourceName } : {}),
        ...(replaySource ? { replaySource } : {}),
        metadata,
      },
      event: {
        dreamerId,
        ...(dreamerName ? { dreamerName } : {}),
        sourceType: 'backtest',
        backtestDreamId: input.backtestDreamId,
        sourceContextId,
        termLabel,
        normalizedTerm,
        numberText,
        boxedKey,
        gameType,
        state,
        drawDate,
        drawTime,
        ...(rawResult ? { rawResult } : {}),
        normalizedResult,
        resultBoxedKey,
        hitType: primaryHitType,
        ...(daysFromDream !== undefined ? { daysFromDream } : {}),
        sameDay,
        metadata,
      },
    },
  };
}

function dedupeExactOverBox(hits: NormalizedReplayHit[]): NormalizedReplayHit[] {
  const groups = new Map<string, NormalizedReplayHit[]>();
  for (const hit of hits) {
    groups.set(hit.canonicalDrawKey, [...(groups.get(hit.canonicalDrawKey) ?? []), hit]);
  }

  return Array.from(groups.values()).map((group) => {
    const primaryType = choosePrimaryHitType(group.map(hit => hit.backtestHit.hitType));
    return group.find(hit => normalizeHitType(hit.backtestHit.hitType) === primaryType) ?? group[0];
  });
}

export async function persistBacktestReplayEvidence(
  input: PersistBacktestReplayEvidenceInput
): Promise<PersistBacktestReplayEvidenceResult> {
  const storage = input.storage ?? postgresHitEvidenceStorage;
  const warnings: string[] = [];

  if (!trimString(input.ownerUid)) {
    throw new Error('ownerUid is required');
  }
  if (!trimString(input.backtestDreamId)) {
    throw new Error('backtestDreamId is required');
  }

  const normalized: NormalizedReplayHit[] = [];
  input.hits.forEach((candidate, index) => {
    const result = normalizeCandidate(input, candidate, index);
    if (result.warning) warnings.push(result.warning);
    if (result.hit) normalized.push(result.hit);
  });

  const deduped = dedupeExactOverBox(normalized);
  const skippedInvalidRows = input.hits.length - normalized.length;
  const dedupedRows = normalized.length - deduped.length;
  if (dedupedRows > 0) {
    warnings.push(`Deduped ${dedupedRows} exact/box duplicate replay hit row(s)`);
  }

  const backtestHits = deduped.map(hit => hit.backtestHit);
  const personalEvents = deduped.map(hit => hit.event);
  const backtestHitResult = await storage.bulkUpsertBacktestHits(
    input.ownerUid,
    input.backtestDreamId,
    backtestHits
  );
  const eventResult = await storage.bulkUpsertPersonalHitEvents(input.ownerUid, personalEvents);
  const mappingResult = input.rebuildMappings
    ? await storage.rebuildPersonalHitMappingsFromEvents(input.ownerUid)
    : await storage.upsertPersonalHitMappingsFromEvents(input.ownerUid);
  const summary = await storage.rebuildBacktestSummary(input.ownerUid, input.backtestDreamId);

  return {
    backtestHitsAttempted: backtestHitResult.attempted,
    backtestHitsCreated: backtestHitResult.created,
    personalEventsAttempted: eventResult.attempted,
    personalEventsCreated: eventResult.created,
    mappingsUpdated: mappingResult.created,
    summaryUpdated: Boolean(summary),
    skippedInvalidRows,
    warnings,
  };
}
