#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/parser"
mkdir -p "$BACKUP_DIR/src/app/dreams/new"

[ -f src/lib/parser/dreamParser.ts ] && cp src/lib/parser/dreamParser.ts "$BACKUP_DIR/src/lib/parser/dreamParser.ts.bak"
[ -f src/app/dreams/new/page.tsx ] && cp src/app/dreams/new/page.tsx "$BACKUP_DIR/src/app/dreams/new.page.tsx.bak"

mkdir -p src/lib/parser
cat > src/lib/parser/dreamParser.ts <<'TS'
import type {
  ExtractedNumber,
  ParseResult,
  ParsedLine,
  TermMapping,
} from '@/lib/types';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function singularizeWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function canonicalizeTerm(term: string): string {
  return normalizeWhitespace(term.toLowerCase())
    .split(' ')
    .map(singularizeWord)
    .join(' ');
}

function classifyNumber(value: string): 'cash3' | 'cash4' | 'archive' {
  if (/^\d{3}$/.test(value)) return 'cash3';
  if (/^\d{4}$/.test(value)) return 'cash4';
  return 'archive';
}

function cleanLineForParsing(line: string): string {
  return line
    .replace(/[*_/\\|]+/g, ' ')
    .replace(/[.]{2,}/g, ' ')
    .replace(/[-]{2,}/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'with', 'on', 'in', 'at', 'for',
  'from', 'by', 'into', 'onto', 'up', 'down', 'over', 'under', 'through',
  'throughout', 'it', 'is', 'was', 'were', 'be', 'been', 'being', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'there', 'that', 'this', 'these', 'those',
  'had', 'have', 'has', 'could', 'would', 'should', 'something', 'room',
  'hallway', 'all', 'what', 'thank', 'thanks',
]);

const CONNECTOR_WORDS = new Set([
  'and', 'but', 'then', 'while', 'where', 'when', 'because', 'if', 'so',
  'well', 'wait', 'maybe',
]);

const WEAK_MODIFIER_WORDS = new Set([
  'around',
  'above',
  'below',
  'behind',
  'inside',
  'outside',
  'near',
  'nearby',
  'flying',
  'running',
  'chasing',
  'driving',
  'walking',
  'looking',
  'watching',
  'holding',
  'carrying',
  'falling',
  'moving',
  'coming',
  'going',
]);

function isBoundaryWord(word: string): boolean {
  return STOPWORDS.has(word) || CONNECTOR_WORDS.has(word);
}

function splitIntoSegments(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap(line => line.split(/[.!?]+/g))
    .map(part => part.trim())
    .filter(Boolean);
}

function buildAnchorFromPendingWords(words: string[]): string | null {
  if (!words.length) return null;

  const cleaned = words
    .map(w => w.toLowerCase().trim())
    .filter(Boolean);

  if (!cleaned.length) return null;

  const collected: string[] = [];

  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const word = cleaned[i];

    if (isBoundaryWord(word)) {
      if (collected.length > 0) break;
      continue;
    }

    if (!/^[a-z]+$/.test(word)) continue;

    collected.unshift(word);

    if (collected.length >= 3) break;
  }

  if (!collected.length) return null;

  return normalizeWhitespace(collected.join(' '));
}

function buildRelatedTerms(term: string): string[] {
  const cleaned = normalizeWhitespace(term.toLowerCase());
  const words = cleaned.split(' ').filter(Boolean);

  const aliases = words
    .filter(
      word =>
        word.length > 2 &&
        !STOPWORDS.has(word) &&
        !CONNECTOR_WORDS.has(word) &&
        !WEAK_MODIFIER_WORDS.has(word)
    )
    .map(word => canonicalizeTerm(word));

  const termCanonical = canonicalizeTerm(term);

  return unique(aliases).filter(alias => alias !== termCanonical);
}

