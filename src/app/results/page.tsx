'use client';

import { useEffect, useMemo, useState } from 'react';
import { ReceiptText, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listLotteryResults } from '@/lib/firebase/firestore';
import type { LotteryResult } from '@/lib/types';

export default function ResultsPage() {
  const { user, loading } = useAuth();
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [gameFilter, setGameFilter] = useState('ALL');

  useEffect(() => {
    async function load() {
      if (!user) {
        setResults([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const rows = await listLotteryResults(user.uid, 500);
        setResults(rows);
      } catch (err) {
        console.error(err);
        setError('Could not load imported results.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const sortedResults = useMemo(() => {
    const filtered = results.filter(row => {
      const stateOk = stateFilter === 'ALL' || row.state === stateFilter;
      const gameOk = gameFilter === 'ALL' || row.gameType === gameFilter;
      return stateOk && gameOk;
    });

    return [...filtered].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.state !== b.state) return a.state.localeCompare(b.state);
      if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
      return a.drawTime.localeCompare(b.drawTime);
    });
  }, [results, stateFilter, gameFilter]);

  const states = useMemo(() => {
    return Array.from(new Set(results.map(r => r.state))).sort();
  }, [results]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Results Log</h1>
            <p>
              Review imported Pick 3 and Pick 4 results by state, date, game,
              and draw time.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading results...</p>
          </section>
        ) : error ? (
          <section
            className="journal-card"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : results.length === 0 ? (
          <section className="journal-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
                color: 'var(--deep-plum)',
              }}
            >
              <Sparkles size={18} />
              <strong>No imported results yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Import some results first and they will appear here.
            </p>
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div
                style={{
                  display: 'grid',
                  gap: '16px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                <div>
                  <label className="journal-label" htmlFor="stateFilter">
                    State Filter
                  </label>
                  <select
                    id="stateFilter"
                    className="journal-select"
                    value={stateFilter}
                    onChange={e => setStateFilter(e.target.value)}
                  >
                    <option value="ALL">All States</option>
                    {states.map(state => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="journal-label" htmlFor="gameFilter">
                    Game Filter
                  </label>
                  <select
                    id="gameFilter"
                    className="journal-select"
                    value={gameFilter}
                    onChange={e => setGameFilter(e.target.value)}
                  >
                    <option value="ALL">All Games</option>
                    <option value="cash3">cash3</option>
                    <option value="cash4">cash4</option>
                  </select>
                </div>

                <div className="journal-card-flat">
                  <div className="journal-label">Visible Rows</div>
                  <div>{sortedResults.length}</div>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gap: '12px' }}>
              {sortedResults.map(row => (
                <article
                  key={`${row.state}__${row.date}__${row.gameType}__${row.drawTime}__${row.normalizedResult}__${row.id}`}
                  className="journal-card"
                >
                  <div
                    style={{
                      display: 'grid',
                      gap: '12px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    }}
                  >
                    <div>
                      <div className="journal-label">State</div>
                      <div>{row.state}</div>
                    </div>

                    <div>
                      <div className="journal-label">Date</div>
                      <div>{row.date}</div>
                    </div>

                    <div>
                      <div className="journal-label">Game</div>
                      <div>{row.gameType}</div>
                    </div>

                    <div>
                      <div className="journal-label">Draw Time</div>
                      <div>{row.drawTime}</div>
                    </div>

                    <div>
                      <div className="journal-label">Result</div>
                      <div>{row.normalizedResult}</div>
                    </div>

                    <div>
                      <div className="journal-label">Boxed Key</div>
                      <div>{row.boxedKey}</div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
