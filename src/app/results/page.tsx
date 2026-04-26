'use client';
import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';

type DrawHit = {
  state: string;
  game_type: string;
  draw_date: string;
  draw_time: string;
  winning_number: string;
  is_verified?: boolean;
  source_name?: string;
};

type EngineResponse = {
  hits?: DrawHit[];
  hit_count?: number;
  coverage_gaps?: unknown[];
};

const PICK3_STATES = ['GA','FL','NY','TX','NC','VA','OH','PA','IL','IN','TN','SC','MD','MI','MO','NJ','LA','KY','MS','WV'];
const PICK4_STATES = ['GA','FL','NY','TX','NC','VA','OH','PA','IL','IN','TN','SC','MD','MI','MO','NJ','LA','KY','MS','WV'];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ResultsPage() {
  const [state,       setState]       = useState('GA');
  const [gameType,    setGameType]    = useState('pick3');
  const [startDate,   setStartDate]   = useState(daysAgo(3));
  const [endDate,     setEndDate]     = useState(todayIso());
  const [results,     setResults]     = useState<DrawHit[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [queried,     setQueried]     = useState(false);

  async function handleQuery() {
    setLoading(true); setError(''); setResults([]); setQueried(true);
    try {
      // Query the engine via the backtest bridge with a wildcard candidate
      // that will never match — we just want the all_draws list
      // Better: use a known broad candidate to get coverage data
      const lookahead = Math.max(1, Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
      ) + 1);

      const res = await fetch('/api/backtest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          game_type:      gameType,
          anchor_date:    startDate,
          lookahead_days: lookahead,
          candidates:     ['000'],   // dummy — we read all_draws not hits
          label:          'results-viewer',
        }),
      });

      const data = await res.json() as EngineResponse & { all_draws?: DrawHit[] };
      if (!res.ok) throw new Error((data as any)?.error ?? 'Engine query failed.');

      // Engine returns all_draws when available
      const draws: DrawHit[] = (data.all_draws ?? []).map((d: any) => ({
        state,
        game_type:      gameType,
        draw_date:      d.draw_date ?? d.date ?? '',
        draw_time:      d.draw_time ?? d.drawTime ?? '',
        winning_number: d.winning_number ?? d.result ?? '',
        is_verified:    d.is_verified ?? false,
        source_name:    d.source_name ?? '',
      })).filter((d: DrawHit) => d.winning_number);

      setResults(draws.sort((a, b) =>
        a.draw_date < b.draw_date ? 1 : a.draw_date > b.draw_date ? -1 : 0
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed.');
    } finally {
      setLoading(false);
    }
  }

  const states = gameType === 'pick3' ? PICK3_STATES : PICK4_STATES;

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div className="page-header">
            <h1>Engine Results Viewer</h1>
            <p>Query lottery draw results directly from the Railway engine database. These are the actual ingested results the engine uses for hit detection.</p>
          </div>
        </section>

        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div>
              <label className="journal-label" htmlFor="stateSelect">State</label>
              <select id="stateSelect" className="journal-select" value={state} onChange={e => setState(e.target.value)}>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="gameSelect">Game</label>
              <select id="gameSelect" className="journal-select" value={gameType} onChange={e => setGameType(e.target.value)}>
                <option value="pick3">Pick 3 / Cash 3</option>
                <option value="pick4">Pick 4 / Cash 4</option>
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="startDate">From</label>
              <input id="startDate" type="date" className="journal-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="journal-label" htmlFor="endDate">To</label>
              <input id="endDate" type="date" className="journal-input" value={endDate} onChange={e => setEndDate(e.target.value)} max={todayIso()} />
            </div>
          </div>
          <div>
            <button type="button" className="btn-primary" onClick={handleQuery} disabled={loading}>
              {loading ? 'Querying engine...' : 'Query Engine Results'}
            </button>
          </div>
        </section>

        {error && (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        )}

        {queried && !loading && (
          <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div><div className="journal-label">Draws Found</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{results.length}</div></div>
            <div><div className="journal-label">State</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{state}</div></div>
            <div><div className="journal-label">Game</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{gameType}</div></div>
            <div><div className="journal-label">Date Range</div><div style={{ fontSize: '14px', fontWeight: 600 }}>{startDate} → {endDate}</div></div>
          </section>
        )}

        {queried && !loading && results.length === 0 && !error && (
          <section className="journal-card">
            <p style={{ color: 'var(--ink-light)' }}>
              No draw results found for {state} {gameType} between {startDate} and {endDate}.
              This may mean the engine has not ingested results for this range yet, or the state/game combination is not supported.
            </p>
          </section>
        )}

        {results.length > 0 && (
          <section style={{ display: 'grid', gap: '12px' }}>
            {results.map((row, idx) => (
              <article key={`${row.draw_date}-${row.draw_time}-${row.winning_number}-${idx}`} className="journal-card-flat">
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  <div><div className="journal-label">Date</div><div style={{ fontWeight: 600 }}>{row.draw_date}</div></div>
                  <div><div className="journal-label">Draw Time</div><div>{row.draw_time}</div></div>
                  <div><div className="journal-label">Result</div><div style={{ fontWeight: 700, fontSize: '18px', fontFamily: 'monospace' }}>{row.winning_number}</div></div>
                  <div><div className="journal-label">State</div><div>{row.state}</div></div>
                  <div><div className="journal-label">Game</div><div>{row.game_type}</div></div>
                  <div>
                    <div className="journal-label">Verified</div>
                    <div style={{ color: row.is_verified ? '#4a7c59' : '#888' }}>
                      {row.is_verified ? '✓ Yes' : '—'}
                    </div>
                  </div>
                  {row.source_name && (
                    <div><div className="journal-label">Source</div><div style={{ fontSize: '12px', color: 'var(--ink-light)' }}>{row.source_name}</div></div>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

      </section>
    </main>
  );
}