function mergeWeakModifiersIntoTerm(term: string, words: string[]): string {
  const modifierWords = words
    .map(w => w.toLowerCase().trim())
    .filter(w => WEAK_MODIFIER_WORDS.has(w) && !term.toLowerCase().includes(w));

  if (!modifierWords.length) return term;

  return normalizeWhitespace(`${term} ${modifierWords.join(' ')}`);
}

function parseStructuredSegment(
  original: string,
  lineIndex: number,
  previousPrimaryTerm: string | null
): {
  parsedLine: ParsedLine;
  mappings: TermMapping[];
  extracted: ExtractedNumber[];
  lastPrimaryTerm: string | null;
} {
  const cleaned = cleanLineForParsing(original);
  const tokens = cleaned.toLowerCase().match(/[a-z]+|\d+/g) || [];

  const mappings: TermMapping[] = [];
  const extracted: ExtractedNumber[] = [];

  let pendingWords: string[] = [];
  let active:
    | {
        term: string;
        numbers: string[];
      }
    | null = null;

  let lastPrimaryTerm = previousPrimaryTerm;

  function pushActive() {
    if (!active || !active.term || active.numbers.length === 0) return;

    const normalizedTerm = canonicalizeTerm(active.term);
    const relatedTerms = buildRelatedTerms(active.term);

    const cash3Numbers = active.numbers.filter(n => classifyNumber(n) === 'cash3');
    const cash4Numbers = active.numbers.filter(n => classifyNumber(n) === 'cash4');
    const archivedNumbers = active.numbers.filter(n => classifyNumber(n) === 'archive');

    mappings.push({
      term: active.term,
      normalizedTerm,
      relatedTerms,
      cash3Numbers: unique(cash3Numbers),
      cash4Numbers: unique(cash4Numbers),
      archivedNumbers: unique(archivedNumbers),
      lineContexts: [original],
    });

    for (const value of active.numbers) {
      extracted.push({
        value,
        gameType: classifyNumber(value),
        associatedTerms: [active.term],
        raw: value,
        lineIndex,
      });
    }

    lastPrimaryTerm = active.term;
    active = null;
  }

  for (const token of tokens) {
    const isNumber = /^\d+$/.test(token);

    if (isNumber) {
      if (!active) {
        const anchor = buildAnchorFromPendingWords(pendingWords) || lastPrimaryTerm;

        if (anchor) {
          active = {
            term: anchor,
            numbers: [],
          };
        }
      } else if (pendingWords.length > 0) {
        const onlyWeakOrConnector = pendingWords.every(
          w => WEAK_MODIFIER_WORDS.has(w) || CONNECTOR_WORDS.has(w) || STOPWORDS.has(w)
        );

        if (onlyWeakOrConnector) {
          active.term = mergeWeakModifiersIntoTerm(active.term, pendingWords);
        } else {
          pushActive();

          const anchor = buildAnchorFromPendingWords(pendingWords) || lastPrimaryTerm;
          if (anchor) {
            active = {
              term: anchor,
              numbers: [],
            };
          }
        }
      }

      pendingWords = [];

      if (active) {
        active.numbers.push(token);
      }

      continue;
    }

    pendingWords.push(token);
  }

  pushActive();

  const parsedLine: ParsedLine = {
    original,
    cleaned,
    terms: mappings.map(m => m.term),
    numbers: extracted.map(e => e.value),
    isNumbersOnly: mappings.length === 0 && extracted.length > 0,
    lineIndex,
  };

  return {
    parsedLine,
    mappings,
    extracted,
    lastPrimaryTerm,
  };
}

