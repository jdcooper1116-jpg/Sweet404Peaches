
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import PageIntro from '@/components/ui/PageIntro';

// ─── Types ────────────────────────────────────────────────────────────────────

type BacktestHit = {
  candidate: string;
  draw_date: string;
  draw_time: string;
  winning_number: string;
  match_type: string;
  is_verified?: boolean;
  source_name?: string;
};

// Original single-state response shape — unchanged
type BacktestResponse = {
  hit_count: number;
  hit_dates: string[];
  hit_draw_times: string[];
  summary: string;
  hits: BacktestHit[];
  all_draws?: any[];
  coverage_gaps?: any[];
};

// All-states merged hit — same as BacktestHit plus provenance fields
type MergedHit = BacktestHit & {
  state: string;
  anchor_date?: string;
  lookahead_days?: number;
  label?: string;
};

// All-states response shape returned by the bridge
type AllStatesResponse = {
  scope: 'all-states';
  game_type: string;
  anchor_date: string;
  lookahead_days: number;
  candidates: string[];
  label: string;
  overall_hit_count: number;
  states_attempted: number;
  states_succeeded: number;
  states_with_hits: string[];
  failed_states: string[];
  combined_hits: MergedHit[];
  results_by_state: Record<string, any>;
  coverage_gaps_by_state: Record<string, any[]>;
};

// Union so result state can hold either shape
type AnyBacktestResponse = BacktestResponse | AllStatesResponse;

function isAllStatesResponse(r: AnyBacktestResponse): r is AllStatesResponse {
  return (r as AllStatesResponse).scope === 'all-states';
}

// ─── Inner page component ─────────────────────────────────────────────────────

