import type {
  ActiveDreamWindow,
  DreamEntry,
  DreamHit,
  Dreamer,
  LotteryResult,
  PersonalHitMapping,
} from '@/lib/types';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

export type JournalChatData = {
  dreams: DreamEntry[];
  windows: ActiveDreamWindow[];
  hits: DreamHit[];
  memory: PersonalHitMapping[];
  results: LotteryResult[];
  dreamers: Dreamer[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

function formatList(values: string[], empty = 'None found.'): string {
  if (!values.length) return empty;
  return values.join(', ');
}

function recentResults(results: LotteryResult[], limit = 12) {
  return [...results]
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.state !== b.state) return a.state.localeCompare(b.state);
      if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
      return a.drawTime.localeCompare(b.drawTime);
    })
    .slice(0, limit);
}

function findDreamerByQuestion(question: string, dreamers: Dreamer[]): Dreamer | null {
  const q = normalize(question);

  for (const dreamer of dreamers) {
    if (q.includes(dreamer.displayName.toLowerCase())) return dreamer;
    if (dreamer.alias && q.includes(dreamer.alias.toLowerCase())) return dreamer;
  }

  return null;
}

function scopeDataToDreamer(
  dreamer: Dreamer | null,
  data: JournalChatData
): JournalChatData {
  if (!dreamer) return data;

  return {
    dreams: data.dreams.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    windows: data.windows.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    hits: data.hits.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    memory: data.memory.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    results: data.results,
    dreamers: data.dreamers,
  };
}

