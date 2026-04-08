export type PersonalMappingRow = {
  id: string;
  termLabel?: string;
  number?: string;
  state?: string;
  gameType?: 'cash3' | 'cash4';
  drawTime?: string;
  drawDate?: string;
  hitType?: 'straight' | 'boxed';
  hitCount?: number;
  straightCount?: number;
  boxedCount?: number;
  stateStrengthScore?: number;
  lastHitDate?: string;
};

export type StateRecord = {
  state: string;
  gameType: string;
  drawTime: string;
  hitCount: number;
  straightCount: number;
  boxedCount: number;
  stateStrengthScore: number;
  lastHitDate: string;
  latestHitType: string;
};

export type NumberGroup = {
  number: string;
  states: StateRecord[];
  totalHits: number;
};

export type TermGroup = {
  term: string;
  letter: string;
  numbers: NumberGroup[];
  totalHits: number;
};

export type TermStateRecord = {
  term: string;
  letter: string;
  number: string;
  state: string;
  gameType: string;
  drawTime: string;
  hitCount: number;
  straightCount: number;
  boxedCount: number;
  stateStrengthScore: number;
  lastHitDate: string;
  latestHitType: string;
  totalNumberHits: number;
  totalTermHits: number;
};

export function normalizeTermLabel(term: string) {
  const cleaned = term.trim();
  if (cleaned === 'direct-cash3' || cleaned === 'direct-cash4') {
    return 'Unmapped Direct Numbers';
  }
  return cleaned;
}

export function termLetter(term: string) {
  const ch = term.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sortNumberStrings(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function buildGroupedTermDictionary(rows: PersonalMappingRow[]): TermGroup[] {
  const termMap = new Map<string, TermGroup>();

  for (const row of rows) {
    const rawTerm = String(row.termLabel ?? '').trim();
    if (!rawTerm) continue;

    const term = normalizeTermLabel(rawTerm);
    const termKey = term.toLowerCase();

    if (!termMap.has(termKey)) {
      termMap.set(termKey, {
        term,
        letter: termLetter(term),
        numbers: [],
        totalHits: 0,
      });
    }

    const termGroup = termMap.get(termKey)!;
    const numberValue = String(row.number ?? '').trim();
    if (!numberValue) continue;

    let numberGroup = termGroup.numbers.find(n => n.number === numberValue);
    if (!numberGroup) {
      numberGroup = {
        number: numberValue,
        states: [],
        totalHits: 0,
      };
      termGroup.numbers.push(numberGroup);
    }

    const state = String(row.state ?? 'Unknown').trim() || 'Unknown';
    const gameType = String(row.gameType ?? 'unknown').trim() || 'unknown';
    const drawTime = String(row.drawTime ?? 'unknown').trim() || 'unknown';
    const key = `${state}__${gameType}__${drawTime}`;

    let stateRecord = numberGroup.states.find(
      s => `${s.state}__${s.gameType}__${s.drawTime}` === key
    );

    const hitCount = Number(row.hitCount ?? 1);
    const straightCount =
      row.straightCount !== undefined
        ? Number(row.straightCount)
        : row.hitType === 'straight'
          ? hitCount
          : 0;

    const boxedCount =
      row.boxedCount !== undefined
        ? Number(row.boxedCount)
        : row.hitType === 'boxed'
          ? hitCount
          : 0;

    const stateStrengthScore =
      row.stateStrengthScore !== undefined
        ? Number(row.stateStrengthScore)
        : straightCount * 3 + boxedCount;

    const lastHitDate = String(row.lastHitDate ?? row.drawDate ?? '').trim();
    const latestHitType =
      straightCount > 0 && boxedCount > 0
        ? 'mixed'
        : straightCount > 0
          ? 'straight'
          : 'boxed';

    if (!stateRecord) {
      stateRecord = {
        state,
        gameType,
        drawTime,
        hitCount,
        straightCount,
        boxedCount,
        stateStrengthScore,
        lastHitDate,
        latestHitType,
      };
      numberGroup.states.push(stateRecord);
    } else {
      stateRecord.hitCount += hitCount;
      stateRecord.straightCount += straightCount;
      stateRecord.boxedCount += boxedCount;
      stateRecord.stateStrengthScore += stateStrengthScore;
      if (lastHitDate > stateRecord.lastHitDate) {
        stateRecord.lastHitDate = lastHitDate;
      }
      stateRecord.latestHitType =
        stateRecord.straightCount > 0 && stateRecord.boxedCount > 0
          ? 'mixed'
          : stateRecord.straightCount > 0
            ? 'straight'
            : 'boxed';
    }

    termGroup.totalHits += hitCount;
  }

  const groups = Array.from(termMap.values());

  for (const termGroup of groups) {
    for (const numberGroup of termGroup.numbers) {
      numberGroup.states.sort((a, b) => {
        if (b.stateStrengthScore !== a.stateStrengthScore) {
          return b.stateStrengthScore - a.stateStrengthScore;
        }
        if (b.hitCount !== a.hitCount) {
          return b.hitCount - a.hitCount;
        }
        return b.lastHitDate.localeCompare(a.lastHitDate);
      });

      numberGroup.totalHits = numberGroup.states.reduce((sum, s) => sum + s.hitCount, 0);
    }

    termGroup.numbers.sort((a, b) => {
      if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits;
      return sortNumberStrings(a.number, b.number);
    });
  }

  groups.sort((a, b) => a.term.localeCompare(b.term));
  return groups;
}

export function flattenDictionary(groups: TermGroup[]): TermStateRecord[] {
  const rows: TermStateRecord[] = [];

  for (const termGroup of groups) {
    for (const numberGroup of termGroup.numbers) {
      for (const stateRecord of numberGroup.states) {
        rows.push({
          term: termGroup.term,
          letter: termGroup.letter,
          number: numberGroup.number,
          state: stateRecord.state,
          gameType: stateRecord.gameType,
          drawTime: stateRecord.drawTime,
          hitCount: stateRecord.hitCount,
          straightCount: stateRecord.straightCount,
          boxedCount: stateRecord.boxedCount,
          stateStrengthScore: stateRecord.stateStrengthScore,
          lastHitDate: stateRecord.lastHitDate,
          latestHitType: stateRecord.latestHitType,
          totalNumberHits: numberGroup.totalHits,
          totalTermHits: termGroup.totalHits,
        });
      }
    }
  }

  return rows;
}

function daysSince(dateString: string): number {
  if (!dateString) return 9999;
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 9999;

  const now = new Date();
  const diff = now.getTime() - parsed.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export function computeForecastScore(record: TermStateRecord): number {
  const recencyDays = daysSince(record.lastHitDate);
  const recencyBonus =
    recencyDays <= 7 ? 3 :
    recencyDays <= 30 ? 2 :
    recencyDays <= 90 ? 1 : 0;

  return (
    record.stateStrengthScore +
    record.hitCount * 2 +
    record.straightCount * 3 +
    record.boxedCount +
    recencyBonus
  );
}
