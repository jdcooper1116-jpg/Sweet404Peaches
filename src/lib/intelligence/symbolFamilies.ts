/**
 * src/lib/intelligence/symbolFamilies.ts
 *
 * Pure helper for grouping dream terms into broad symbol families.
 * Static map — no AI, no embeddings, no network calls.
 * Transparent and editable.
 *
 * Why this matters:
 *   Different dreamers may say "car", "truck", or "road" — the system should
 *   recognize these all belong to the Vehicle / Movement family and surface
 *   that broader convergence signal.
 */

export type SymbolFamilyName =
  | 'Vehicle / Movement'
  | 'Water'
  | 'Fire'
  | 'Family'
  | 'Animals'
  | 'Money'
  | 'Death / Endings'
  | 'House / Structure'
  | 'Body'
  | 'Nature'
  | 'School / Learning'
  | 'Work / Business'
  | 'Food'
  | 'Conflict / Danger'
  | 'Spiritual / Sacred'
  | 'Other';

export type SymbolFamily = {
  name:    SymbolFamilyName;
  terms:   string[];   // canonical terms in this family (lowercase)
  color:   string;     // display color for UI chips
};

// ─── Static family map ────────────────────────────────────────────────────────
// Editable: add terms freely. All comparisons are done on normalized (lowercase,
// trimmed) terms. Partial-match logic is applied for compound terms.

