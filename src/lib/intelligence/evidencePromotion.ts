// @ts-nocheck

import { boxedFamilyKey } from '@/lib/intelligence/familyLogic';

function normalizeText(value: string) {
  return String(value ?? '').trim().toLowerCase();
}

function daysSince(dateString: string) {
  if (!dateString) return 9999;
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 9999;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function recencyBoost(lastHitDate: string) {
  const d = daysSince(lastHitDate);
  if (d <= 7) return 5;
  if (d <= 30) return 4;
  if (d <= 90) return 2;
  if (d <= 180) return 1;
  return 0;
}

function universalTier(score: number) {
  if (score >= 45) return 'Canonize';
  if (score >= 28) return 'Promote';
  if (score >= 16) return 'Watch';
  return 'Emerging';
}

function personalTier(score: number) {
  if (score >= 38) return 'Lock';
  if (score >= 24) return 'Strong';
  if (score >= 14) return 'Watch';
  return 'Early';
}

function learningTier(score: number) {
  if (score >= 12) return 'Heavy Boost';
  if (score >= 7) return 'Strong Boost';
  if (score >= 3) return 'Light Boost';
  return 'No Boost';
}

export function buildBacktestSignalMaps(backtestSummaries: any[]) {
  const stateCounts = new Map<string, number>();
  const termCounts = new Map<string, number>();

  for (const row of backtestSummaries ?? []) {
    const state = String(row?.bestState ?? '').trim();
    const term = String(row?.bestTerm ?? '').trim();

    if (state) stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    if (term) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }

  return { stateCounts, termCounts };
}

export function buildEvidencePromotionModel(params: {
  liveRows: any[];
  backtestSummaries: any[];
  familyAnalytics?: any;
}) {
  const { liveRows, backtestSummaries, familyAnalytics } = params;
  const { stateCounts, termCounts } = buildBacktestSignalMaps(backtestSummaries);

  const familyStrengthMap = new Map<string, number>();
  for (const family of familyAnalytics?.families ?? []) {
    familyStrengthMap.set(String(family.familyKey), Number(family.totalHits ?? 0));
  }

  const termMap = new Map<string, any>();

  for (const row of liveRows ?? []) {
    const term = String(row.term ?? '').trim();
    if (!term) continue;

    if (!termMap.has(term)) {
      termMap.set(term, {
        term,
        totalHits: 0,
        straight: 0,
        boxed: 0,
        states: new Set<string>(),
        numbers: new Set<string>(),
        gameTypes: new Set<string>(),
      });
    }

    const bucket = termMap.get(term);
    bucket.totalHits += Number(row.hitCount ?? 0);
    bucket.straight += Number(row.straightCount ?? 0);
    bucket.boxed += Number(row.boxedCount ?? 0);
    bucket.states.add(String(row.state ?? ''));
    bucket.numbers.add(String(row.number ?? ''));
    bucket.gameTypes.add(String(row.gameType ?? ''));
  }

  const termCandidates = Array.from(termMap.values())
    .map((bucket: any) => {
      const termBoost = Number(termCounts.get(bucket.term) ?? 0);
      const familyBoost = Array.from(bucket.numbers).reduce(
        (sum: number, number: string) => sum + Math.min(3, Number(familyStrengthMap.get(boxedFamilyKey(number)) ?? 0)),
        0
      );

      const score =
        bucket.totalHits * 3 +
        bucket.states.size * 3 +
        bucket.straight * 4 +
        bucket.boxed * 2 +
        termBoost * 5 +
        familyBoost;

      return {
        term: bucket.term,
        totalHits: bucket.totalHits,
        straight: bucket.straight,
        boxed: bucket.boxed,
        stateCount: bucket.states.size,
        numberCount: bucket.numbers.size,
        gameTypes: Array.from(bucket.gameTypes),
        backtestTermBoost: termBoost,
        familyBoost,
        promotionScore: score,
        promotionTier: universalTier(score),
      };
    })
    .sort((a: any, b: any) => b.promotionScore - a.promotionScore);

  const comboCandidates = (liveRows ?? [])
    .map((row: any) => {
      const stateBoost = Number(stateCounts.get(String(row.state ?? '')) ?? 0);
      const termBoost = Number(termCounts.get(String(row.term ?? '')) ?? 0);
      const familyBoost = Math.min(5, Number(familyStrengthMap.get(boxedFamilyKey(String(row.number ?? ''))) ?? 0));
      const recentBoost = recencyBoost(String(row.lastHitDate ?? ''));

      const score =
        Number(row.hitCount ?? 0) * 3 +
        Number(row.straightCount ?? 0) * 5 +
        Number(row.boxedCount ?? 0) * 3 +
        Number(row.stateStrengthScore ?? 0) +
        stateBoost * 4 +
        termBoost * 4 +
        familyBoost +
        recentBoost;

      return {
        ...row,
        backtestStateBoost: stateBoost,
        backtestTermBoost: termBoost,
        familyBoost,
        recencyBoost: recentBoost,
        promotionScore: score,
        promotionTier: personalTier(score),
      };
    })
    .sort((a: any, b: any) => b.promotionScore - a.promotionScore);

  const learningSignals = {
    topBacktestStates: Array.from(stateCounts.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topBacktestTerms: Array.from(termCounts.entries())
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };

  return {
    termCandidates,
    comboCandidates,
    learningSignals,
    summary: {
      universalReady: termCandidates.filter((x: any) => x.promotionTier === 'Canonize' || x.promotionTier === 'Promote').length,
      personalReady: comboCandidates.filter((x: any) => x.promotionTier === 'Lock' || x.promotionTier === 'Strong').length,
    },
  };
}

export function applyBacktestLearningBoost(params: {
  recommendationRows: any[];
  backtestSummaries: any[];
  familyAnalytics?: any;
}) {
  const { recommendationRows, backtestSummaries, familyAnalytics } = params;
  const { stateCounts, termCounts } = buildBacktestSignalMaps(backtestSummaries);

  const familyStrengthMap = new Map<string, number>();
  for (const family of familyAnalytics?.families ?? []) {
    familyStrengthMap.set(String(family.familyKey), Number(family.totalHits ?? 0));
  }

  const boostedRows = (recommendationRows ?? [])
    .map((row: any) => {
      const stateBoost = Number(stateCounts.get(String(row.state ?? '')) ?? 0);
      const termBoost = Number(termCounts.get(String(row.term ?? '')) ?? 0);
      const familyBoost = Math.min(5, Number(familyStrengthMap.get(boxedFamilyKey(String(row.number ?? ''))) ?? 0));

      const learningBoost = stateBoost * 3 + termBoost * 3 + familyBoost;
      const boostedScore = Number(row.forecastScore ?? 0) + learningBoost;

      const reasons = [];
      if (stateBoost) reasons.push(`backtest state boost +${stateBoost * 3}`);
      if (termBoost) reasons.push(`backtest term boost +${termBoost * 3}`);
      if (familyBoost) reasons.push(`family memory boost +${familyBoost}`);

      return {
        ...row,
        backtestStateBoost: stateBoost,
        backtestTermBoost: termBoost,
        familyBoost,
        learningBoost,
        boostedScore,
        learningTier: learningTier(learningBoost),
        learningReasons: reasons,
      };
    })
    .sort((a: any, b: any) => b.boostedScore - a.boostedScore);

  const boostedStateGroups = Array.from(
    boostedRows.reduce((map: Map<string, any[]>, row: any) => {
      if (!map.has(row.state)) map.set(row.state, []);
      map.get(row.state)!.push(row);
      return map;
    }, new Map<string, any[]>())
  )
    .map(([state, rows]: any) => ({
      state,
      rows: rows.sort((a: any, b: any) => b.boostedScore - a.boostedScore),
      boostedScore: rows.reduce((sum: number, row: any) => sum + Number(row.boostedScore ?? 0), 0),
      totalLearningBoost: rows.reduce((sum: number, row: any) => sum + Number(row.learningBoost ?? 0), 0),
      topLearningTier: rows[0]?.learningTier ?? 'No Boost',
    }))
    .sort((a: any, b: any) => b.boostedScore - a.boostedScore);

  return { boostedRows, boostedStateGroups };
}
