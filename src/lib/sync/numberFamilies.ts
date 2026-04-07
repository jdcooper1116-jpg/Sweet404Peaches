import type { ActiveDreamWindow, GameType, PersonalHitMapping } from '@/lib/types';

export type NumberFamilySummary = {
  familyKey: string;
  gameType: GameType;
  forms: string[];
  terms: string[];
  dreamers: string[];
  activeCount: number;
  priorHits: number;
  georgiaHits: number;
  straightHits: number;
  boxedHits: number;
  score: number;
  reasons: string[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function makeFamilyKey(value: string): string {
  return value.split('').sort().join('');
}

export function summarizeNumberFamilies(
  windows: ActiveDreamWindow[],
  memory: PersonalHitMapping[] = []
): NumberFamilySummary[] {
  const map = new Map<string, NumberFamilySummary>();

  for (const win of windows) {
    const familyKey = makeFamilyKey(win.number);
    const key = `${win.gameType}__${familyKey}`;

    if (!map.has(key)) {
      map.set(key, {
        familyKey,
        gameType: win.gameType,
        forms: [],
        terms: [],
        dreamers: [],
        activeCount: 0,
        priorHits: 0,
        georgiaHits: 0,
        straightHits: 0,
        boxedHits: 0,
        score: 0,
        reasons: [],
      });
    }

    const item = map.get(key)!;
    item.activeCount += 1;
    item.forms.push(win.number);
    item.terms.push(win.termLabel);
    item.dreamers.push(win.dreamerName);
  }

  for (const item of map.values()) {
    const relatedMemory = memory.filter(
      row => row.gameType === item.gameType && makeFamilyKey(row.number) === item.familyKey
    );

    item.forms = unique(item.forms).sort();
    item.terms = unique(item.terms).sort();
    item.dreamers = unique(item.dreamers).sort();

    item.priorHits = relatedMemory.reduce((sum, row) => sum + (row.hitCount || 0), 0);
    item.georgiaHits = relatedMemory
      .filter(row => row.state === 'GA')
      .reduce((sum, row) => sum + (row.hitCount || 0), 0);
    item.straightHits = relatedMemory
      .filter(row => row.hitType === 'straight')
      .reduce((sum, row) => sum + (row.hitCount || 0), 0);
    item.boxedHits = relatedMemory
      .filter(row => row.hitType === 'boxed')
      .reduce((sum, row) => sum + (row.hitCount || 0), 0);

    item.score =
      item.activeCount * 10 +
      item.forms.length * 8 +
      item.terms.length * 7 +
      item.dreamers.length * 8 +
      item.priorHits * 6 +
      item.georgiaHits * 5 +
      item.straightHits * 3 +
      item.boxedHits * 2;

    const reasons: string[] = [];
    reasons.push(`Active in ${item.activeCount} window(s)`);
    reasons.push(`Forms seen: ${item.forms.join(', ')}`);

    if (item.terms.length) {
      reasons.push(`Terms: ${item.terms.join(', ')}`);
    }

    if (item.dreamers.length) {
      reasons.push(`Dreamers: ${item.dreamers.join(', ')}`);
    }

    if (item.priorHits > 0) {
      reasons.push(`Prior saved hits: ${item.priorHits}`);
    }

    if (item.georgiaHits > 0) {
      reasons.push(`Georgia saved hits: ${item.georgiaHits}`);
    }

    item.reasons = reasons;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
    return a.familyKey.localeCompare(b.familyKey);
  });
}
