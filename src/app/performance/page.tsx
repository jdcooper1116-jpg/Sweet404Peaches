'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Trophy } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listPinnedPlays } from '@/lib/firebase/firestore';

type PinStatus = 'pinned' | 'played' | 'won' | 'archived';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function winRate(won: number, resolved: number) {
  if (!resolved) return '0%';
  return `${((won / resolved) * 100).toFixed(1)}%`;
}

export default function PerformancePage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(todayIso());

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const result = await listPinnedPlays(user.uid);
        setRows(result);
      } catch (err) {
        console.error(err);
        setError('Could not load performance data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const d = String(row.playDate || '');
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [rows, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const pinned = filteredRows.filter(row => row.status === 'pinned').length;
    const played = filteredRows.filter(row => row.status === 'played').length;
    const won = filteredRows.filter(row => row.status === 'won').length;
    const archived = filteredRows.filter(row => row.status === 'archived').length;
    const resolved = played + won;

    return { total, pinned, played, won, archived, resolved };
  }, [filteredRows]);

  const byType = useMemo(() => {
    const map = new Map<string, any>();

    for (const row of filteredRows) {
      const key = row.playType || 'other';
      if (!map.has(key)) {
        map.set(key, { key, total: 0, played: 0, won: 0, scoreSum: 0 });
      }
      const item = map.get(key)!;
      item.total += 1;
      item.scoreSum += row.score || 0;
      if (row.status === 'played') item.played += 1;
      if (row.status === 'won') item.won += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  }, [filteredRows]);

  const byState = useMemo(() => {
    const map = new Map<string, any>();

    for (const row of filteredRows) {
      const key = row.state || '—';
      if (!map.has(key)) {
        map.set(key, { key, total: 0, played: 0, won: 0 });
      }
      const item = map.get(key)!;
      item.total += 1;
      if (row.status === 'played') item.played += 1;
      if (row.status === 'won') item.won += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  }, [filteredRows]);

  const byScope = useMemo(() => {
    const map = new Map<string, any>();

    for (const row of filteredRows) {
      const key = row.dreamerScope || 'ALL';
      if (!map.has(key)) {
        map.set(key, { key, total: 0, played: 0, won: 0 });
      }
      const item = map.get(key)!;
      item.total += 1;
      if (row.status === 'played') item.played += 1;
      if (row.status === 'won') item.won += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  }, [filteredRows]);

  const visibleDates = useMemo(() => unique(filteredRows.map(row => row.playDate || '')).sort().reverse(), [filteredRows]);

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
          <div className="page-header">
            <h1>Performance Dashboard</h1>
            <p>
              Review pinned-play activity, outcomes, and win rate patterns across types, states, and dreamer scopes.
            </p>
          </div>
        </section>

        <section className="journal-card-flat">
          <div
            style={{
              display: 'grid',
              gap: '16px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div>
              <label className="journal-label">Start Date</label>
              <input
                type="date"
                className="journal-input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="journal-label">End Date</label>
              <input
                type="date"
                className="journal-input"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading performance...</p>
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
        ) : (
          <>
            <section className="journal-card-flat">
              <div
                style={{
                  display: 'grid',
                  gap: '12px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                }}
              >
                <div>
                  <div className="journal-label">Total Pins</div>
                  <div>{summary.total}</div>
                </div>
                <div>
                  <div className="journal-label">Pinned</div>
                  <div>{summary.pinned}</div>
                </div>
                <div>
                  <div className="journal-label">Played</div>
                  <div>{summary.played}</div>
                </div>
                <div>
                  <div className="journal-label">Won</div>
                  <div>{summary.won}</div>
                </div>
                <div>
                  <div className="journal-label">Archived</div>
                  <div>{summary.archived}</div>
                </div>
                <div>
                  <div className="journal-label">Resolved Win Rate</div>
                  <div>{winRate(summary.won, summary.resolved)}</div>
                </div>
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <BarChart3 size={18} />
                <strong>Performance by Play Type</strong>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {byType.length ? byType.map(item => (
                  <div key={item.key} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      <div>
                        <div className="journal-label">Type</div>
                        <div>{item.key}</div>
                      </div>
                      <div>
                        <div className="journal-label">Total</div>
                        <div>{item.total}</div>
                      </div>
                      <div>
                        <div className="journal-label">Won</div>
                        <div>{item.won}</div>
                      </div>
                      <div>
                        <div className="journal-label">Resolved Win Rate</div>
                        <div>{winRate(item.won, item.played + item.won)}</div>
                      </div>
                      <div>
                        <div className="journal-label">Average Score</div>
                        <div>{item.total ? (item.scoreSum / item.total).toFixed(1) : '0.0'}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    No play type data in this date range.
                  </div>
                )}
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Trophy size={18} />
                <strong>Performance by Dreamer Scope</strong>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {byScope.length ? byScope.map(item => (
                  <div key={item.key} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      <div>
                        <div className="journal-label">Scope</div>
                        <div>{item.key}</div>
                      </div>
                      <div>
                        <div className="journal-label">Total</div>
                        <div>{item.total}</div>
                      </div>
                      <div>
                        <div className="journal-label">Won</div>
                        <div>{item.won}</div>
                      </div>
                      <div>
                        <div className="journal-label">Resolved Win Rate</div>
                        <div>{winRate(item.won, item.played + item.won)}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    No dreamer-scope data in this date range.
                  </div>
                )}
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Trophy size={18} />
                <strong>Performance by State</strong>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {byState.length ? byState.map(item => (
                  <div key={item.key} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      <div>
                        <div className="journal-label">State</div>
                        <div>{item.key}</div>
                      </div>
                      <div>
                        <div className="journal-label">Total</div>
                        <div>{item.total}</div>
                      </div>
                      <div>
                        <div className="journal-label">Won</div>
                        <div>{item.won}</div>
                      </div>
                      <div>
                        <div className="journal-label">Resolved Win Rate</div>
                        <div>{winRate(item.won, item.played + item.won)}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    No state data in this date range.
                  </div>
                )}
              </div>
            </section>

            <section className="journal-card-flat">
              <div className="journal-label">Dates in Current View</div>
              <div>{visibleDates.join(', ') || 'None'}</div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
