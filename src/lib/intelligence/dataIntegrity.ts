// @ts-nocheck

function keyOf(parts: any[]) {
  return parts.map((x) => String(x ?? '')).join('__');
}

function groupDuplicates(rows: any[], keyBuilder: (row: any) => string) {
  const map = new Map<string, any[]>();

  for (const row of rows ?? []) {
    const key = keyBuilder(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  return Array.from(map.entries())
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      count: items.length,
      sample: items[0],
    }))
    .sort((a, b) => b.count - a.count);
}

export function buildIntegrityAudit(params: {
  activeWindows: any[];
  dreamHits: any[];
  personalRows: any[];
  backtestDreams: any[];
  backtestHits: any[];
}) {
  const { activeWindows, dreamHits, personalRows, backtestDreams, backtestHits } = params;

  const duplicateLiveHits = groupDuplicates(
    dreamHits,
    (row) =>
      keyOf([
        row.sourceDreamEntryId,
        row.termLabel,
        row.number,
        row.state,
        row.drawDate,
        row.drawTime,
        row.hitType,
      ])
  );

  const duplicatePersonalMappings = groupDuplicates(
    personalRows,
    (row) =>
      keyOf([
        row.term,
        row.number,
        row.state,
        row.gameType,
        row.lastHitDate,
        row.latestHitType,
      ])
  );

  const duplicateBacktestHits = groupDuplicates(
    backtestHits,
    (row) =>
      keyOf([
        row.backtestDreamId,
        row.termLabel,
        row.number,
        row.state,
        row.drawDate,
        row.drawTime,
        row.hitType,
      ])
  );

  const orphanActiveWindows = (activeWindows ?? []).filter(
    (row: any) => !String(row?.dreamEntryId ?? row?.sourceDreamEntryId ?? '').trim()
  );

  const orphanDreamHits = (dreamHits ?? []).filter(
    (row: any) => !String(row?.sourceDreamEntryId ?? '').trim()
  );

  const weakBacktestDreams = (backtestDreams ?? []).filter((row: any) => {
    const termMappings = Array.isArray(row?.parsedTermMappings) ? row.parsedTermMappings : [];
    return !termMappings.length;
  });

  const orphanBacktestHits = (backtestHits ?? []).filter(
    (row: any) => !String(row?.backtestDreamId ?? '').trim()
  );

  return {
    duplicateLiveHits,
    duplicatePersonalMappings,
    duplicateBacktestHits,
    orphanActiveWindows,
    orphanDreamHits,
    orphanBacktestHits,
    weakBacktestDreams,
    summary: {
      duplicateLiveHits: duplicateLiveHits.length,
      duplicatePersonalMappings: duplicatePersonalMappings.length,
      duplicateBacktestHits: duplicateBacktestHits.length,
      orphanActiveWindows: orphanActiveWindows.length,
      orphanDreamHits: orphanDreamHits.length,
      orphanBacktestHits: orphanBacktestHits.length,
      weakBacktestDreams: weakBacktestDreams.length,
    },
  };
}