export function answerJournalQuestion(question: string, data: JournalChatData): string {
  const q = normalize(question);
  const matchedDreamer = findDreamerByQuestion(q, data.dreamers);
  const scoped = scopeDataToDreamer(matchedDreamer, data);
  const families = summarizeNumberFamilies(scoped.windows, scoped.memory);

  if (!q) {
    return 'Ask me about hot number families, cross-dreamer overlap, Georgia families, active dreamers, or recent results.';
  }

  if (matchedDreamer && includesAny(q, ['hottest', 'hot families', 'hot family', 'active numbers', 'active families'])) {
    const topFamilies = families.slice(0, 8);
    if (!topFamilies.length) return `${matchedDreamer.displayName} has no active number families yet.`;

    return [
      `Top active families for ${matchedDreamer.displayName}:`,
      ...topFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; terms: ${formatList(item.terms)}; score: ${item.score}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['hot family', 'hottest family', 'box family', 'number family', 'repeating numbers across terms', 'synchronicity', 'hottest numbers'])) {
    const topFamilies = summarizeNumberFamilies(data.windows, data.memory).slice(0, 10);
    if (!topFamilies.length) return 'There are no active number families yet. Save a parsed dream first.';

    return [
      'Top active number families right now:',
      ...topFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; terms: ${formatList(item.terms)}; dreamers: ${formatList(item.dreamers)}; score: ${item.score}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['which families repeat across dreamers', 'cross dreamer', 'multiple dreamers', 'dreamers overlap'])) {
    const multiDreamer = summarizeNumberFamilies(data.windows, data.memory)
      .filter(item => item.dreamers.length > 1)
      .slice(0, 10);
    if (!multiDreamer.length) return 'No number families currently repeat across multiple dreamers.';

    return [
      'Number families repeating across multiple dreamers:',
      ...multiDreamer.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — dreamers: ${formatList(item.dreamers)}; forms: ${formatList(item.forms)}; terms: ${formatList(item.terms)}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['which families repeat across terms', 'cross term', 'multiple terms', 'term overlap'])) {
    const multiTerm = summarizeNumberFamilies(data.windows, data.memory)
      .filter(item => item.terms.length > 1)
      .slice(0, 10);
    if (!multiTerm.length) return 'No number families currently repeat across multiple terms.';

    return [
      'Number families repeating across multiple terms:',
      ...multiTerm.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — terms: ${formatList(item.terms)}; forms: ${formatList(item.forms)}; dreamers: ${formatList(item.dreamers)}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['how many dreamers', 'saved dreamers', 'dreamers do i have'])) {
    if (!data.dreamers.length) return 'You do not have any saved dreamers yet.';
    return `You currently have ${data.dreamers.length} saved dreamer(s): ${data.dreamers.map(d => d.displayName).join(', ')}.`;
  }

  if (includesAny(q, ['which dreamer has the most active numbers', 'most active dreamer', 'active dreamer'])) {
    if (!data.windows.length) return 'There are no active windows yet.';

    const counts = new Map<string, number>();
    for (const win of data.windows) {
      counts.set(win.dreamerName, (counts.get(win.dreamerName) || 0) + 1);
    }

    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const [name, count] = ranked[0];
    return `${name} currently has the most active window records with ${count}.`;
  }

  if (includesAny(q, ['active windows', 'how many windows', 'current windows'])) {
    if (!scoped.windows.length) return matchedDreamer ? `${matchedDreamer.displayName} has no active dream windows yet.` : 'There are no active dream windows yet.';
    return matchedDreamer
      ? `${matchedDreamer.displayName} currently has ${scoped.windows.length} active dream window record(s).`
      : `You currently have ${scoped.windows.length} active dream window record(s).`;
  }

  if (includesAny(q, ['georgia hit', 'ga hit', 'hits in georgia', 'georgia families'])) {
    const gaHits = scoped.memory.filter(item => item.state === 'GA');
    if (!gaHits.length) return matchedDreamer ? `There are no saved Georgia hits yet for ${matchedDreamer.displayName}.` : 'There are no saved Georgia hits yet.';

    const gaFamilies = summarizeNumberFamilies(
      scoped.windows.filter(w => w.statesTracked.includes('GA')),
      gaHits
    ).slice(0, 10);

    return [
      matchedDreamer ? `Top Georgia-linked families for ${matchedDreamer.displayName}:` : 'Top Georgia-linked families:',
      ...gaFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; Georgia hits: ${item.georgiaHits}; score: ${item.score}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['straight hit', 'straight hits'])) {
    const straight = scoped.memory.filter(item => item.hitType === 'straight');
    if (!straight.length) return matchedDreamer ? `There are no saved straight hits yet for ${matchedDreamer.displayName}.` : 'There are no saved straight hits yet.';

    return [
      matchedDreamer ? `Saved straight-hit memories for ${matchedDreamer.displayName}:` : 'Saved straight-hit memories:',
      ...straight
        .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
        .slice(0, 10)
        .map(item => `• ${item.termLabel} → ${item.number} (${item.gameType}, ${item.state}) — ${item.hitCount} hit(s)`),
    ].join('\n');
  }

  if (includesAny(q, ['boxed hit', 'boxed hits', 'boxed families'])) {
    const boxed = scoped.memory.filter(item => item.hitType === 'boxed');
    if (!boxed.length) return matchedDreamer ? `There are no saved boxed hits yet for ${matchedDreamer.displayName}.` : 'There are no saved boxed hits yet.';

    return [
      matchedDreamer ? `Saved boxed-hit memories for ${matchedDreamer.displayName}:` : 'Saved boxed-hit memories:',
      ...boxed
        .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
        .slice(0, 10)
        .map(item => `• ${item.termLabel} → ${item.number} (${item.gameType}, ${item.state}) — ${item.hitCount} hit(s)`),
    ].join('\n');
  }

  if (includesAny(q, ['recent results', 'latest results', 'imported results'])) {
    const rows = recentResults(data.results, 12);
    if (!rows.length) return 'There are no imported results yet.';

    return [
      'Most recent imported results:',
      ...rows.map(
        row =>
          `• ${row.state} ${row.date} ${row.gameType} ${row.drawTime} — ${row.normalizedResult}`
      ),
    ].join('\n');
  }

  if (matchedDreamer && includesAny(q, ['numbers', 'active', 'dreamer', 'journal', 'families'])) {
    const dreamerFamilies = summarizeNumberFamilies(scoped.windows, scoped.memory).slice(0, 8);
    const numbers = unique(scoped.windows.map(item => item.number)).sort();
    const terms = unique(scoped.windows.map(item => item.termLabel)).sort();

    if (!scoped.windows.length) {
      return `${matchedDreamer.displayName} does not have any active windows yet.`;
    }

    return [
      `Current active view for ${matchedDreamer.displayName}:`,
      `• Active numbers: ${formatList(numbers)}`,
      `• Active terms: ${formatList(terms)}`,
      `• Window count: ${scoped.windows.length}`,
      `• Strongest families: ${dreamerFamilies.map(item => `Family ${item.familyKey} (${item.forms.join(', ')})`).join(' • ') || 'None'}`,
    ].join('\n');
  }

  if (includesAny(q, ['help', 'what can i ask', 'what can you do'])) {
    return [
      'You can ask things like:',
      '• What are my hottest number families right now?',
      '• Show me Jamala’s hottest families.',
      '• Show me Mama’s active numbers.',
      '• Which number families repeat across dreamers?',
      '• Which number families repeat across terms?',
      '• Which dreamer has the most active numbers?',
      '• Show me Georgia families.',
      '• Show me boxed hits.',
      '• Show me recent imported results.',
    ].join('\n');
  }

  return [
    'I could not match that question yet.',
    'Try asking about number families, dreamer overlap, Georgia families, boxed hits, active windows, or recent results.',
  ].join('\n');
}