function BacktestingPageInner() {
  const searchParams = useSearchParams();

  // Existing form state — unchanged
  const [stateCode, setStateCode]       = useState('GA');
  const [gameType, setGameType]         = useState('pick3');
  const [anchorDate, setAnchorDate]     = useState('2024-01-25');
  const [lookaheadDays, setLookaheadDays] = useState('7');
  const [candidatesText, setCandidatesText] = useState('297,716,999');
  const [label, setLabel]               = useState('test dream window');

  // New: backtest scope mode
  const [scope, setScope] = useState<'single' | 'all-states'>('single');

  const [working, setWorking] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState<AnyBacktestResponse | null>(null);

  // Prefill from URL params — existing params unchanged, scope added
  useEffect(() => {
    const state      = searchParams.get('state');
    const game       = searchParams.get('game');
    const anchor     = searchParams.get('anchor');
    const lookahead  = searchParams.get('lookahead');
    const candidates = searchParams.get('candidates');
    const textLabel  = searchParams.get('label');
    const scopeParam = searchParams.get('scope');

    if (state)      setStateCode(state.toUpperCase());
    if (game)       setGameType(game.toLowerCase());
    if (anchor)     setAnchorDate(anchor);
    if (lookahead)  setLookaheadDays(lookahead);
    if (candidates) setCandidatesText(candidates);
    if (textLabel)  setLabel(textLabel);

    // New: prefill scope from URL
    if (scopeParam === 'all-states') setScope('all-states');
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

      if (scope === 'single' && !stateCode.trim()) throw new Error('State is required.');
      if (!gameType.trim())    throw new Error('Game type is required.');
      if (!anchorDate.trim())  throw new Error('Anchor date is required.');
      if (!candidates.length)  throw new Error('Enter at least one candidate number.');

      // Build payload based on mode
      // Single-state: exact same payload as before
      // All-states:   add scope, omit state
      const payload =
        scope === 'all-states'
          ? {
              scope: 'all-states' as const,
              game_type: gameType.trim().toLowerCase(),
              anchor_date: anchorDate,
              lookahead_days: Number(lookaheadDays),
              candidates,
              label: label.trim(),
            }
          : {
              state: stateCode.trim().toUpperCase(),
              game_type: gameType.trim().toLowerCase(),
              anchor_date: anchorDate,
              lookahead_days: Number(lookaheadDays),
              candidates,
              label: label.trim(),
            };

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.details?.detail || data?.error || 'Backtest failed.');
      }

      setResult(data);
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

  // Style for the active/inactive mode buttons
  const modeBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    borderRadius: '6px',
    border: active ? '2px solid var(--accent, #6C78FF)' : '2px solid rgba(255,255,255,0.15)',
    background: active ? 'rgba(108,120,255,0.18)' : 'rgba(255,255,255,0.05)',
    color: active ? '#fff' : 'rgba(255,255,255,0.55)',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.15s',
  });

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

          {/* ── Mode selector ── */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: 'var(--ink-light)', fontWeight: 600, fontSize: '0.875rem' }}>
              Mode:
            </span>
            <button style={modeBtn(scope === 'single')} onClick={() => setScope('single')}>
              Single State
            </button>
            <button style={modeBtn(scope === 'all-states')} onClick={() => setScope('all-states')}>
              All States
            </button>
          </div>

          <div
            style={{
              marginTop: '16px',
              display: 'grid',
              gap: '16px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {/* State input — hidden in all-states mode */}
            {scope === 'single' && (
              <label style={labelStyle}>
                <span>State</span>
                <input
                  className="journal-input"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                />
              </label>
            )}

            <label style={labelStyle}>
              <span>Game Type</span>
              <select
                className="journal-select"
                value={gameType}
                onChange={(e) => setGameType(e.target.value)}
              >
                <option value="pick3">pick3</option>
                <option value="pick4">pick4</option>
              </select>
            </label>

            <label style={labelStyle}>
              <span>Anchor Date</span>
              <input
                className="journal-input"
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
              />
            </label>

            <label style={labelStyle}>
              <span>Lookahead Days</span>
              <input
                className="journal-input"
                value={lookaheadDays}
                onChange={(e) => setLookaheadDays(e.target.value)}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              <span>Candidates</span>
              <input
                className="journal-input"
                value={candidatesText}
                onChange={(e) => setCandidatesText(e.target.value)}
              />
            </label>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              <span>Label</span>
              <input
                className="journal-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={runBacktest} disabled={working}>
              {working
                ? scope === 'all-states'
                  ? 'Running all states...'
                  : 'Running...'
                : scope === 'all-states'
                ? 'Run All-States Backtest'
                : 'Run Backtest'}
            </button>
            <Link href="/dreams" className="btn-secondary">
              Dream Journal
            </Link>
          </div>
        </section>

        {/* ── Error display — unchanged ── */}
        {error ? (
          <section
            className="journal-card-flat"
            style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}
          >
            {error}
          </section>
        ) : null}

        {/* ── Results: all-states mode ── */}
        {result && isAllStatesResponse(result) ? (
          <section className="journal-card">
            <div className="page-header">
              <h1>All-States Backtest Result</h1>
              <p>
                {result.game_type} · anchor {result.anchor_date} · {result.lookahead_days}-day window ·{' '}
                {result.label}
              </p>
            </div>

            {/* Summary stats */}
            <div
              style={{
                marginTop: '16px',
                display: 'grid',
                gap: '12px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              }}
            >
              <div className="journal-card-flat">
                <div className="journal-label">Overall Hits</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{result.overall_hit_count}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">States Attempted</div>
                <div>{result.states_attempted}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">States Succeeded</div>
                <div>{result.states_succeeded}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">States With Hits</div>
                <div>{result.states_with_hits.length}</div>
              </div>
            </div>

            {/* States with hits */}
            {result.states_with_hits.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="journal-label" style={{ marginBottom: '8px' }}>
                  Hit States
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {result.states_with_hits.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        background: 'rgba(108,120,255,0.18)',
                        border: '1px solid rgba(108,120,255,0.4)',
                        color: '#b0b8ff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Failed states — only shown if any */}
            {result.failed_states.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div className="journal-label" style={{ marginBottom: '8px' }}>
                  Failed States ({result.failed_states.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {result.failed_states.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '20px',
                        background: 'rgba(242,166,166,0.1)',
                        border: '1px solid rgba(242,166,166,0.3)',
                        color: '#f2a6a6',
                        fontSize: '0.75rem',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Combined hit cards */}
            <div style={{ marginTop: '20px', display: 'grid', gap: '12px' }}>
              {result.combined_hits.length > 0 ? (
                result.combined_hits.map((hit, idx) => (
                  <article
                    key={`${hit.state}-${hit.candidate}-${hit.draw_date}-${idx}`}
                    className="journal-card-flat"
                  >
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '12px',
                          background: 'rgba(108,120,255,0.18)',
                          border: '1px solid rgba(108,120,255,0.35)',
                          color: '#b0b8ff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {hit.state}
                      </span>
                      <strong>{hit.candidate}</strong> hit on {hit.draw_date} ({hit.draw_time}) with{' '}
                      {hit.winning_number} — {hit.match_type}
                      {hit.source_name && (
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                          via {hit.source_name}
                        </span>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="journal-card-flat">No hits found across all states.</div>
              )}
            </div>
          </section>
        ) : null}

        {/* ── Results: single-state mode — exact original render, unchanged ── */}
        {result && !isAllStatesResponse(result) ? (
          <section className="journal-card">
            <div className="page-header">
              <h1>Backtest Result</h1>
              <p>{(result as BacktestResponse).summary}</p>
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
                <div>{(result as BacktestResponse).hit_count}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Hit Dates</div>
                <div>
                  {(result as BacktestResponse).hit_dates?.length
                    ? (result as BacktestResponse).hit_dates.join(', ')
                    : 'None'}
                </div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Hit Draw Times</div>
                <div>
                  {(result as BacktestResponse).hit_draw_times?.length
                    ? (result as BacktestResponse).hit_draw_times.join(', ')
                    : 'None'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'grid', gap: '12px' }}>
              {(result as BacktestResponse).hits?.length ? (
                (result as BacktestResponse).hits.map((hit, idx) => (
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

// ─── Suspense wrapper — unchanged ─────────────────────────────────────────────

export default function BacktestingPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#1A1A2E' }} />}>
      <BacktestingPageInner />
    </Suspense>
  );
}
