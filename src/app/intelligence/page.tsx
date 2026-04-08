'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  listBacktestDreams,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import {
  buildGroupedTermDictionary,
  flattenDictionary,
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

type InsightCard = {
  title: string;
  body: string;
};

export default function IntelligenceHubPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<BacktestSummaryLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termSearch, setTermSearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setBacktestSummaries([]);
        setLoading(false);
        return;
      }

      try {
        const liveMappings = await listPersonalHitMappings(user.uid);
        const dreams = await listBacktestDreams(user.uid);

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
      } catch (err) {
        console.error(err);
        setError('Could not load Intelligence Hub.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const grouped = useMemo(() => buildGroupedTermDictionary(mappingRows), [mappingRows]);
  const flattened = useMemo(() => flattenDictionary(grouped), [grouped]);

  const filteredRecords = useMemo(() => {
    return flattened.filter((record) => {
      const termOk = termSearch.trim()
        ? record.term.toLowerCase().includes(termSearch.trim().toLowerCase())
        : true;

      const stateOk = stateSearch.trim()
        ? record.state.toLowerCase().includes(stateSearch.trim().toLowerCase())
        : true;

      return termOk && stateOk;
    });
  }, [flattened, termSearch, stateSearch]);

  const topStates = useMemo(() => {
    const map = new Map<
      string,
      { score: number; hits: number; straight: number; boxed: number; numbers: Set<string> }
    >();

    for (const row of filteredRecords) {
      if (!map.has(row.state)) {
        map.set(row.state, {
          score: 0,
          hits: 0,
          straight: 0,
          boxed: 0,
          numbers: new Set<string>(),
        });
      }

      const current = map.get(row.state)!;
      current.score += row.stateStrengthScore;
      current.hits += row.hitCount;
      current.straight += row.straightCount;
      current.boxed += row.boxedCount;
      current.numbers.add(row.number);
    }

    return Array.from(map.entries())
      .map(([state, value]) => ({
        state,
        score: value.score,
        hits: value.hits,
        straight: value.straight,
        boxed: value.boxed,
        uniqueNumbers: value.numbers.size,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [filteredRecords]);

  const topTerms = useMemo(() => {
    const map = new Map<
      string,
      { hits: number; states: Set<string>; numbers: Set<string>; straight: number; boxed: number }
    >();

    for (const row of filteredRecords) {
      if (!map.has(row.term)) {
        map.set(row.term, {
          hits: 0,
          states: new Set<string>(),
          numbers: new Set<string>(),
          straight: 0,
          boxed: 0,
        });
      }

      const current = map.get(row.term)!;
      current.hits += row.hitCount;
      current.states.add(row.state);
      current.numbers.add(row.number);
      current.straight += row.straightCount;
      current.boxed += row.boxedCount;
    }

    return Array.from(map.entries())
      .map(([term, value]) => ({
        term,
        hits: value.hits,
        stateCount: value.states.size,
        numberCount: value.numbers.size,
        straight: value.straight,
        boxed: value.boxed,
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 12);
  }, [filteredRecords]);

  const bestBacktestStates = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of backtestSummaries) {
      if (!row.bestState) continue;
      map.set(row.bestState, (map.get(row.bestState) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [backtestSummaries]);

  const bestBacktestTerms = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of backtestSummaries) {
      if (!row.bestTerm) continue;
      map.set(row.bestTerm, (map.get(row.bestTerm) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [backtestSummaries]);

  const archiveTotals = useMemo(() => {
    return backtestSummaries.reduce(
      (acc, row) => {
        acc.dreams += 1;
        acc.totalHits += Number(row.totalHits ?? 0);
        acc.straight += Number(row.straightHits ?? 0);
        acc.boxed += Number(row.boxedHits ?? 0);
        return acc;
      },
      { dreams: 0, totalHits: 0, straight: 0, boxed: 0 }
    );
  }, [backtestSummaries]);

  const insightCards = useMemo<InsightCard[]>(() => {
    const cards: InsightCard[] = [];

    if (topStates[0]) {
      cards.push({
        title: 'Strongest Live State Pattern',
        body: `${topStates[0].state} leads the live dictionary with a state strength score of ${topStates[0].score} across ${topStates[0].hits} logged hit(s).`,
      });
    }

    if (topTerms[0]) {
      cards.push({
        title: 'Most Active Term',
        body: `${topTerms[0].term} currently has the heaviest live footprint with ${topTerms[0].hits} hit(s) across ${topTerms[0].stateCount} state(s).`,
      });
    }

    if (bestBacktestStates[0]) {
      cards.push({
        title: 'Most Repeated Backtest State',
        body: `${bestBacktestStates[0].state} appears most often as the best state across your completed backtests (${bestBacktestStates[0].count} time(s)).`,
      });
    }

    if (bestBacktestTerms[0]) {
      cards.push({
        title: 'Most Repeated Backtest Term',
        body: `${bestBacktestTerms[0].term} shows up most often as the strongest term in historical replay summaries (${bestBacktestTerms[0].count} time(s)).`,
      });
    }

    if (!cards.length) {
      cards.push({
        title: 'No Pattern Cards Yet',
        body: 'Load more live hits and completed backtests to generate pattern intelligence.',
      });
    }

    return cards;
  }, [topStates, topTerms, bestBacktestStates, bestBacktestTerms]);

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
              <h1>Intelligence Hub</h1>
              <p>
                Deep pattern analysis across your live dictionary memory and your historical backtest archive.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/archive" className="btn-secondary">
                Backtest Archive
              </Link>
              <Link href="/forecast-board" className="btn-secondary">
                Forecast Board
              </Link>
              <Link href="/playlists" className="btn-secondary">
                State Playlist
              </Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          <div>
            <label className="journal-label" htmlFor="termSearch">
              Filter by Term
            </label>
            <input
              id="termSearch"
              className="journal-input"
              value={termSearch}
              onChange={(e) => setTermSearch(e.target.value)}
              placeholder="Ex: dancing"
            />
          </div>

          <div>
            <label className="journal-label" htmlFor="stateSearch">
              Filter by State
            </label>
            <input
              id="stateSearch"
              className="journal-input"
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              placeholder="Ex: Illinois"
            />
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
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{filteredRecords.length}</div>
          </div>

          <div>
            <div className="journal-label">Completed Backtests</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{archiveTotals.dreams}</div>
          </div>

          <div>
            <div className="journal-label">Backtest Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{archiveTotals.totalHits}</div>
          </div>

          <div>
            <div className="journal-label">Backtest Straight Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{archiveTotals.straight}</div>
          </div>

          <div>
            <div className="journal-label">Backtest Boxed Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{archiveTotals.boxed}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Intelligence Hub...</p>
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
            <h1>Pattern Cards</h1>
            <p>High-level findings generated from both live memory and historical research.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              marginTop: '12px',
            }}
          >
            {insightCards.map((card) => (
              <div key={card.title} className="journal-card-flat">
                <strong>{card.title}</strong>
                <p style={{ marginTop: '8px', color: 'var(--ink-light)', lineHeight: 1.6 }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Top Live States</h1>
              <p>States with the strongest active dictionary footprint right now.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {topStates.length ? topStates.map((row, index) => (
                <div key={row.state} className="journal-card-flat">
                  <div><strong>#{index + 1} {row.state}</strong></div>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Score: {row.score} • Hits: {row.hits} • Straight: {row.straight} • Boxed: {row.boxed} • Numbers: {row.uniqueNumbers}
                  </div>
                </div>
              )) : <p>No live state intelligence yet.</p>}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Top Live Terms</h1>
              <p>Terms creating the heaviest cross-state activity in the live dictionary.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {topTerms.length ? topTerms.map((row, index) => (
                <div key={row.term} className="journal-card-flat">
                  <div><strong>#{index + 1} {row.term}</strong></div>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Hits: {row.hits} • States: {row.stateCount} • Numbers: {row.numberCount} • Straight: {row.straight} • Boxed: {row.boxed}
                  </div>
                </div>
              )) : <p>No live term intelligence yet.</p>}
            </div>
          </section>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Top Backtest States</h1>
              <p>States most often emerging as the best-performing backtest state.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {bestBacktestStates.length ? bestBacktestStates.map((row, index) => (
                <div key={row.state} className="journal-card-flat">
                  <div><strong>#{index + 1} {row.state}</strong></div>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Best-state appearances: {row.count}
                  </div>
                </div>
              )) : <p>No backtest state intelligence yet.</p>}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Top Backtest Terms</h1>
              <p>Terms most often emerging as the strongest historical replay term.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {bestBacktestTerms.length ? bestBacktestTerms.map((row, index) => (
                <div key={row.term} className="journal-card-flat">
                  <div><strong>#{index + 1} {row.term}</strong></div>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Best-term appearances: {row.count}
                  </div>
                </div>
              )) : <p>No backtest term intelligence yet.</p>}
            </div>
          </section>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Questions You Should Be Able to Ask the Chat</h1>
            <p>These are the kinds of evidence-aware prompts the app is now approaching.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '10px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              marginTop: '12px',
            }}
          >
            {[
              'Which term performs strongest in Illinois?',
              'What state has repeated most often for dancing?',
              'Which backtested term produced the most straight hits?',
              'What is the strongest live state right now?',
              'Which terms hit fast and which terms are slow-burn?',
              'Which states keep repeating across live mode and backtesting?',
            ].map((prompt) => (
              <div key={prompt} className="journal-card-flat">
                {prompt}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
