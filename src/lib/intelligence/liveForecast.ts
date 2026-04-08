import {
  buildGroupedTermDictionary,
  computeForecastScore,
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

  const resolvedKeys = new Set(
    dreamHits
      .filter((hit) => String(hit?.sourceDreamEntryId ?? '') === latestDreamId)
      .map((hit) => `${String(hit?.gameType ?? '')}__${String(hit?.number ?? '')}`)
  );

  const unresolvedMap = new Map<string, any>();

  for (const row of latestDreamWindows) {
    const key = `${String(row?.gameType ?? '')}__${String(row?.number ?? '')}__${String(row?.termLabel ?? '')}`;
    const resolvedKey = `${String(row?.gameType ?? '')}__${String(row?.number ?? '')}`;
    if (resolvedKeys.has(resolvedKey)) continue;
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

      const exactMatches = flat.filter(
        (row) =>
          normalizeText(row.term) === windowTerm &&
          row.number === windowNumber &&
          row.gameType === windowGame
      );

      return exactMatches.map((row) => ({
        ...row,
        sourceTerm: windowRow?.termLabel ?? '',
        sourceNumber: windowNumber,
        forecastScore: computeForecastScore(row) + 6,
      }));
    })
    .sort((a, b) => b.forecastScore - a.forecastScore);

  const recommendationStateGroups = Array.from(
    recommendationRows.reduce((map, row) => {
      if (!map.has(row.state)) {
        map.set(row.state, []);
      }
      map.get(row.state)!.push(row);
      return map;
    }, new Map<string, any[]>())
  )
    .map(([state, rows]) => ({
      state,
      rows: rows.sort((a, b) => b.forecastScore - a.forecastScore),
      score: rows.reduce((sum, row) => sum + row.forecastScore, 0),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    latestDreamId,
    latestDreamTerms,
    latestDreamNumbers,
    latestDreamWindows,
    unresolvedWindows,
    resolvedKeys,
    recommendationRows,
    recommendationStateGroups,
  };
}
