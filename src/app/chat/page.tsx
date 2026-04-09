// @ts-nocheck
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  getLatestDreamEntry,
  listActiveDreamWindows,
  listBacktestDreams,
  listDreamHits,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';

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

export default function ChatPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<BacktestSummaryLite[]>([]);
  const [latestDream, setLatestDream] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to the Sweet404Peaches Intelligence Chat. I can now use your latest dream, unresolved live watches, confidence tiers, and historical backtests to answer evidence-based questions.',
    },
  ]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setActiveWindows([]);
        setDreamHits([]);
        setBacktestSummaries([]);
        setLatestDream(null);
        setLoading(false);
        return;
      }

      try {
        const [mappings, windows, hits, dreams, latest] = await Promise.all([
          listPersonalHitMappings(user.uid),
          listActiveDreamWindows(user.uid),
          listDreamHits(user.uid),
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

        setMappingRows(mappings as PersonalMappingRow[]);
        setActiveWindows(windows);
        setDreamHits(hits);
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

  const forecast: any = useMemo(
    () =>
      buildLatestDreamForecast({
        latestDream,
        activeWindows,
        dreamHits,
        mappingRows,
      }),
    [latestDream, activeWindows, dreamHits, mappingRows]
  );

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

  function answerQuestion(question: string) {
    const q = normalizeText(question);

    if (!forecast.latestDreamId && !backtestSummaries.length) {
      return 'There is not enough live or backtest evidence loaded yet for a strong answer.';
    }

    if (q.includes('latest dream') || q.includes('today’s dream') || q.includes("today's dream")) {
      if (!latestDream) {
        return 'I do not see a saved latest live dream yet.';
      }

      const termsSummary = forecast.latestDreamTerms.length
        ? forecast.latestDreamTerms.join(', ')
        : 'No parsed terms found';

      const numbersSummary = forecast.latestDreamNumbers.length
        ? forecast.latestDreamNumbers.slice(0, 12).join(', ')
        : 'No parsed numbers found';

      return `Your latest dream is dated ${latestDream.dreamDate || 'unknown date'}. Parsed terms: ${termsSummary}. Parsed numbers: ${numbersSummary}. There are ${forecast.unresolvedWindows.length} unresolved live watch item(s) and ${forecast.resolvedHitsForLatestDream.length} resolved hit(s) already logged.`;
    }

    if (
      q.includes('watch next') ||
      q.includes('which states should i watch') ||
      q.includes('where should i watch')
    ) {
      if (!forecast.recommendationStateGroups.length) {
        return 'I do not yet have enough historical term-state evidence tied to your latest dream to recommend state watches.';
      }

      const top = forecast.recommendationStateGroups.slice(0, 5).map((group: any) => {
        const picks = group.rows
          .slice(0, 3)
          .map((row: any) => `${row.number} (${row.term}, ${row.confidenceTier})`)
          .join(', ');
        return `${group.state} [${group.confidenceTier}]: ${picks}`;
      });

      return `Based on your latest dream and historical memory, the strongest states to watch next are ${top.join('; ')}.`;
    }

    if (q.includes('top unresolved') || q.includes('best unresolved') || q.includes('top watch')) {
      if (!forecast.recommendationRows.length) {
        return 'I do not see any unresolved forecast recommendations right now.';
      }

      const top = forecast.recommendationRows.slice(0, 5).map((row: any) => {
        return `${row.number} in ${row.state} (${row.term}, ${row.confidenceTier}, score ${row.forecastScore})`;
      });

      return `The strongest unresolved watch recommendations right now are: ${top.join('; ')}.`;
    }

    if (q.includes('confidence') || q.includes('confidence tiers')) {
      if (!forecast.recommendationRows.length) {
        return 'There are no active unresolved recommendations to score yet.';
      }

      const counts = forecast.recommendationRows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.confidenceTier] = (acc[row.confidenceTier] ?? 0) + 1;
        return acc;
      }, {});

      return `Current unresolved forecast confidence tiers: ${Object.entries(counts)
        .map(([tier, count]) => `${tier}: ${count}`)
        .join('; ')}.`;
    }

    if (
      q.includes('resemble historically') ||
      q.includes('what does this dream resemble') ||
      q.includes('historical resemblance')
    ) {
      if (!forecast.latestDreamTerms.length) {
        return 'Your latest dream does not yet have parsed terms I can compare historically.';
      }

      const overlaps = backtestSummaries
        .filter((row: any) => row.bestTerm && forecast.latestDreamTerms.map(normalizeText).includes(normalizeText(row.bestTerm)))
        .slice(0, 5);

      if (!overlaps.length) {
        return `Your latest dream terms (${forecast.latestDreamTerms.join(', ')}) do not yet strongly overlap with your strongest completed backtest terms.`;
      }

      return `Your latest dream most strongly resembles historical backtests involving: ${overlaps
        .map((row: any) => `${row.bestTerm} → ${row.bestState || 'unknown state'}`)
        .join('; ')}.`;
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

    if (q.startsWith('term ') || q.includes(' about term ') || q.includes(' for term ')) {
      const candidate = q
        .replace('about term', '')
        .replace('for term', '')
        .replace(/^term\s+/, '')
        .trim();

      const matches = forecast.recommendationRows.filter(
        (row) => normalizeText(row.term) === candidate
      );

      if (!matches.length) {
        return `I do not currently see unresolved latest-dream forecast evidence for the term "${candidate}".`;
      }

      const topMatches = [...matches]
        .sort((a, b) => b.forecastScore - a.forecastScore)
        .slice(0, 5);

      const summary = topMatches
        .map(
          (row) =>
            `${row.number} in ${row.state} (${row.gameType}, ${row.matchType}, ${row.confidenceTier}, score ${row.forecastScore})`
        )
        .join('; ');

      return `For the term "${candidate}", the strongest unresolved latest-dream recommendations are: ${summary}.`;
    }

    if (q.startsWith('state ') || q.includes(' about state ') || q.includes(' for state ')) {
      const candidate = q
        .replace('about state', '')
        .replace('for state', '')
        .replace(/^state\s+/, '')
        .trim();

      const matches = forecast.recommendationRows.filter(
        (row) => normalizeText(row.state) === candidate
      );

      if (!matches.length) {
        return `I do not currently see unresolved latest-dream forecast evidence for the state "${candidate}".`;
      }

      const topMatches = [...matches]
        .sort((a, b) => b.forecastScore - a.forecastScore)
        .slice(0, 5);

      const summary = topMatches
        .map(
          (row) =>
            `${row.term} → ${row.number} (${row.matchType}, ${row.confidenceTier}, score ${row.forecastScore})`
        )
        .join('; ');

      return `For the state "${candidate}", the strongest unresolved latest-dream recommendations are: ${summary}.`;
    }

    if (q.includes('help')) {
      return 'Try asking: "latest dream", "which states should I watch next", "top unresolved watches", "confidence tiers", "what does this dream resemble historically", "term dancing", or "state illinois".';
    }

    return 'I can answer questions about your latest dream, unresolved live watches, strongest next states, confidence tiers, historical resemblance, and specific term/state forecast lookups.';
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
    'top unresolved watches',
    'confidence tiers',
    'what does this dream resemble historically',
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
                Ask evidence-based questions about your latest dream, unresolved live watches, confidence tiers, historical backtests, and state-term intelligence.
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
            <div className="journal-label">Latest Dream Date</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{latestDream?.dreamDate ?? '—'}</div>
          </div>

          <div>
            <div className="journal-label">Unresolved Watches</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.unresolvedWindows.length}</div>
          </div>

          <div>
            <div className="journal-label">Resolved Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.resolvedHitsForLatestDream.length}</div>
          </div>

          <div>
            <div className="journal-label">Top Suggested State</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>
              {forecast.recommendationStateGroups[0]?.state ?? '—'}
            </div>
          </div>
        </section>

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
            <p>The assistant answers from your unresolved live forecast and historical intelligence.</p>
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
              placeholder='Try: top unresolved watches, confidence tiers, or which states should I watch next'
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
