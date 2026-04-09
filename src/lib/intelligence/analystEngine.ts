// @ts-nocheck

function normalizeText(value: string) {
  return String(value ?? '').trim().toLowerCase();
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildPerformanceInsights(params: {
  dreamHits: any[];
  personalRows: any[];
  backtestSummaries: any[];
}) {
  const { dreamHits, personalRows, backtestSummaries } = params;

  const hitDays = dreamHits
    .map((row: any) => Number(row.daysFromDream ?? 0))
    .filter((n: number) => Number.isFinite(n));

  const stateMap = new Map<string, { hits: number; straight: number; boxed: number }>();
  const termMap = new Map<string, { hits: number; straight: number; boxed: number }>();
  const gameMap = new Map<string, number>();

  for (const row of personalRows ?? []) {
    const state = String(row.state ?? '');
    const term = String(row.term ?? row.termLabel ?? '');
    const game = String(row.gameType ?? '');

    if (!stateMap.has(state)) stateMap.set(state, { hits: 0, straight: 0, boxed: 0 });
    if (!termMap.has(term)) termMap.set(term, { hits: 0, straight: 0, boxed: 0 });
    if (!gameMap.has(game)) gameMap.set(game, 0);

    const stateBucket = stateMap.get(state)!;
    stateBucket.hits += Number(row.hitCount ?? 0);
    stateBucket.straight += Number(row.straightCount ?? 0);
    stateBucket.boxed += Number(row.boxedCount ?? 0);

    const termBucket = termMap.get(term)!;
    termBucket.hits += Number(row.hitCount ?? 0);
    termBucket.straight += Number(row.straightCount ?? 0);
    termBucket.boxed += Number(row.boxedCount ?? 0);

    gameMap.set(game, gameMap.get(game)! + Number(row.hitCount ?? 0));
  }

  const topState = Array.from(stateMap.entries())
    .map(([state, v]) => ({ state, ...v }))
    .sort((a: any, b: any) => b.hits - a.hits)[0] ?? null;

  const topTerm = Array.from(termMap.entries())
    .map(([term, v]) => ({ term, ...v }))
    .sort((a: any, b: any) => b.hits - a.hits)[0] ?? null;

  const topGame = Array.from(gameMap.entries())
    .map(([gameType, hits]) => ({ gameType, hits }))
    .sort((a: any, b: any) => b.hits - a.hits)[0] ?? null;

  const backtestTotals = backtestSummaries.reduce(
    (acc: any, row: any) => {
      acc.completed += 1;
      acc.totalHits += Number(row.totalHits ?? 0);
      acc.straight += Number(row.straightHits ?? 0);
      acc.boxed += Number(row.boxedHits ?? 0);
      return acc;
    },
    { completed: 0, totalHits: 0, straight: 0, boxed: 0 }
  );

  return {
    avgDaysToHit: Number(avg(hitDays).toFixed(2)),
    fastestHitDay: hitDays.length ? Math.min(...hitDays) : null,
    slowestHitDay: hitDays.length ? Math.max(...hitDays) : null,
    topState,
    topTerm,
    topGame,
    backtestTotals,
  };
}

export function compareEntities(params: {
  personalRows: any[];
  entityType: 'state' | 'term';
  a: string;
  b: string;
}) {
  const { personalRows, entityType, a, b } = params;

  function summarize(label: string) {
    const rows = (personalRows ?? []).filter((row: any) => {
      const source = entityType === 'state'
        ? String(row.state ?? '')
        : String(row.term ?? row.termLabel ?? '');
      return normalizeText(source) === normalizeText(label);
    });

    return {
      label,
      rows: rows.length,
      hits: rows.reduce((sum: number, row: any) => sum + Number(row.hitCount ?? 0), 0),
      straight: rows.reduce((sum: number, row: any) => sum + Number(row.straightCount ?? 0), 0),
      boxed: rows.reduce((sum: number, row: any) => sum + Number(row.boxedCount ?? 0), 0),
      uniqueNumbers: new Set(rows.map((row: any) => String(row.number ?? ''))).size,
      uniqueStates: new Set(rows.map((row: any) => String(row.state ?? ''))).size,
    };
  }

  return {
    left: summarize(a),
    right: summarize(b),
  };
}

export function diagnoseLatestDream(params: {
  latestDream: any | null;
  forecast: any;
  boosted: any;
  dreamHits: any[];
}) {
  const { latestDream, forecast, boosted, dreamHits } = params;

  if (!latestDream) {
    return {
      status: 'No latest dream',
      findings: ['No saved latest dream exists yet, so the system has nothing to diagnose.'],
    };
  }

  const latestDreamId = String(latestDream.id ?? '');
  const relatedHits = (dreamHits ?? []).filter(
    (row: any) => String(row.sourceDreamEntryId ?? '') === latestDreamId
  );

  const findings = [];

  if (!forecast.unresolvedWindows.length && !relatedHits.length) {
    findings.push('The latest dream currently has no unresolved windows and no hit history.');
  }

  if (relatedHits.length) {
    findings.push(`${relatedHits.length} hit event(s) were already logged for the latest dream.`);
  } else {
    findings.push('No resolved hits have been logged yet for the latest dream.');
  }

  if (forecast.unresolvedWindows.length) {
    findings.push(`${forecast.unresolvedWindows.length} unresolved watch item(s) are still active.`);
  } else {
    findings.push('No unresolved watch items remain active.');
  }

  if (boosted?.boostedRows?.length) {
    const top = boosted.boostedRows[0];
    findings.push(`The strongest remaining recommendation is ${top.number} in ${top.state} (${top.term}) with boosted score ${top.boostedScore}.`);
  } else {
    findings.push('There are no boosted recommendations available right now.');
  }

  let status = 'Mixed';
  if (relatedHits.length >= 2) status = 'Productive';
  if (!relatedHits.length && forecast.unresolvedWindows.length >= 5) status = 'Still Developing';
  if (!relatedHits.length && !forecast.unresolvedWindows.length) status = 'Cold';

  return { status, findings };
}

export function buildDailyOpsAlerts(params: {
  latestDream: any | null;
  forecast: any;
  boosted: any;
  promotionModel: any;
}) {
  const { latestDream, forecast, boosted, promotionModel } = params;
  const alerts: string[] = [];

  if (!latestDream) {
    alerts.push('No latest dream is saved yet.');
    return alerts;
  }

  alerts.push(`Latest dream date: ${latestDream.dreamDate || 'unknown date'}.`);

  if (forecast.resolvedHitsForLatestDream?.length) {
    alerts.push(`${forecast.resolvedHitsForLatestDream.length} resolved hit(s) were already removed from the active forecast.`);
  } else {
    alerts.push('No resolved hits have been logged yet for the latest dream.');
  }

  if (forecast.unresolvedWindows?.length) {
    alerts.push(`${forecast.unresolvedWindows.length} unresolved watch item(s) remain live.`);
  } else {
    alerts.push('No unresolved watch items remain live.');
  }

  if (boosted.boostedStateGroups?.[0]) {
    alerts.push(`${boosted.boostedStateGroups[0].state} is the strongest boosted state with ${boosted.boostedStateGroups[0].topLearningTier} support.`);
  }

  if (promotionModel.termCandidates?.[0]) {
    alerts.push(`${promotionModel.termCandidates[0].term} is the strongest Universal Dictionary candidate right now.`);
  }

  if (promotionModel.comboCandidates?.[0]) {
    alerts.push(`${promotionModel.comboCandidates[0].term} → ${promotionModel.comboCandidates[0].number} in ${promotionModel.comboCandidates[0].state} is the strongest Personal Dictionary candidate.`);
  }

  return alerts;
}
