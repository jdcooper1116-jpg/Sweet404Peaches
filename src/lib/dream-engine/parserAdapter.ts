import type { ParsedDreamContract, ParsedTerm } from './types';

interface ParserTermMapping { term: string; normalizedTerm: string; cash3Numbers: string[]; cash4Numbers: string[]; category?: string; lineContexts?: string[]; }
interface ParserOutput { rawText: string; cleanedText: string; termMappings: ParserTermMapping[]; cash3Numbers: string[]; cash4Numbers: string[]; archivedNumbers: string[]; }

export function buildDreamContract(parserOutput: ParserOutput, dreamDate: string, dreamLabel: string, defaultFamily = 'general'): ParsedDreamContract {
  const terms: ParsedTerm[] = parserOutput.termMappings.map(mapping => ({
    raw_term:        mapping.term,
    normalized_term: mapping.normalizedTerm ?? mapping.term.toLowerCase().trim(),
    family:          mapping.category?.trim() || defaultFamily,
    pick3:           (mapping.cash3Numbers ?? []).filter((n): n is string => typeof n === 'string' && n.trim().length > 0),
    pick4:           (mapping.cash4Numbers ?? []).filter((n): n is string => typeof n === 'string' && n.trim().length > 0),
  }));
  return { dream_date: dreamDate, dream_label: dreamLabel, raw_text: parserOutput.rawText, terms };
}

export function allPick3Candidates(contract: ParsedDreamContract): string[] {
  const seen = new Set<string>();
  for (const term of contract.terms) for (const n of term.pick3) seen.add(n);
  return Array.from(seen);
}

export function allPick4Candidates(contract: ParsedDreamContract): string[] {
  const seen = new Set<string>();
  for (const term of contract.terms) for (const n of term.pick4) seen.add(n);
  return Array.from(seen);
}

export function candidatesForTerms(contract: ParsedDreamContract, normalizedTerms: string[], gameType: 'pick3' | 'pick4'): string[] {
  const termSet = new Set(normalizedTerms.map(t => t.toLowerCase().trim()));
  const seen    = new Set<string>();
  for (const term of contract.terms) {
    if (!termSet.has(term.normalized_term)) continue;
    const nums = gameType === 'pick3' ? term.pick3 : term.pick4;
    for (const n of nums) seen.add(n);
  }
  return Array.from(seen);
}
