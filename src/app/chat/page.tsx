'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  getLatestDreamEntry,
  listBacktestDreams,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import {
  buildGroupedTermDictionary,
  flattenDictionary,
  normalizeTermLabel,
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';

type BacktestSummaryLite = {
  backtestDreamId: string;
  dreamDate?: string;
  totalHits?: number;
  straightHits?: number;
  boxedHits?: number;
  bestState?: string;
  bestTerm?: string;
  uniqueStates?: string[];
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export default function ChatPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<BacktestSummaryLite[]>([]);
  const [latestDream, setLatestDream] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to the Sweet404Peaches Intelligence Chat. I can now use your live dictionary, backtest archive, and latest dream context.',
    },
  ]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setBacktestSummaries([]);
        setLatestDream(null);
        setLoading(false);
        return;
      }

      try {
        const [liveMappings, dreams, latest] = await Promise.all([
          listPersonalHitMappings(user.uid),
          listBacktestDreams(user.uid),
          getLatestDreamEntry(user.uid),
        ]);

        const summaries = await Promise.all(
          dreams.map(async (dream: any) => {
            const summary = await getBacktestSummaryForDream(user.uid, dream.id);
            return summary
              ? {
                  backtestDreamId: dream.id,
                  dreamDate: dream.dreamDate,
                  totalHits: summary.totalHits ?? 0,
                  straightHits: summary.straightHits ?? 0,
                  boxedHits: summary.boxedHits ?? 0,
                  bestState: summary.bestState ?? '',
                  bestTerm: summary.bestTerm ?? '',
                  uniqueStates: Array.isArray(summary.uniqueStates) ? summary.uniqueStates : [],
                }
              : null;
          })
        );

        setMappingRows(liveMappings as PersonalMappingRow[]);
        setBacktestSummaries(summaries.filter(Boolean) as BacktestSummaryLite[]);
        setLatestDream(latest);
      } catch (err) {
        console.error(err);
        setError('Could not load intelligence data for chat.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const grouped = useMemo(() => buildGroupedTermDictionary(mappingRows), [mappingRows]);
  const flat = useMemo(() => flattenDictionary(grouped), [grouped]);

  const topStates = useMemo(() => {
    const map = new Map<string, { score: number; hits: number }>();

    for (const row of flat) {
      if (!map.has(row.state)) {
        map.set(row.state, { score: 0, hits: 0 });
      }
      const current = map.get(row.state)!;
      current.score += row.stateStrengthScore;
      current.hits += row.hitCount;
    }

    return Array.from(map.entries())
      .map(([state, value]) => ({
        state,
        score: value.score,
        hits: value.hits,
      }))
      .sort((a, b) => b.score - a.score);
  }, [flat]);

  const topTerms = useMemo(() => {
    const map = new Map<string, { hits: number; states: Set<string> }>();

    for (const row of flat) {
      if (!map.has(row.term)) {
        map.set(row.term, { hits: 0, states: new Set<string>() });
      }
      const current = map.get(row.term)!;
      current.hits += row.hitCount;
      current.states.add(row.state);
    }

    return Array.from(map.entries())
      .map(([term, value]) => ({
        term,
        hits: value.hits,
        stateCount: value.states.size,
      }))
      .sort((a, b) => b.hits - a.hits);
  }, [flat]);

  const backtestBestStates = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of backtestSummaries) {
      if (!row.bestState) continue;
      map.set(row.bestState, (map.get(row.bestState) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
  }, [backtestSummaries]);

  const backtestBestTerms = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of backtestSummaries) {
      if (!row.bestTerm) continue;
      map.set(row.bestTerm, (map.get(row.bestTerm) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count);
  }, [backtestSummaries]);

  const latestDreamTerms = useMemo(() => {
    if (!latestDream || !Array.isArray(latestDream.termMappings)) return [];

    return uniqueStrings(
      latestDream.termMappings.map((mapping: any) =>
        normalizeTermLabel(String(mapping?.term ?? '').trim())
      )
    ).filter(Boolean);
  }, [latestDream]);

  const latestDreamNumbers = useMemo(() => {
    if (!latestDream) return [];

    const cash3 = Array.isArray(latestDream.allNumbers)
      ? latestDream.allNumbers
          .filter((item: any) => item?.gameType === 'cash3')
          .map((item: any) => String(item?.number ?? ''))
      : [];

    const cash4 = Array.isArray(latestDream.allNumbers)
      ? latestDream.allNumbers
          .filter((item: any) => item?.gameType === 'cash4')
          .map((item: any) => String(item?.number ?? ''))
      : [];

    return uniqueStrings([...cash3, ...cash4]);
  }, [latestDream]);

  const latestDreamMatches = useMemo(() => {
    if (!latestDreamTerms.length) return [];

    return flat
      .filter((row) =>
        latestDreamTerms.map(normalizeText).includes(normalizeText(row.term))
      )
      .sort((a, b) => {
        if (b.stateStrengthScore !== a.stateStrengthScore) {
          return b.stateStrengthScore - a.stateStrengthScore;
        }
        if (b.hitCount !== a.hitCount) {
          return b.hitCount - a.hitCount;
        }
        return b.lastHitDate.localeCompare(a.lastHitDate);
      });
  }, [flat, latestDreamTerms]);

  const latestDreamStateSuggestions = useMemo(() => {
    const groupedByState = new Map<string, typeof latestDreamMatches>();

    for (const row of latestDreamMatches) {
      if (!groupedByState.has(row.state)) {
        groupedByState.set(row.state, []);
      }
      groupedByState.get(row.state)!.push(row);
    }

    return Array.from(groupedByState.entries())
      .map(([state, rows]) => ({
        state,
        rows: rows.slice(0, 5),
        score: rows.reduce((sum, row) => sum + row.stateStrengthScore, 0),
      }))
      .sort((a, b) => b.score - a.score);
  }, [latestDreamMatches]);

  function answerQuestion(question: string) {
    const q = normalizeText(question);

    if (!flat.length && !backtestSummaries.length) {
      return 'There is not enough live or backtest evidence loaded yet for a strong answer.';
    }

    if (
      q.includes('latest dream') ||
      q.includes('today’s dream') ||
      q.includes("today's dream") ||
      q.includes('still live')
    ) {
      if (!latestDream) {
        return 'I do not see a saved latest live dream yet.';
      }

      const termsSummary = latestDreamTerms.length
        ? latestDreamTerms.join(', ')
        : 'No parsed terms found';

      const numbersSummary = latestDreamNumbers.length
        ? latestDreamNumbers.slice(0, 12).join(', ')
        : 'No parsed numbers found';

      const topSuggestions = latestDreamStateSuggestions.slice(0, 3).map((group) => {
        const picks = group.rows
          .slice(0, 3)
          .map((row) => `${row.number} (${row.term})`)
          .join(', ');
        return `${group.state}: ${picks}`;
      });

      return `Your latest dream is dated ${latestDream.dreamDate || 'unknown date'}. Parsed terms: ${termsSummary}. Parsed numbers: ${numbersSummary}. Strongest historical state suggestions for this dream are ${topSuggestions.length ? topSuggestions.join('; ') : 'not available yet'}.`;
    }

    if (
      q.includes('watch next') ||
      q.includes('which states should i watch') ||
      q.includes('where should i watch')
    ) {
      if (!latestDreamStateSuggestions.length) {
        return 'I do not yet have enough historical term-state evidence tied to your latest dream to recommend state watches.';
      }

      const top = latestDreamStateSuggestions.slice(0, 5).map((group) => {
        const picks = group.rows
          .slice(0, 3)
          .map((row) => `${row.number} (${row.term})`)
          .join(', ');
        return `${group.state}: ${picks}`;
      });

      return `Based on your latest dream and historical dictionary memory, the strongest states to watch next are ${top.join('; ')}.`;
    }

    if (
      q.includes('resemble historically') ||
      q.includes('what does this dream resemble') ||
      q.includes('historical resemblance')
    ) {
      if (!latestDreamTerms.length || !backtestBestTerms.length) {
        return 'I need more completed backtests and parsed live terms before I can estimate historical resemblance.';
      }

      const overlaps = backtestBestTerms
        .filter((row) => latestDreamTerms.map(normalizeText).includes(normalizeText(row.term)))
        .slice(0, 5);

      if (!overlaps.length) {
        return `Your latest dream terms (${latestDreamTerms.join(', ')}) do not yet strongly overlap with your most repeated backtest best-term list.`;
      }

      return `Your latest dream most strongly resembles historical backtests involving these repeated best terms: ${overlaps
        .map((row) => `${row.term} (${row.count} strongest-backtest appearance(s))`)
        .join('; ')}.`;
    }

    if (
      q.includes('strongest live state') ||
      q.includes('top state') ||
      q.includes('best live state')
    ) {
      const top = topStates[0];
      if (!top) return 'No live state intelligence is available yet.';
      return `${top.state} is the strongest live state right now with a state-strength score of ${top.score} across ${top.hits} logged hit(s).`;
    }

    if (
      q.includes('most active term') ||
      q.includes('strongest term') ||
      q.includes('top term')
    ) {
      const top = topTerms[0];
      if (!top) return 'No live term intelligence is available yet.';
      return `${top.term} is the most active live term right now with ${top.hits} logged hit(s) across ${top.stateCount} state(s).`;
    }

    if (
      q.includes('best backtest state') ||
      q.includes('repeated backtest state') ||
      q.includes('historical best state')
    ) {
      const top = backtestBestStates[0];
      if (!top) return 'No completed backtest summaries are available yet.';
      return `${top.state} is the most repeated best-performing backtest state, appearing ${top.count} time(s) as the strongest historical replay state.`;
    }

    if (
      q.includes('best backtest term') ||
      q.includes('historical best term') ||
      q.includes('repeated backtest term')
    ) {
      const top = backtestBestTerms[0];
      if (!top) return 'No completed backtest summaries are available yet.';
      return `${top.term} is the most repeated best-performing backtest term, appearing ${top.count} time(s) as the strongest historical replay term.`;
    }

    if (q.startsWith('term ') || q.includes(' about term ') || q.includes(' for term ')) {
      const candidate = q
        .replace('about term', '')
        .replace('for term', '')
        .replace(/^term\s+/, '')
        .trim();

      const matches = flat.filter((row) => normalizeText(row.term) === candidate);
      if (!matches.length) {
        return `I do not currently see live dictionary evidence for the term "${candidate}".`;
      }

      const topMatches = [...matches]
        .sort((a, b) => b.stateStrengthScore - a.stateStrengthScore)
        .slice(0, 5);

      const summary = topMatches
        .map(
          (row) =>
            `${row.number} in ${row.state} (${row.gameType}, ${row.latestHitType}, strength ${row.stateStrengthScore})`
        )
        .join('; ');

      return `For the term "${candidate}", the strongest live state-number patterns are: ${summary}.`;
    }

    if (q.startsWith('state ') || q.includes(' about state ') || q.includes(' for state ')) {
      const candidate = q
        .replace('about state', '')
        .replace('for state', '')
        .replace(/^state\s+/, '')
        .trim();

      const matches = flat.filter((row) => normalizeText(row.state) === candidate);
      if (!matches.length) {
        return `I do not currently see live dictionary evidence for the state "${candidate}".`;
      }

      const topMatches = [...matches]
        .sort((a, b) => b.stateStrengthScore - a.stateStrengthScore)
        .slice(0, 5);

      const summary = topMatches
        .map(
          (row) =>
            `${row.term} → ${row.number} (${row.gameType}, ${row.latestHitType}, strength ${row.stateStrengthScore})`
        )
        .join('; ');

      return `For the state "${candidate}", the strongest live term-number patterns are: ${summary}.`;
    }

    if (q.includes('what should i ask') || q.includes('help')) {
      return 'Try asking: "latest dream", "which states should I watch next", "what does this dream resemble historically", "strongest live state", "term dancing", or "state illinois".';
    }

    return 'I can answer questions about your latest dream, strongest live states, most active terms, best historical backtest states, best backtest terms, and specific term/state lookups.';
  }

  function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    const reply = answerQuestion(trimmed);

    setMessages((current) => [
      ...current,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: reply },
    ]);

    setInput('');
  }

  const quickPrompts = [
    'latest dream',
    'which states should I watch next',
    'what does this dream resemble historically',
    'strongest live state',
    'most active term',
    'term dancing',
    'state illinois',
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div className="page-header">
              <h1>Sweet404Peaches Intelligence Chat</h1>
              <p>
                Ask evidence-based questions about your latest dream, live dictionary memory, backtest outcomes, term-state patterns, and forecast intelligence.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/intelligence" className="btn-secondary">
                Intelligence Hub
              </Link>
              <Link href="/forecast-board" className="btn-secondary">
                Forecast Board
              </Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <div className="journal-label">Live Dictionary Rows</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{flat.length}</div>
          </div>

          <div>
            <div className="journal-label">Completed Backtests</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{backtestSummaries.length}</div>
          </div>

          <div>
            <div className="journal-label">Latest Dream Date</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>
              {latestDream?.dreamDate ?? '—'}
            </div>
          </div>

          <div>
            <div className="journal-label">Latest Dream Terms</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>
              {latestDreamTerms.length ? latestDreamTerms.length : '—'}
            </div>
          </div>
        </section>

        {latestDream ? (
          <section className="journal-card-flat">
            <strong>Latest Dream Snapshot</strong>
            <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
              Terms: {latestDreamTerms.length ? latestDreamTerms.join(', ') : 'No parsed terms'}.
              {' '}Numbers: {latestDreamNumbers.length ? latestDreamNumbers.slice(0, 20).join(', ') : 'No parsed numbers'}.
            </p>
          </section>
        ) : null}

        {loading ? (
          <section className="journal-card">
            <p>Loading intelligence chat...</p>
          </section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Quick Prompts</h1>
            <p>Click one to test the analyst engine.</p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="btn-secondary"
                onClick={() => handleAsk(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div className="page-header">
            <h1>Conversation</h1>
            <p>The assistant answers from your app intelligence, including latest-dream context.</p>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className="journal-card-flat"
                style={{
                  borderLeft:
                    message.role === 'user'
                      ? '4px solid rgba(90, 52, 74, 0.35)'
                      : '4px solid rgba(201, 168, 76, 0.65)',
                }}
              >
                <strong>{message.role === 'user' ? 'You' : 'Sweet404Peaches AI'}</strong>
                <p style={{ marginTop: '8px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
                  {message.content}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <label className="journal-label" htmlFor="chatPrompt">
              Ask a Question
            </label>
            <textarea
              id="chatPrompt"
              className="journal-textarea"
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: latest dream, which states should I watch next, or what does this dream resemble historically'
            />

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleAsk(input)}
              >
                Ask Intelligence Chat
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
