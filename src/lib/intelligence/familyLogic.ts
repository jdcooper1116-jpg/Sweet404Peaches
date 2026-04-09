// @ts-nocheck

function digitsOnly(value: string) {
  return String(value ?? '').replace(/\D/g, '');
}

export function boxedFamilyKey(value: string) {
  return digitsOnly(value).split('').sort().join('');
}

export function reversedNumber(value: string) {
  return digitsOnly(value).split('').reverse().join('');
}

export function digitPatternTag(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return 'unknown';

  const counts = {};
  for (const d of digits) counts[d] = (counts[d] ?? 0) + 1;
  const freq = Object.values(counts).sort((a: any, b: any) => b - a);

  if (digits.length === 3) {
    if (freq[0] === 3) return 'triple';
    if (freq[0] === 2) return 'double';
    return 'all-different';
  }

  if (digits.length === 4) {
    if (freq[0] === 4) return 'quad';
    if (freq[0] === 3) return 'triple-plus-single';
    if (freq[0] === 2 && freq[1] === 2) return 'double-double';
    if (freq[0] === 2) return 'double';
    return 'all-different';
  }

  return 'other';
}

export function buildFamilyAnalytics(rows: any[]) {
  const familyMap = new Map();

  for (const row of rows) {
    const number = digitsOnly(row.number);
    if (!number) continue;

    const familyKey = boxedFamilyKey(number);
    const tag = digitPatternTag(number);
    const reverse = reversedNumber(number);
    const state = String(row.state ?? '');
    const term = String(row.term ?? row.termLabel ?? '');
    const gameType = String(row.gameType ?? '');
    const latestHitType = String(row.latestHitType ?? row.hitType ?? '');
    const hitCount = Number(row.hitCount ?? 1);
    const straightCount = Number(row.straightCount ?? (latestHitType === 'straight' ? 1 : 0));
    const boxedCount = Number(row.boxedCount ?? (latestHitType === 'boxed' ? 1 : 0));
    const strength = Number(row.stateStrengthScore ?? row.forecastScore ?? hitCount);

    if (!familyMap.has(familyKey)) {
      familyMap.set(familyKey, {
        familyKey,
        sampleNumbers: new Set(),
        states: new Map(),
        terms: new Map(),
        totalHits: 0,
        straightHits: 0,
        boxedHits: 0,
        totalStrength: 0,
        patternTag: tag,
        reversals: new Set(),
        gameTypes: new Set(),
      });
    }

    const family = familyMap.get(familyKey);
    family.sampleNumbers.add(number);
    family.reversals.add(reverse);
    family.gameTypes.add(gameType);
    family.totalHits += hitCount;
    family.straightHits += straightCount;
    family.boxedHits += boxedCount;
    family.totalStrength += strength;

    if (!family.states.has(state)) {
      family.states.set(state, { state, hits: 0, strength: 0, numbers: new Set(), terms: new Set() });
    }
    const stateBucket = family.states.get(state);
    stateBucket.hits += hitCount;
    stateBucket.strength += strength;
    stateBucket.numbers.add(number);
    stateBucket.terms.add(term);

    if (!family.terms.has(term)) {
      family.terms.set(term, { term, hits: 0, strength: 0, states: new Set(), numbers: new Set() });
    }
    const termBucket = family.terms.get(term);
    termBucket.hits += hitCount;
    termBucket.strength += strength;
    termBucket.states.add(state);
    termBucket.numbers.add(number);
  }

  const families = Array.from(familyMap.values()).map((family: any) => {
    const topStates = Array.from(family.states.values())
      .map((s: any) => ({
        state: s.state,
        hits: s.hits,
        strength: s.strength,
        numberCount: s.numbers.size,
        termCount: s.terms.size,
      }))
      .sort((a: any, b: any) => b.strength - a.strength);

    const topTerms = Array.from(family.terms.values())
      .map((t: any) => ({
        term: t.term,
        hits: t.hits,
        strength: t.strength,
        stateCount: t.states.size,
        numberCount: t.numbers.size,
      }))
      .sort((a: any, b: any) => b.strength - a.strength);

    return {
      familyKey: family.familyKey,
      sampleNumbers: Array.from(family.sampleNumbers).sort(),
      reversals: Array.from(family.reversals).sort(),
      gameTypes: Array.from(family.gameTypes).sort(),
      totalHits: family.totalHits,
      straightHits: family.straightHits,
      boxedHits: family.boxedHits,
      totalStrength: family.totalStrength,
      patternTag: family.patternTag,
      stateCount: topStates.length,
      termCount: topTerms.length,
      topStates,
      topTerms,
    };
  });

  const sortedFamilies = families.sort((a: any, b: any) => {
    if (b.totalStrength !== a.totalStrength) return b.totalStrength - a.totalStrength;
    return b.totalHits - a.totalHits;
  });

  return {
    families: sortedFamilies,
    doubles: sortedFamilies.filter((f: any) => f.patternTag === 'double'),
    triples: sortedFamilies.filter((f: any) => f.patternTag === 'triple'),
    doubleDoubles: sortedFamilies.filter((f: any) => f.patternTag === 'double-double'),
    allDifferent: sortedFamilies.filter((f: any) => f.patternTag === 'all-different'),
  };
}
