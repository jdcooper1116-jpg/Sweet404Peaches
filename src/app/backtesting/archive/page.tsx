'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  listBacktestDreams,
  listBacktestHitsForDream,
  listBacktestResultsForDream,
} from '@/lib/firebase/firestore';

type BacktestMonitorRow = {
  id: string;
  dreamDate: string;
  source: string;
  status: string;
  activeWindowStart: string;
  activeWindowEnd: string;
  cash3Count: number;
  cash4Count: number;
  resultsCount: number;
  hitsCount: number;
  straightHits: number;
  boxedHits: number;
  bestState: string;
  bestTerm: string;
};

export default function BacktestingArchivePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BacktestMonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setLoading(false);
        return;
      }

      try {
        const dreams = await listBacktestDreams(user.uid);

        const monitorRows = await Promise.all(
          dreams.map(async (dream: any) => {
            const [results, hits, summary] = await Promise.all([
              listBacktestResultsForDream(user.uid, dream.id),
              listBacktestHitsForDream(user.uid, dream.id),
              getBacktestSummaryForDream(user.uid, dream.id),
            ]);

            return {
              id: dream.id,
              dreamDate: dream.dreamDate || '',
              source: dream.source || '—',
              status: dream.status || '—',
              activeWindowStart: dream.activeWindowStart || '',
              activeWindowEnd: dream.activeWindowEnd || '',
              cash3Count: Array.isArray(dream.cash3Numbers) ? dream.cash3Numbers.length : 0,
              cash4Count: Array.isArray(dream.cash4Numbers) ? dream.cash4Numbers.length : 0,
              resultsCount: results.length,
              hitsCount: hits.length,
              straightHits: summary?.straightHits ?? 0,
              boxedHits: summary?.boxedHits ?? 0,
              bestState: summary?.bestState ?? '',
              bestTerm: summary?.bestTerm ?? '',
            };
          })
        );

        monitorRows.sort((a, b) => {
          if (a.dreamDate === b.dreamDate) return 0;
          return a.dreamDate < b.dreamDate ? 1 : -1;
        });

        setRows(monitorRows);
      } catch (err) {
        console.error(err);
        setError('Could not load Backtest Archive.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.dreams += 1;
        acc.results += row.resultsCount;
        acc.hits += row.hitsCount;
        acc.straight += row.straightHits;
        acc.boxed += row.boxedHits;
        return acc;
      },
      { dreams: 0, results: 0, hits: 0, straight: 0, boxed: 0 }
    );
  }, [rows]);

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
              <h1>Backtest Archive</h1>
              <p>
                Monitor every historical dream in Research Mode, including results loaded,
                replay progress, hits found, and strongest backtest outcomes.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting" className="btn-secondary">
                Backtesting Portal
              </Link>
              <Link href="/backtesting/intake" className="btn-secondary">
                Historical Dream Intake
              </Link>
              <Link href="/backtesting/replay" className="btn-secondary">
                Replay Lab
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
            <div className="journal-label">Backtest Dreams</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{totals.dreams}</div>
          </div>

          <div>
            <div className="journal-label">Historical Results Rows</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{totals.results}</div>
          </div>

          <div>
            <div className="journal-label">Detected Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{totals.hits}</div>
          </div>

          <div>
            <div className="journal-label">Straight Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{totals.straight}</div>
          </div>

          <div>
            <div className="journal-label">Boxed Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{totals.boxed}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Backtest Archive...</p>
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

        {!loading && !rows.length ? (
          <section className="journal-card">
            <p>No backtest dreams saved yet.</p>
          </section>
        ) : null}

        {rows.length ? (
          <section style={{ display: 'grid', gap: '16px' }}>
            {rows.map((row) => (
              <section key={row.id} className="journal-card" style={{ display: 'grid', gap: '14px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>{row.dreamDate || 'No Dream Date'}</h2>
                    <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                      {row.activeWindowStart || '—'} → {row.activeWindowEnd || '—'}
                    </div>
                    <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                      ID: {row.id}
                    </div>
                  </div>

                  <div className="journal-card-flat" style={{ minWidth: '180px' }}>
                    <div className="journal-label">Status</div>
                    <div style={{ fontWeight: 700 }}>{row.status || '—'}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  }}
                >
                  <div className="journal-card-flat">
                    <div className="journal-label">Source</div>
                    <div>{row.source}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Cash 3 Numbers</div>
                    <div>{row.cash3Count}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Cash 4 Numbers</div>
                    <div>{row.cash4Count}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Results Loaded</div>
                    <div>{row.resultsCount}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Detected Hits</div>
                    <div>{row.hitsCount}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Straight Hits</div>
                    <div>{row.straightHits}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Boxed Hits</div>
                    <div>{row.boxedHits}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Best State</div>
                    <div>{row.bestState || '—'}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Best Term</div>
                    <div>{row.bestTerm || '—'}</div>
                  </div>
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}
