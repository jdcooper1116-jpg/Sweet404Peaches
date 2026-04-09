// @ts-nocheck
import {
  buildGroupedTermDictionary,
  flattenDictionary,
  normalizeTermLabel,
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getDreamEntryId(row: any): string {
  return String(
    row?.dreamEntryId ??
      row?.sourceDreamEntryId ??
      row?.id ??
      ''
  );
}

export function getLatestDreamTerms(latestDream: any): string[] {
  if (!latestDream || !Array.isArray(latestDream.termMappings)) return [];

  return uniqueStrings(
    latestDream.termMappings.map((mapping: any) =>
      normalizeTermLabel(String(mapping?.term ?? '').trim())
    )
  );
}

export function getLatestDreamNumbers(latestDream: any): string[] {
  if (!latestDream) return [];

  const fromAllNumbers = Array.isArray(latestDream.allNumbers)
    ? latestDream.allNumbers.map((item: any) => String(item?.number ?? ''))
    : [];

  const fromMappings = Array.isArray(latestDream.termMappings)
    ? latestDream.termMappings.flatMap((mapping: any) => [
        ...(Array.isArray(mapping?.cash3Numbers) ? mapping.cash3Numbers.map(String) : []),
        ...(Array.isArray(mapping?.cash4Numbers) ? mapping.cash4Numbers.map(String) : []),
      ])
    : [];

  return uniqueStrings([...fromAllNumbers, ...fromMappings]);
}

function daysSince(dateString: string): number {
  if (!dateString) return 9999;
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 9999;

  const now = new Date();
  const diff = now.getTime() - parsed.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function scoreRecency(lastHitDate: string): number {
  const d = daysSince(lastHitDate);
  if (d <= 7) return 4;
  if (d <= 30) return 3;
  if (d <= 90) return 2;
  if (d <= 180) return 1;
  return 0;
}

function confidenceTier(score: number): 'Emerging' | 'Strong' | 'Very Strong' | 'Elite' {
  if (score >= 28) return 'Elite';
  if (score >= 20) return 'Very Strong';
  if (score >= 12) return 'Strong';
  return 'Emerging';
}

function boxedFamily(value: string): string {
  return value.split('').sort().join('');
}

export function buildLatestDreamForecast(params: {
  latestDream: any | null;
  activeWindows: any[];
  dreamHits: any[];
  mappingRows: PersonalMappingRow[];
}) {
  const { latestDream, activeWindows, dreamHits, mappingRows } = params;

  if (!latestDream) {
    return {
      latestDreamId: '',
      latestDreamTerms: [],
      latestDreamNumbers: [],
      latestDreamWindows: [],
      unresolvedWindows: [],
      resolvedHitsForLatestDream: [],
      resolvedKeys: new Set<string>(),
      recommendationRows: [],
      recommendationStateGroups: [],
    };
  }

  const latestDreamId = String(latestDream.id ?? '');
  const latestDreamTerms = getLatestDreamTerms(latestDream);
  const latestDreamNumbers = getLatestDreamNumbers(latestDream);

  const today = new Date().toISOString().slice(0, 10);

  const latestDreamWindows = activeWindows.filter((row) => {
    const rowDreamId = getDreamEntryId(row);
    const activeEnd = String(row?.activeEnd ?? '');
    return rowDreamId === latestDreamId && (!activeEnd || activeEnd >= today);
  });

  const resolvedHitsForLatestDream = dreamHits.filter(
    (hit) => String(hit?.sourceDreamEntryId ?? '') === latestDreamId
  );

  const resolvedKeys = new Set(
    resolvedHitsForLatestDream.map(
      (hit) =>
        `${String(hit?.gameType ?? '')}__${String(hit?.number ?? '')}__${String(hit?.termLabel ?? '')}`
    )
  );

  const unresolvedMap = new Map<string, any>();

  for (const row of latestDreamWindows) {
    const key = `${String(row?.gameType ?? '')}__${String(row?.number ?? '')}__${String(row?.termLabel ?? '')}`;
    if (resolvedKeys.has(key)) continue;
    if (!unresolvedMap.has(key)) unresolvedMap.set(key, row);
  }

  const unresolvedWindows = Array.from(unresolvedMap.values());

  const grouped = buildGroupedTermDictionary(mappingRows);
  const flat = flattenDictionary(grouped);

  const recommendationRows = unresolvedWindows
    .flatMap((windowRow) => {
      const windowTerm = normalizeText(
        normalizeTermLabel(String(windowRow?.termLabel ?? '').trim())
      );
      const windowNumber = String(windowRow?.number ?? '');
      const windowGame = String(windowRow?.gameType ?? '');
      const windowFamily = boxedFamily(windowNumber);

      const exactMatches = flat.filter(
        (row) =>
          normalizeText(row.term) === windowTerm &&
          row.number === windowNumber &&
          row.gameType === windowGame
      );

      const familyMatches = flat.filter(
        (row) =>
          normalizeText(row.term) === windowTerm &&
          row.gameType === windowGame &&
          row.number !== windowNumber &&
          boxedFamily(row.number) === windowFamily
      );

      const numberOnlyMatches = flat.filter(
        (row) =>
          row.number === windowNumber &&
          row.gameType === windowGame &&
          normalizeText(row.term) !== windowTerm
      );

      const merged = new Map<string, any>();

      for (const row of exactMatches) {
        const key = `${row.term}__${row.number}__${row.state}__${row.gameType}__${row.drawTime}`;
        const score =
          row.stateStrengthScore +
          row.hitCount * 2 +
          row.straightCount * 3 +
          row.boxedCount +
          scoreRecency(row.lastHitDate) +
          8;

        merged.set(key, {
          ...row,
          sourceTerm: windowRow?.termLabel ?? '',
          sourceNumber: windowNumber,
          sourceGameType: windowGame,
          matchType: 'exact',
          reasons: ['Exact term+number historical match'],
          forecastScore: score,
          confidenceTier: confidenceTier(score),
        });
      }

      for (const row of familyMatches) {
        const key = `${row.term}__${row.number}__${row.state}__${row.gameType}__${row.drawTime}`;
        if (merged.has(key)) continue;

        const score =
          row.stateStrengthScore +
          row.hitCount +
          row.straightCount * 2 +
          row.boxedCount +
          scoreRecency(row.lastHitDate) +
          4;

        merged.set(key, {
          ...row,
          sourceTerm: windowRow?.termLabel ?? '',
          sourceNumber: windowNumber,
          sourceGameType: windowGame,
          matchType: 'family',
          reasons: ['Same boxed family for this term'],
          forecastScore: score,
          confidenceTier: confidenceTier(score),
        });
      }

      for (const row of numberOnlyMatches) {
        const key = `${row.term}__${row.number}__${row.state}__${row.gameType}__${row.drawTime}`;
        if (merged.has(key)) continue;

        const score =
          row.stateStrengthScore +
          row.hitCount +
          row.straightCount * 2 +
          scoreRecency(row.lastHitDate) +
          2;

        merged.set(key, {
          ...row,
          sourceTerm: windowRow?.termLabel ?? '',
          sourceNumber: windowNumber,
          sourceGameType: windowGame,
          matchType: 'number-only',
          reasons: ['Number repeated historically outside this exact term'],
          forecastScore: score,
          confidenceTier: confidenceTier(score),
        });
      }

      return Array.from(merged.values());
    })
    .sort((a, b) => {
      if (b.forecastScore !== a.forecastScore) return b.forecastScore - a.forecastScore;
      if (b.stateStrengthScore !== a.stateStrengthScore) return b.stateStrengthScore - a.stateStrengthScore;
      if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
      return b.lastHitDate.localeCompare(a.lastHitDate);
    });

  const recommendationStateGroups = Array.from(
    recommendationRows.reduce((map, row) => {
      if (!map.has(row.state)) {
        map.set(row.state, []);
      }
      map.get(row.state)!.push(row);
      return map;
    }, new Map<string, any[]>())
  )
    .map(([state, rows]) => {
      const uniqueNumbers = new Set(rows.map((row) => row.number));
      const exactCount = rows.filter((row) => row.matchType === 'exact').length;

      const score =
        rows.reduce((sum, row) => sum + row.forecastScore, 0) +
        uniqueNumbers.size +
        exactCount * 3;

      return {
        state,
        rows: rows.sort((a, b) => b.forecastScore - a.forecastScore),
        score,
        uniqueNumbers: uniqueNumbers.size,
        exactCount,
        confidenceTier: confidenceTier(score),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    latestDreamId,
    latestDreamTerms,
    latestDreamNumbers,
    latestDreamWindows,
    unresolvedWindows,
    resolvedHitsForLatestDream,
    resolvedKeys,
    recommendationRows,
    recommendationStateGroups,
  };
}
