export type ImportedLotteryRow = {
  state: string;
  game: string;
  date: string;
  rawResult: string;
  normalizedResult: string;
  gameType: 'cash3' | 'cash4';
  drawTime: string;
  bonusBall?: string;
};

function normalizeDate(input: string): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input.trim();
  return parsed.toISOString().slice(0, 10);
}

function extractMainResult(raw: string) {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const main = parts[0] ?? '';
  const normalized = main.replace(/\D/g, '');

  let bonusBall: string | undefined;
  const bonusMatch = raw.match(/\b(?:wild ball|fireball|superball|sum it up)\s*:\s*([0-9]+)/i);
  if (bonusMatch) {
    bonusBall = bonusMatch[1];
  }

  return { main, normalized, bonusBall };
}

function inferGameType(game: string, normalizedResult: string): 'cash3' | 'cash4' {
  const lower = game.toLowerCase();

  if (normalizedResult.length === 4) return 'cash4';
  if (normalizedResult.length === 3) return 'cash3';

  if (
    lower.includes('pick 4') ||
    lower.includes('cash 4') ||
    lower.includes('daily 4')
  ) {
    return 'cash4';
  }

  return 'cash3';
}

function inferDrawTime(game: string): string {
  const lower = game.toLowerCase();

  if (lower.includes('midday')) return 'Midday';
  if (lower.includes('daytime')) return 'Daytime';
  if (lower.includes('day')) return 'Day';
  if (lower.includes('morning')) return 'Morning';
  if (lower.includes('evening')) return 'Evening';
  if (lower.includes('night')) return 'Night';

  const dcMatch = game.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm))\b/i);
  if (dcMatch) return dcMatch[1];

  return 'Unknown';
}

function isHeaderRow(cells: string[]) {
  if (cells.length < 3) return false;
  return (
    cells[0].trim().toLowerCase() === 'game' &&
    cells[1].trim().toLowerCase() === 'draw date' &&
    cells[2].trim().toLowerCase() === 'results'
  );
}

function splitLineIntoCells(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map(x => x.trim());
  }

  const datePattern =
    /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/;

  const match = line.match(datePattern);
  if (!match || match.index === undefined) return [line.trim()];

  const dateText = match[1];
  const before = line.slice(0, match.index).trim();
  const after = line.slice(match.index + dateText.length).trim();

  if (!before || !after) return [line.trim()];
  return [before, dateText, after];
}

export function parseResultsPaste(input: string): ImportedLotteryRow[] {
  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const rows: ImportedLotteryRow[] = [];
  let currentState = '';

  for (const line of lines) {
    const cells = splitLineIntoCells(line).filter(Boolean);

    if (!cells.length) continue;
    if (isHeaderRow(cells)) continue;

    if (cells.length === 1) {
      currentState = cells[0];
      continue;
    }

    if (cells.length >= 4) {
      const state = cells[0];
      const game = cells[1];
      const drawDate = cells[2];
      const resultText = cells.slice(3).join(' ').trim();

      const { main, normalized, bonusBall } = extractMainResult(resultText);
      if (!state || !game || !drawDate || !normalized) continue;

      rows.push({
        state,
        game,
        date: normalizeDate(drawDate),
        rawResult: main,
        normalizedResult: normalized,
        gameType: inferGameType(game, normalized),
        drawTime: inferDrawTime(game),
        bonusBall,
      });

      currentState = state;
      continue;
    }

    if (cells.length === 3 && currentState) {
      const [game, drawDate, resultText] = cells;
      const { main, normalized, bonusBall } = extractMainResult(resultText);

      if (!game || !drawDate || !normalized) continue;

      rows.push({
        state: currentState,
        game,
        date: normalizeDate(drawDate),
        rawResult: main,
        normalizedResult: normalized,
        gameType: inferGameType(game, normalized),
        drawTime: inferDrawTime(game),
        bonusBall,
      });
    }
  }

  return rows;
}
