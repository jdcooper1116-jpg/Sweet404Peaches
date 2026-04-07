import { makeFamilyKey } from '@/lib/sync/numberFamilies';

export type TermStrengthRow = {
  term: string;
  totalHits: number;
  uniqueNumbers: number;
  uniqueStates: number;
  uniqueDreamers: number;
  strongestState: string;
  score: number;
};

export type DreamerReliabilityRow = {
  dreamerScope: string;
  totalPins: number;
  played: number;
  won: number;
  archived: number;
  resolved: number;
  winRate: number;
  score: number;
};

export type StateWeightRow = {
  state: string;
  totalHits: number;
  uniqueTerms: number;
  uniqueNumbers: number;
  score: number;
};

export type DuplicateSignalRow = {
  kind: 'nested-term' | 'duplicate-hit';
  label: string;
  detail: string;
  score: number;
};

export type AutoPinSuggestionRow = {
  key: string;
  playType: 'agreement' | 'boxed' | 'straight' | 'watch';
  label: string;
  number?: string;
  familyKey?: string;
  gameType: 'cash3' | 'cash4';
  state: string;
  dreamerScope: string;
  score: number;
  reasons: string[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(term: string): string {
  if (term.endsWith('s') && term.length > 4) return term.slice(0, -1);
  return term;
}

function nestedTerm(a: string, b: string): boolean {
  const aa = singularize(normalizeTerm(a));
  const bb = singularize(normalizeTerm(b));
  if (!aa || !bb || aa === bb) return false;
  return aa.includes(bb) || bb.includes(aa);
}

export function buildTermStrengthStats(memory: any[]): TermStrengthRow[] {
  const map = new Map<string, {
    term: string;
    totalHits: number;
    numbers: string[];
    states: string[];
    dreamers: string[];
    stateTotals: Map<string, number>;
  }>();

  for (const row of memory) {
    const term = row.termLabel || 'unknown';
    const key = normalizeTerm(term) || term.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        term,
        totalHits: 0,
        numbers: [],
        states: [],
        dreamers: [],
        stateTotals: new Map<string, number>(),
      });
    }

    const item = map.get(key)!;
    const count = row.hitCount || 0;
    item.totalHits += count;
    item.numbers.push(row.number);
    item.states.push(row.state);
    item.dreamers.push(row.dreamerName);
    item.stateTotals.set(row.state, (item.stateTotals.get(row.state) || 0) + count);
  }

  return Array.from(map.values())
    .map(item => {
      const strongestState =
        Array.from(item.stateTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

      const uniqueNumbers = unique(item.numbers).length;
      const uniqueStates = unique(item.states).length;
      const uniqueDreamers = unique(item.dreamers).length;

      return {
        term: item.term,
        totalHits: item.totalHits,
        uniqueNumbers,
        uniqueStates,
        uniqueDreamers,
        strongestState,
        score:
          item.totalHits * 10 +
          uniqueNumbers * 5 +
          uniqueStates * 4 +
          uniqueDreamers * 6,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.term.localeCompare(b.term);
    });
}

export function buildDreamerReliabilityStats(pins: any[]): DreamerReliabilityRow[] {
  const map = new Map<string, {
    scope: string;
    totalPins: number;
    played: number;
    won: number;
    archived: number;
  }>();

  for (const row of pins) {
    const scope = row.dreamerScope || 'ALL';
    if (!map.has(scope)) {
      map.set(scope, {
        scope,
        totalPins: 0,
        played: 0,
        won: 0,
        archived: 0,
      });
    }

    const item = map.get(scope)!;
    item.totalPins += 1;
    if (row.status === 'played') item.played += 1;
    if (row.status === 'won') item.won += 1;
    if (row.status === 'archived') item.archived += 1;
  }

  return Array.from(map.values())
    .map(item => {
      const resolved = item.played + item.won;
      const winRate = resolved ? item.won / resolved : 0;

      return {
        dreamerScope: item.scope,
        totalPins: item.totalPins,
        played: item.played,
        won: item.won,
        archived: item.archived,
        resolved,
        winRate,
        score: item.won * 20 + resolved * 4 + winRate * 100,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.dreamerScope.localeCompare(b.dreamerScope);
    });
}

export function buildStateWeightStats(memory: any[]): StateWeightRow[] {
  const map = new Map<string, {
    state: string;
    totalHits: number;
    terms: string[];
    numbers: string[];
  }>();

  for (const row of memory) {
    const state = row.state || '—';
    if (!map.has(state)) {
      map.set(state, {
        state,
        totalHits: 0,
        terms: [],
        numbers: [],
      });
    }

    const item = map.get(state)!;
    const count = row.hitCount || 0;
    item.totalHits += count;
    item.terms.push(row.termLabel);
    item.numbers.push(row.number);
  }

  return Array.from(map.values())
    .map(item => {
      const uniqueTerms = unique(item.terms).length;
      const uniqueNumbers = unique(item.numbers).length;
      return {
        state: item.state,
        totalHits: item.totalHits,
        uniqueTerms,
        uniqueNumbers,
        score: item.totalHits * 10 + uniqueTerms * 4 + uniqueNumbers * 3,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.state.localeCompare(b.state);
    });
}

export function buildDuplicateSignals(dreams: any[], memory: any[]): DuplicateSignalRow[] {
  const rows: DuplicateSignalRow[] = [];

  for (const dream of dreams) {
    const mappings = dream.termMappings || [];
    for (let i = 0; i < mappings.length; i += 1) {
      for (let j = i + 1; j < mappings.length; j += 1) {
        const a = mappings[i]?.term || '';
        const b = mappings[j]?.term || '';
        if (!a || !b) continue;
        if (nestedTerm(a, b)) {
          rows.push({
            kind: 'nested-term',
            label: `${dream.dreamerName}: ${a} ↔ ${b}`,
            detail: 'Possible nested phrase overlap inside one dream entry.',
            score: 20,
          });
        }
      }
    }
  }

  const dupMap = new Map<string, { count: number; sample: any }>();

  for (const row of memory) {
    const key = [
      row.dreamerName || '',
      normalizeTerm(row.termLabel || ''),
      row.number || '',
      row.state || '',
      row.hitType || '',
      row.gameType || '',
    ].join('__');

    if (!dupMap.has(key)) dupMap.set(key, { count: 0, sample: row });
    dupMap.get(key)!.count += 1;
  }

  for (const value of dupMap.values()) {
    if (value.count > 1) {
      rows.push({
        kind: 'duplicate-hit',
        label: `${value.sample.dreamerName}: ${value.sample.termLabel} → ${value.sample.number}`,
        detail: `Duplicate personal hit mappings detected (${value.count} rows).`,
        score: value.count * 15,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
}

export function buildAutoPinSuggestions(input: {
  hotFamilies: any[];
  filteredMemory: any[];
  selectedState: string;
  dreamerScope: string;
  reliabilityRows: DreamerReliabilityRow[];
}): AutoPinSuggestionRow[] {
  const { hotFamilies, filteredMemory, selectedState, dreamerScope, reliabilityRows } = input;

  const reliabilityBonus =
    reliabilityRows.find(row => row.dreamerScope === dreamerScope)?.score ??
    reliabilityRows.find(row => row.dreamerScope === 'ALL')?.score ??
    0;

  const stateRows = filteredMemory.filter(row => row.state === selectedState);

  const familyMap = new Map<string, {
    totalHits: number;
    straightHits: number;
    boxedHits: number;
    terms: string[];
    numbers: string[];
  }>();

  const exactMap = new Map<string, {
    totalHits: number;
    straightHits: number;
    boxedHits: number;
    terms: string[];
  }>();

  for (const row of stateRows) {
    const familyKey = makeFamilyKey(row.number);
    const familyId = `${row.gameType}__${familyKey}`;

    if (!familyMap.has(familyId)) {
      familyMap.set(familyId, {
        totalHits: 0,
        straightHits: 0,
        boxedHits: 0,
        terms: [],
        numbers: [],
      });
    }

    const fam = familyMap.get(familyId)!;
    const count = row.hitCount || 0;
    fam.totalHits += count;
    if (row.hitType === 'straight') fam.straightHits += count;
    if (row.hitType === 'boxed') fam.boxedHits += count;
    fam.terms.push(row.termLabel);
    fam.numbers.push(row.number);

    const exactId = `${row.gameType}__${row.number}`;
    if (!exactMap.has(exactId)) {
      exactMap.set(exactId, {
        totalHits: 0,
        straightHits: 0,
        boxedHits: 0,
        terms: [],
      });
    }

    const ex = exactMap.get(exactId)!;
    ex.totalHits += count;
    if (row.hitType === 'straight') ex.straightHits += count;
    if (row.hitType === 'boxed') ex.boxedHits += count;
    ex.terms.push(row.termLabel);
  }

  const suggestions: AutoPinSuggestionRow[] = [];

  for (const family of hotFamilies) {
    const familyId = `${family.gameType}__${family.familyKey}`;
    const familyState = familyMap.get(familyId);
    const overlapTerms = unique(family.terms).filter((term: string) =>
      (familyState?.terms || []).map(t => String(t).toLowerCase()).includes(term.toLowerCase())
    );

    const familyBaseScore =
      family.score +
      (familyState?.totalHits || 0) * 10 +
      overlapTerms.length * 20 +
      reliabilityBonus * 0.25;

    for (const form of family.forms) {
      const ex = exactMap.get(`${family.gameType}__${form}`);
      if (ex && ex.straightHits >= 2) {
        suggestions.push({
          key: `straight__${family.gameType}__${form}`,
          playType: 'straight',
          label: `Straight ${form}`,
          number: form,
          familyKey: family.familyKey,
          gameType: family.gameType,
          state: selectedState,
          dreamerScope,
          score: familyBaseScore + ex.straightHits * 18,
          reasons: [
            `Active family score ${family.score}`,
            `${selectedState} straight support ${ex.straightHits}`,
            overlapTerms.length ? `Overlap terms: ${overlapTerms.join(', ')}` : 'No direct term overlap yet',
            `Dreamer reliability bonus ${reliabilityBonus.toFixed(1)}`,
          ],
        });
      }
    }

    if ((familyState?.boxedHits || 0) >= 2) {
      suggestions.push({
        key: `boxed__${family.gameType}__${family.familyKey}`,
        playType: 'boxed',
        label: `Box Family ${family.familyKey}`,
        familyKey: family.familyKey,
        gameType: family.gameType,
        state: selectedState,
        dreamerScope,
        score: familyBaseScore + (familyState?.boxedHits || 0) * 16,
        reasons: [
          `Active family score ${family.score}`,
          `${selectedState} boxed support ${familyState?.boxedHits || 0}`,
          overlapTerms.length ? `Overlap terms: ${overlapTerms.join(', ')}` : 'State box history supports family',
          `Dreamer reliability bonus ${reliabilityBonus.toFixed(1)}`,
        ],
      });
    }

    if ((familyState?.totalHits || 0) >= 1 && overlapTerms.length >= 1) {
      suggestions.push({
        key: `agreement__${family.gameType}__${family.familyKey}`,
        playType: 'agreement',
        label: `Agreement Family ${family.familyKey}`,
        familyKey: family.familyKey,
        gameType: family.gameType,
        state: selectedState,
        dreamerScope,
        score: familyBaseScore + overlapTerms.length * 18,
        reasons: [
          `Active family score ${family.score}`,
          `${selectedState} family support ${familyState?.totalHits || 0}`,
          `Term-family agreement: ${overlapTerms.join(', ')}`,
          `Dreamer reliability bonus ${reliabilityBonus.toFixed(1)}`,
        ],
      });
    }

    if ((familyState?.totalHits || 0) === 0 && family.score >= 40) {
      suggestions.push({
        key: `watch__${family.gameType}__${family.familyKey}`,
        playType: 'watch',
        label: `Watch Family ${family.familyKey}`,
        familyKey: family.familyKey,
        gameType: family.gameType,
        state: selectedState,
        dreamerScope,
        score: family.score + reliabilityBonus * 0.15,
        reasons: [
          `Active family score ${family.score}`,
          `No ${selectedState} history yet`,
          'Watch until stronger evidence forms',
        ],
      });
    }
  }

  const deduped = new Map<string, AutoPinSuggestionRow>();
  for (const row of suggestions) {
    if (!deduped.has(row.key) || deduped.get(row.key)!.score < row.score) {
      deduped.set(row.key, row);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
}
