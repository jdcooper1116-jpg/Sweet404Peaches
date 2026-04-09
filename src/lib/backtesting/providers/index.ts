import { fetchLotteryGuruGeorgiaWindow } from './lotteryGuruGeorgia';
import { fetchLotteryNetGeorgiaWindow } from './lotteryNetGeorgia';
import type { AutoFetchRow, ProviderFetchResult } from './types';

function dedupeRows(rows: AutoFetchRow[]) {
  const map = new Map<string, AutoFetchRow>();

  for (const row of rows) {
    const key = [
      row.state,
      row.gameType,
      row.drawDate,
      row.drawTime,
      row.result,
    ].join('__');

    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aKey = `${a.drawDate}__${a.gameType}__${a.drawTime}`;
    const bKey = `${b.drawDate}__${b.gameType}__${b.drawTime}`;
    return aKey.localeCompare(bKey);
  });
}

export async function fetchGeorgiaBacktestWindow(startDate: string): Promise<ProviderFetchResult> {
  const primary = await fetchLotteryNetGeorgiaWindow(startDate);
  let rows = [...primary.rows];
  const attempts = [...primary.attempts];

  const weakCoverage = rows.length < 10;

  if (weakCoverage) {
    const fallback = await fetchLotteryGuruGeorgiaWindow(startDate);
    rows = dedupeRows([...rows, ...fallback.rows]);
    attempts.push(...fallback.attempts);
  } else {
    rows = dedupeRows(rows);
  }

  return { rows, attempts };
}
