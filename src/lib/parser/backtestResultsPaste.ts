import type { DrawTime, GameType, LotteryResult } from '@/lib/types';

export type BacktestParsedRow = Omit<
  LotteryResult,
  'id' | 'ownerUid' | 'importedAt' | 'boxedKey'
> & {
  gameLabel: string;
  bonusText?: string;
};

function normalizeResult(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.trim();
  return parsed.toISOString().slice(0, 10);
}

function extractPrimaryResult(value: string) {
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  const rawResult = parts[0] ?? '';
  const normalizedResult = normalizeResult(rawResult);
  const bonusText = parts.slice(1).join(', ') || undefined;

  return { rawResult, normalizedResult, bonusText };
}

function inferGameType(gameRaw: string, normalizedResult: string): GameType | null {
  if (normalizedResult.length === 3) return 'cash3';
  if (normalizedResult.length === 4) return 'cash4';

  const v = gameRaw.trim().toLowerCase();

  if (
    v.includes('cash 3') ||
    v.includes('pick 3') ||
    v.includes('daily 3') ||
    v.includes('play 3') ||
    v.includes('numbers') ||
    v.includes('pega 3') ||
    v.includes('dc-3')
  ) {
    return 'cash3';
  }

  if (
    v.includes('cash 4') ||
    v.includes('pick 4') ||
    v.includes('daily 4') ||
    v.includes('play 4') ||
    v.includes('win 4') ||
    v.includes('numbers game') ||
    v.includes('pega 4') ||
    v.includes('dc-4')
  ) {
    return 'cash4';
  }

  return null;
}

function parseDrawTime(value: string): DrawTime {
  const v = value.trim().toLowerCase();

  if (v.includes('night')) return 'night';
  if (v.includes('evening')) return 'evening';

  if (
    v.includes('midday') ||
    v.includes('daytime') ||
    /\bday\b/.test(v) ||
    v.includes('morning') ||
    /\b\d{1,2}:\d{2}\s*(am|pm)\b/i.test(value) ||
    /\b\d{1,2}(am|pm)\b/i.test(value)
  ) {
    return 'midday';
  }

  return 'unknown';
}

function isHeaderRow(parts: string[]): boolean {
  if (parts.length < 3) return false;

  return (
    parts[0].trim().toLowerCase() === 'game' &&
    parts[1].trim().toLowerCase() === 'draw date' &&
    parts[2].trim().toLowerCase() === 'results'
  );
}

function splitLineIntoCells(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map(p => p.trim()).filter(Boolean);
  }

  const datePattern =
    /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/;

  const match = line.match(datePattern);
  if (match && match.index !== undefined) {
    const dateText = match[1];
    const before = line.slice(0, match.index).trim();
    const after = line.slice(match.index + dateText.length).trim();

    if (before && after) {
      return [before, dateText, after];
    }
  }

  if (line.includes(',')) {
    return line.split(',').map(p => p.trim()).filter(Boolean);
  }

  return [line.trim()];
}

export function parseBacktestResultsPaste(raw: string): BacktestParsedRow[] {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const rows: BacktestParsedRow[] = [];
  let currentState = '';

  for (const line of lines) {
    const parts = splitLineIntoCells(line).filter(Boolean);

    if (!parts.length) continue;
    if (isHeaderRow(parts)) continue;

    if (parts.length === 1) {
      currentState = parts[0];
      continue;
    }

    if (parts.length >= 5) {
      const [state, date, gameRaw, drawTimeRaw, resultRaw] = parts;

      const { rawResult, normalizedResult, bonusText } = extractPrimaryResult(resultRaw);
      const gameType = inferGameType(gameRaw, normalizedResult);
      if (!gameType) continue;

      if (
        (gameType === 'cash3' && normalizedResult.length !== 3) ||
        (gameType === 'cash4' && normalizedResult.length !== 4)
      ) {
        continue;
      }

      rows.push({
        state,
        date: normalizeDate(date),
        gameType,
        drawTime: parseDrawTime(drawTimeRaw),
        rawResult,
        normalizedResult,
        sourceType: 'paste',
        gameLabel: gameRaw,
        bonusText,
      });

      currentState = state;
      continue;
    }

    if (parts.length === 3 && currentState) {
      const [gameRaw, date, resultRaw] = parts;

      const { rawResult, normalizedResult, bonusText } = extractPrimaryResult(resultRaw);
      const gameType = inferGameType(gameRaw, normalizedResult);
      if (!gameType) continue;

      if (
        (gameType === 'cash3' && normalizedResult.length !== 3) ||
        (gameType === 'cash4' && normalizedResult.length !== 4)
      ) {
        continue;
      }

      rows.push({
        state: currentState,
        date: normalizeDate(date),
        gameType,
        drawTime: parseDrawTime(gameRaw),
        rawResult,
        normalizedResult,
        sourceType: 'paste',
        gameLabel: gameRaw,
        bonusText,
      });
    }
  }

  return rows;
}
