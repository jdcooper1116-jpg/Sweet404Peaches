import { buildSevenDayWindow, extractYear, humanDateParts } from './dateRange';
import { boxedKey, normalizeResult } from './normalize';
import type { AutoFetchRow, ProviderAttempt, ProviderFetchResult } from './types';

const GAME_PATHS = [
  { gameType: 'cash3' as const, drawTime: 'Midday' as const, path: 'cash-3-midday' },
  { gameType: 'cash3' as const, drawTime: 'Evening' as const, path: 'cash-3-evening' },
  { gameType: 'cash3' as const, drawTime: 'Night' as const, path: 'cash-3-night' },
  { gameType: 'cash4' as const, drawTime: 'Midday' as const, path: 'cash-4-midday' },
  { gameType: 'cash4' as const, drawTime: 'Evening' as const, path: 'cash-4-evening' },
  { gameType: 'cash4' as const, drawTime: 'Night' as const, path: 'cash-4-night' },
];

function buildUrl(path: string, year: string) {
  return `https://www.lottery.net/georgia/${path}/numbers/${year}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDigitsNearDate(html: string, isoDate: string, digitsNeeded: number) {
  const { weekday, month, day, year } = humanDateParts(isoDate);
  const datePattern = `${escapeRegex(weekday)}[\\s\\S]{0,120}?${escapeRegex(month)}\\s+${day},\\s+${year}`;
  const re = new RegExp(
    datePattern + `[\\s\\S]{0,700}?((?:<li>\\s*\\d\\s*<\\/li>[\\s\\S]*){${digitsNeeded}})`,
    'i'
  );
  const m = html.match(re);
  if (!m) return '';

  const digits = Array.from(m[1].matchAll(/<li>\s*(\d)\s*<\/li>/gi))
    .map((x) => x[1])
    .join('');

  return digits.length === digitsNeeded ? digits : '';
}

export async function fetchLotteryNetGeorgiaWindow(startDate: string): Promise<ProviderFetchResult> {
  const attempts: ProviderAttempt[] = [];
  const rows: AutoFetchRow[] = [];
  const windowDates = buildSevenDayWindow(startDate);

  for (const game of GAME_PATHS) {
    const year = extractYear(startDate);
    const url = buildUrl(game.path, year);

    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 Sweet404Peaches Backtesting Fetcher',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        attempts.push({
          provider: `lottery.net:${game.path}`,
          ok: false,
          count: 0,
          message: `HTTP ${res.status}`,
        });
        continue;
      }

      const html = await res.text();
      let count = 0;

      for (const drawDate of windowDates) {
        const raw = extractDigitsNearDate(
          html,
          drawDate,
          game.gameType === 'cash3' ? 3 : 4
        );

        const result = normalizeResult(raw, game.gameType);
        if (!result) continue;

        rows.push({
          state: 'Georgia',
          gameType: game.gameType,
          drawDate,
          drawTime: game.drawTime,
          result,
          boxedKey: boxedKey(result),
          sourceProvider: 'lottery.net',
          sourceUrl: url,
          gameLabel: `${game.gameType === 'cash3' ? 'Cash 3' : 'Cash 4'} ${game.drawTime}`,
        });
        count += 1;
      }

      attempts.push({
        provider: `lottery.net:${game.path}`,
        ok: true,
        count,
        message: count ? 'Fetched rows' : 'No rows found in window',
      });
    } catch (err: any) {
      attempts.push({
        provider: `lottery.net:${game.path}`,
        ok: false,
        count: 0,
        message: err?.message ?? 'Unknown error',
      });
    }
  }

  return { rows, attempts };
}