function extractNarrativeTerms(line: string): string[] {
  const cleaned = cleanLineForParsing(line).toLowerCase();
  const words = (cleaned.match(/[a-z]+/g) || []).filter(Boolean);

  if (!words.length) return [];

  const contentWords = words.filter(
    w => !STOPWORDS.has(w) && !CONNECTOR_WORDS.has(w)
  );

  const singles = contentWords.filter(w => w.length > 2);
  const bigrams: string[] = [];

  for (let i = 0; i < contentWords.length - 1; i += 1) {
    const first = contentWords[i];
    const second = contentWords[i + 1];
    if (first && second) {
      bigrams.push(`${first} ${second}`);
    }
  }

  return unique([...singles, ...bigrams]).map(term => normalizeWhitespace(term));
}

export function parseDreamText(rawText: string): ParseResult {
  const cleanedText = rawText.replace(/\r\n/g, '\n').trim();
  const rawSegments = splitIntoSegments(cleanedText);

  const lines: ParsedLine[] = [];
  const termMap = new Map<string, TermMapping>();
  const allNumbers: ExtractedNumber[] = [];

  let lastPrimaryTerm: string | null = null;

  rawSegments.forEach((segment, lineIndex) => {
    const cleaned = cleanLineForParsing(segment);
    const hasNumbers = /\d/.test(cleaned);

    if (hasNumbers) {
      const result = parseStructuredSegment(segment, lineIndex, lastPrimaryTerm);
      lines.push(result.parsedLine);
      lastPrimaryTerm = result.lastPrimaryTerm;

      for (const mapping of result.mappings) {
        if (!termMap.has(mapping.normalizedTerm)) {
          termMap.set(mapping.normalizedTerm, {
            ...mapping,
            relatedTerms: unique(mapping.relatedTerms),
            cash3Numbers: unique(mapping.cash3Numbers),
            cash4Numbers: unique(mapping.cash4Numbers),
            archivedNumbers: unique(mapping.archivedNumbers),
            lineContexts: unique(mapping.lineContexts),
          });
        } else {
          const existing = termMap.get(mapping.normalizedTerm)!;
          existing.relatedTerms = unique([...(existing.relatedTerms || []), ...(mapping.relatedTerms || [])]);
          existing.cash3Numbers = unique([...existing.cash3Numbers, ...mapping.cash3Numbers]);
          existing.cash4Numbers = unique([...existing.cash4Numbers, ...mapping.cash4Numbers]);
          existing.archivedNumbers = unique([...existing.archivedNumbers, ...mapping.archivedNumbers]);
          existing.lineContexts = unique([...existing.lineContexts, ...mapping.lineContexts]);
        }
      }

      allNumbers.push(...result.extracted);
      return;
    }

    const fallbackTerms = extractNarrativeTerms(cleaned);
    lines.push({
      original: segment,
      cleaned,
      terms: fallbackTerms,
      numbers: [],
      isNumbersOnly: false,
      lineIndex,
    });
  });

  const termMappings = Array.from(termMap.values());

  const cash3Numbers = unique(
    allNumbers.filter(n => n.gameType === 'cash3').map(n => n.value)
  );

  const cash4Numbers = unique(
    allNumbers.filter(n => n.gameType === 'cash4').map(n => n.value)
  );

  const archivedNumbers = unique(
    allNumbers.filter(n => n.gameType === 'archive').map(n => n.value)
  );

  return {
    rawText,
    cleanedText,
    lines,
    termMappings,
    allNumbers,
    cash3Numbers,
    cash4Numbers,
    archivedNumbers,
  };
}
TS

python3 - <<'PY'
from pathlib import Path

p = Path("src/app/dreams/new/page.tsx")
text = p.read_text()

text = text.replace("Archived Longer Numbers", "Archived / Symbolic Numbers")
text = text.replace(
    "Save Draft writes the raw dream entry to Firestore. Parse Dream\n                now previews extracted terms, related aliases, and number candidates.",
    "Save Draft writes the raw dream entry to Firestore. Parse Dream now previews stronger primary terms, related aliases, and number candidates."
)

p.write_text(text)
print("Updated dream preview labels.")
PY

echo "Parser upgrade batch complete."
echo "Backups saved to: $BACKUP_DIR"
