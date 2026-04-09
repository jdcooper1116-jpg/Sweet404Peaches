import { buildSevenDayWindow, humanDateParts } from './dateRange';
import { boxedKey, normalizeResult } from './normalize';
import type { AutoFetchRow, ProviderAttempt, ProviderFetchResult } from './types';

const SOURCES = [
  {
    gameType: 'cash3' as const,
    url: 'https://lotteryguru.com/united-states-lottery-results/us-cash-3-ga/us-cash-3-ga-results-history',
  },
  {
    gameType: 'cash4' as const,
    url: 'https://lotteryguru.com/united-states-lottery-results/us-cash-4-ga/us-cash-4-ga-results-history',
  },
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(html: string, isoDate: string) {
  const { weekday, day, month, year } = humanDateParts(isoDate);
  const datePattern = `${escapeRegex(weekday)}[\\s\\S]{0,80}?${day}\\s+${escapeRegex(month)}\\s+${year}`;
  const re = new RegExp(
    datePattern +
      `[\\s\\S]{0,1200}?(?=(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[\\s\\S]{0,80}?\\d{1,2}\\s+[A-Za-z]+\\s+\\d{4}|$)`,
    'i'
  );
  const m = html.match(re);
  return m ? m[0] : '';
}

function extractDrawResult(section: string, drawTime: string, digitsNeeded: number) {
  const re = new RegExp(
    `${escapeRegex(drawTime)}[\\s\\S]{0,300}?((?:<li>\\s*\\d\\s*<\\/li>[\\s\\S]*){${digitsNeeded}})`,
    'i'
  );
  const m = section.match(re);
  if (!m) return '';

  const digits = Array.from(m[1].matchAll(/<li>\s*(\d)\s*<\/li>/gi))
    .map((x) => x[1])
    .join('');

  return digits.length === digitsNeeded ? digits : '';
}

export async function fetchLotteryGuruGeorgiaWindow(startDate: string): Promise<ProviderFetchResult> {
  const attempts: ProviderAttempt[] = [];
  const rows: AutoFetchRow[] = [];
  const dates = buildSevenDayWindow(startDate);

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: {
          'user-agent': 'Mozilla/5.0 Sweet404Peaches Backtesting Fetcher',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        attempts.push({
          provider: `lotteryguru:${source.gameType}`,
          ok: false,
          count: 0,
          message: `HTTP ${res.status}`,
        });
        continue;
      }

      const html = await res.text();
      let count = 0;

      for (const drawDate of dates) {
        const section = extractSection(html, drawDate);
        if (!section) continue;

        for (const drawTime of ['Midday', 'Evening', 'Night'] as const) {
          const raw = extractDrawResult(
            section,
            drawTime,
            source.gameType === 'cash3' ? 3 : 4
          );

          const result = normalizeResult(raw, source.gameType);
          if (!result) continue;

          rows.push({
            state: 'Georgia',
            gameType: source.gameType,
            drawDate,
            drawTime,
            result,
            boxedKey: boxedKey(result),
            sourceProvider: 'lotteryguru',
            sourceUrl: source.url,
            gameLabel: `${source.gameType === 'cash3' ? 'Cash 3' : 'Cash 4'} ${drawTime}`,
          });
          count += 1;
        }
      }

      attempts.push({
        provider: `lotteryguru:${source.gameType}`,
        ok: true,
        count,
        message: count ? 'Fetched rows' : 'No rows found in window',
      });
    } catch (err: any) {
      attempts.push({
        provider: `lotteryguru:${source.gameType}`,
        ok: false,
        count: 0,
        message: err?.message ?? 'Unknown error',
      });
    }
  }

  return { rows, attempts };
}