export const SYMBOL_FAMILIES: SymbolFamily[] = [
  {
    name:  'Vehicle / Movement',
    color: '#ff8a6a',
    terms: [
      'car', 'truck', 'van', 'bus', 'train', 'airplane', 'plane', 'helicopter',
      'boat', 'ship', 'bicycle', 'motorcycle', 'driving', 'road', 'highway',
      'accident', 'crash', 'travel', 'journey', 'ride', 'taxi', 'uber',
      'engine', 'wheel', 'tire', 'gas', 'parking', 'bridge', 'tunnel',
    ],
  },
  {
    name:  'Water',
    color: '#60c8e0',
    terms: [
      'water', 'rain', 'river', 'ocean', 'sea', 'lake', 'pool', 'flood',
      'swimming', 'swim', 'drowning', 'drown', 'wave', 'storm', 'boat',
      'fishing', 'fish', 'wet', 'ice', 'snow', 'waterfall', 'stream',
    ],
  },
  {
    name:  'Fire',
    color: '#ff6b35',
    terms: [
      'fire', 'smoke', 'burning', 'burn', 'flame', 'candle', 'explosion',
      'explosion', 'heat', 'hot', 'stove', 'oven', 'charcoal', 'matches',
      'lighter', 'torch', 'fireworks',
    ],
  },
  {
    name:  'Family',
    color: '#a090ff',
    terms: [
      'mother', 'mom', 'mama', 'father', 'dad', 'papa', 'sister', 'brother',
      'baby', 'child', 'daughter', 'son', 'wife', 'husband', 'grandmother',
      'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew', 'family',
      'parent', 'grandparent', 'in-law', 'stepmother', 'stepfather', 'twin',
    ],
  },
  {
    name:  'Animals',
    color: '#60e09a',
    terms: [
      'dog', 'cat', 'snake', 'bird', 'mouse', 'rat', 'horse', 'cow', 'pig',
      'chicken', 'duck', 'rabbit', 'frog', 'turtle', 'fish', 'bear', 'wolf',
      'lion', 'tiger', 'elephant', 'monkey', 'deer', 'fox', 'spider', 'bee',
      'ant', 'fly', 'roach', 'cockroach', 'alligator', 'crocodile', 'shark',
      'whale', 'butterfly', 'eagle', 'owl', 'crow', 'parrot',
    ],
  },
  {
    name:  'Money',
    color: '#ffcc50',
    terms: [
      'money', 'cash', 'wallet', 'purse', 'bank', 'coins', 'dollar', 'bill',
      'check', 'credit', 'debt', 'rich', 'poor', 'steal', 'robbery', 'lottery',
      'winning', 'jackpot', 'gold', 'silver', 'jewelry', 'diamond', 'treasure',
      'store', 'shop', 'buying', 'selling', 'price',
    ],
  },
  {
    name:  'Death / Endings',
    color: '#888aaa',
    terms: [
      'funeral', 'dead', 'death', 'die', 'dying', 'cemetery', 'grave',
      'coffin', 'casket', 'ghost', 'spirit', 'murder', 'kill', 'killing',
      'blood', 'buried', 'burial', 'mourning', 'graveyard', 'tombstone',
      'hearse', 'cremation', 'ashes',
    ],
  },
  {
    name:  'House / Structure',
    color: '#b8a0ff',
    terms: [
      'house', 'home', 'room', 'door', 'window', 'stairs', 'basement',
      'attic', 'kitchen', 'bedroom', 'bathroom', 'living room', 'garage',
      'yard', 'roof', 'wall', 'floor', 'ceiling', 'hallway', 'closet',
      'apartment', 'building', 'office', 'store', 'church', 'hotel',
      'school', 'hospital', 'prison', 'jail', 'tower', 'bridge', 'fence',
    ],
  },
  {
    name:  'Body',
    color: '#ff9ac0',
    terms: [
      'hand', 'foot', 'eye', 'mouth', 'teeth', 'hair', 'head', 'heart',
      'stomach', 'back', 'leg', 'arm', 'finger', 'face', 'skin', 'blood',
      'bone', 'brain', 'body', 'sick', 'pain', 'hurt', 'surgery', 'hospital',
      'doctor', 'medicine', 'pregnant', 'baby', 'naked',
    ],
  },
  {
    name:  'Nature',
    color: '#60e09a',
    terms: [
      'tree', 'forest', 'grass', 'flower', 'garden', 'mountain', 'hill',
      'field', 'sky', 'sun', 'moon', 'star', 'cloud', 'wind', 'thunder',
      'lightning', 'earth', 'dirt', 'rock', 'stone', 'cave', 'beach',
      'desert', 'jungle', 'island',
    ],
  },
  {
    name:  'School / Learning',
    color: '#80d0ff',
    terms: [
      'school', 'teacher', 'class', 'classroom', 'test', 'exam', 'grade',
      'book', 'reading', 'writing', 'pencil', 'pen', 'student', 'university',
      'college', 'diploma', 'graduation', 'library', 'homework',
    ],
  },
  {
    name:  'Work / Business',
    color: '#ffd080',
    terms: [
      'work', 'job', 'boss', 'office', 'meeting', 'coworker', 'interview',
      'fired', 'hired', 'business', 'phone', 'computer', 'email', 'deadline',
      'promotion', 'career', 'paycheck', 'salary',
    ],
  },
  {
    name:  'Food',
    color: '#ffa060',
    terms: [
      'food', 'eating', 'drink', 'cooking', 'kitchen', 'restaurant', 'chicken',
      'rice', 'bread', 'cake', 'candy', 'fruit', 'vegetables', 'meat', 'fish',
      'soup', 'dinner', 'lunch', 'breakfast', 'hungry', 'feast',
    ],
  },
  {
    name:  'Conflict / Danger',
    color: '#ff5555',
    terms: [
      'fight', 'fighting', 'argument', 'war', 'gun', 'knife', 'weapon',
      'shooting', 'chase', 'running', 'escape', 'danger', 'threat', 'attack',
      'police', 'arrest', 'crime', 'robbery', 'fear', 'scared', 'nightmare',
      'monster', 'evil', 'demon', 'devil', 'violence',
    ],
  },
  {
    name:  'Spiritual / Sacred',
    color: '#d0a0ff',
    terms: [
      'god', 'jesus', 'angel', 'prayer', 'church', 'bible', 'heaven', 'hell',
      'spirit', 'soul', 'blessing', 'cross', 'temple', 'mosque', 'sacred',
      'holy', 'miracle', 'vision', 'prophecy', 'pastor', 'preacher',
    ],
  },
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Normalize a term for family lookup — lowercase, trim, collapse spaces */
export function normalizeTermForFamily(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Get the symbol family for a term.
 * Returns undefined if no family matches.
 * Partial match: "car crash" → Vehicle / Movement because "car" is in the family.
 */
export function getSymbolFamily(term: string): SymbolFamily | undefined {
  const normalized = normalizeTermForFamily(term);

  // Exact match first
  for (const fam of SYMBOL_FAMILIES) {
    if (fam.terms.includes(normalized)) return fam;
  }

  // Partial match — term contains a family keyword or a keyword is in the term
  for (const fam of SYMBOL_FAMILIES) {
    for (const keyword of fam.terms) {
      if (normalized.includes(keyword) || keyword.includes(normalized)) return fam;
    }
  }

  return undefined;
}

export type TermWithFamily = {
  term:          string;
  familyName:    SymbolFamilyName | 'Other';
  familyColor:   string;
};

/** Annotate an array of term strings with their symbol family. */
export function annotateTermsWithFamilies(terms: string[]): TermWithFamily[] {
  return terms.map(term => {
    const fam = getSymbolFamily(term);
    return {
      term,
      familyName:  fam?.name  ?? 'Other',
      familyColor: fam?.color ?? 'rgba(255,255,255,0.40)',
    };
  });
}

export type SymbolFamilySignal = {
  familyName:    SymbolFamilyName | 'Other';
  familyColor:   string;
  terms:         string[];         // terms in this family that are active
  dreamerIds:    string[];
  dreamerNames:  string[];
  windowCount:   number;
  hasFellBefore: boolean;
  fellStates:    string[];
  strength:      number;
};

/**
 * Group existing TermSignals by their symbol family.
 * Input is the array returned by buildTermConvergence().
 */
export function groupTermsBySymbolFamily(
  termSignals: Array<{
    term:          string;
    dreamerIds:    string[];
    dreamerNames:  string[];
    windowCount:   number;
    hasFellBefore: boolean;
    fellStates:    string[];
    fellHitCount:  number;
  }>
): SymbolFamilySignal[] {
  const map = new Map<string, SymbolFamilySignal>();

  for (const sig of termSignals) {
    const fam = getSymbolFamily(sig.term);
    const fname = fam?.name ?? 'Other';
    const fcolor = fam?.color ?? 'rgba(255,255,255,0.40)';

    if (!map.has(fname)) {
      map.set(fname, {
        familyName: fname as SymbolFamilyName | 'Other',
        familyColor: fcolor,
        terms: [], dreamerIds: [], dreamerNames: [],
        windowCount: 0, hasFellBefore: false, fellStates: [], strength: 0,
      });
    }
    const entry = map.get(fname)!;
    if (!entry.terms.includes(sig.term)) entry.terms.push(sig.term);
    for (const id of sig.dreamerIds) {
      if (!entry.dreamerIds.includes(id)) entry.dreamerIds.push(id);
    }
    for (const name of sig.dreamerNames) {
      if (!entry.dreamerNames.includes(name)) entry.dreamerNames.push(name);
    }
    entry.windowCount = Math.max(entry.windowCount, sig.windowCount);
    if (sig.hasFellBefore) {
      entry.hasFellBefore = true;
      for (const s of sig.fellStates) {
        if (!entry.fellStates.includes(s)) entry.fellStates.push(s);
      }
    }
    entry.strength += sig.dreamerIds.length * 2 + sig.windowCount + (sig.hasFellBefore ? sig.fellHitCount : 0);
  }

  return Array.from(map.values())
    .filter(s => s.terms.length > 0)
    .sort((a, b) => b.strength - a.strength);
}

/**
 * Generate a natural-language explanation for a symbol family signal.
 */
export function explainSymbolFamilySignal(sig: SymbolFamilySignal): string {
  const parts: string[] = [];
  if (sig.terms.length > 1) {
    parts.push(`Multiple ${sig.familyName} symbols (${sig.terms.slice(0, 4).join(', ')}) are active`);
  } else {
    parts.push(`${sig.terms[0]} is active in the ${sig.familyName} family`);
  }
  if (sig.dreamerIds.length > 1) parts.push(`across ${sig.dreamerIds.length} dreamers`);
  if (sig.hasFellBefore && sig.fellStates.length > 0) {
    parts.push(`with fell-before evidence in ${sig.fellStates.slice(0, 3).join(', ')}`);
  }
  return parts.join(', ') + '.';
}
