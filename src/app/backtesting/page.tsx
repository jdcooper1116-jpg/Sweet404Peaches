'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import PageIntro from '@/components/ui/PageIntro';

type BacktestHit = {
  candidate: string;
  draw_date: string;
  draw_time: string;
  winning_number: string;
  match_type: string;
  is_verified?: boolean;
  source_name?: string;
};

type BacktestResponse = {
  hit_count: number;
  hit_dates: string[];
  hit_draw_times: string[];
  summary: string;
  hits: BacktestHit[];
  all_draws?: any[];
  coverage_gaps?: any[];
};

function BacktestingPageInner() {
  const searchParams = useSearchParams();

  const [stateCode, setStateCode] = useState('GA');
  const [gameType, setGameType] = useState('pick3');
  const [anchorDate, setAnchorDate] = useState('2024-01-25');
  const [lookaheadDays, setLookaheadDays] = useState('7');
  const [candidatesText, setCandidatesText] = useState('297,716,999');
  const [label, setLabel] = useState('test dream window');

  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BacktestResponse | null>(null);

  useEffect(() => {
    const state = searchParams.get('state');
    const game = searchParams.get('game');
    const anchor = searchParams.get('anchor');
    const lookahead = searchParams.get('lookahead');
    const candidates = searchParams.get('candidates');
    const textLabel = searchParams.get('label');

    if (state) setStateCode(state.toUpperCase());
    if (game) setGameType(game.toLowerCase());
    if (anchor) setAnchorDate(anchor);
    if (lookahead) setLookaheadDays(lookahead);
    if (candidates) setCandidatesText(candidates);
    if (textLabel) setLabel(textLabel);
  }, [searchParams]);

  async function runBacktest() {
    setWorking(true);
    setError('');
    setResult(null);

    try {
      const candidates = candidatesText
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      if (!stateCode.trim()) throw new Error('State is required.');
      if (!gameType.trim()) throw new Error('Game type is required.');
      if (!anchorDate.trim()) throw new Error('Anchor date is required.');
      if (!candidates.length) throw new Error('Enter at least one candidate number.');

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: stateCode.trim().toUpperCase(),
          game_type: gameType.trim().toLowerCase(),
          anchor_date: anchorDate,
          lookahead_days: Number(lookaheadDays),
          candidates,
          label: label.trim(),
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.details?.detail || payload?.error || 'Backtest failed.');
      }

      setResult(payload);
    } catch (err: any) {
      setError(err?.message || 'Backtest failed.');
    } finally {
      setWorking(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'grid',
    gap: '8px',
    color: 'var(--ink-light)',
    fontWeight: 600,
  };

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

      <section className="panel-grid" style={{ padding: '32px' }}>
        <PageIntro
          title="Backtesting"
          description="Run a live dream backtest against the lottery engine."
          actions={[
            { href: '/forecast-board', label: 'Forecast Board' },
            { href: '/chat', label: 'Intelligence Chat' },
          ]}
        />

        <section className="journal-card">
          <div className="page-header">
            <h1>Run Backtest</h1>
            <p>Use manual inputs or launch here from a saved dream.</p>
          </div>

          <div
            style={{
              marginTop: '16px',
              display: 'grid',
              gap: '16px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <label style={labelStyle}>
              <span>State</span>
              <input className="journal-input" value={stateCode} onChange={(e) => setStateCode(e.target.value)} />
            </label>

            <label style={labelStyle}>
              <span>Game Type</span>
              <select className="journal-select" value={gameType} onChange={(e) => setGameType(e.target.value)}>
                <option value="pick3">pick3</option>
                <option value="pick4">pick4</option>
              </select>
            </label>

            <label style={labelStyle}>
              <span>Anchor Date</span>
              <input className="journal-input" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
            </label>

            <label style={labelStyle}>
              <span>Lookahead Days</span>
              <input className="journal-input" value={lookaheadDays} onChange={(e) => setLookaheadDays(e.target.value)} />
            </label>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              <span>Candidates</span>
              <input className="journal-input" value={candidatesText} onChange={(e) => setCandidatesText(e.target.value)} />
            </label>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              <span>Label</span>
              <input className="journal-input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={runBacktest} disabled={working}>
              {working ? 'Running...' : 'Run Backtest'}
            </button>
            <Link href="/dreams" className="btn-secondary">
              Dream Journal
            </Link>
          </div>
        </section>

        {error ? (
          <section
            className="journal-card-flat"
            style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}
          >
            {error}
          </section>
        ) : null}

        {result ? (
          <section className="journal-card">
            <div className="page-header">
              <h1>Backtest Result</h1>
              <p>{result.summary}</p>
            </div>

            <div
              style={{
                marginTop: '16px',
                display: 'grid',
                gap: '12px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              }}
            >
              <div className="journal-card-flat">
                <div className="journal-label">Hit Count</div>
                <div>{result.hit_count}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Hit Dates</div>
                <div>{result.hit_dates?.length ? result.hit_dates.join(', ') : 'None'}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Hit Draw Times</div>
                <div>{result.hit_draw_times?.length ? result.hit_draw_times.join(', ') : 'None'}</div>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'grid', gap: '12px' }}>
              {result.hits?.length ? (
                result.hits.map((hit, idx) => (
                  <article key={`${hit.candidate}-${hit.draw_date}-${idx}`} className="journal-card-flat">
                    <strong>{hit.candidate}</strong> hit on {hit.draw_date} ({hit.draw_time}) with{' '}
                    {hit.winning_number} — {hit.match_type}
                  </article>
                ))
              ) : (
                <div className="journal-card-flat">No hit cards returned.</div>
              )}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default function BacktestingPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#1A1A2E' }} />}>
      <BacktestingPageInner />
    </Suspense>
  );
}
