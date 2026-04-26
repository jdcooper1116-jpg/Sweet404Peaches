'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';

type DrawRow = {
  state: string;
  game_type: string;
  draw_date: string;
  draw_time: string;
  winning_number: string;
  is_verified?: boolean;
  source_name?: string;
};

// Full engine-supported state lists
const PICK3_STATES = [
  'AZ','CA','CO','CT','DE','DC','FL','GA','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MO','NH','NJ','NM','NY','NC','OH','OK','OR',
  'PA','RI','SC','TN','TX','VT','VA','WV','WI',
];
const PICK4_STATES = PICK3_STATES.filter(s => s !== 'AZ' && s !== 'MN');

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ResultsPage() {
  const [state,     setState]     = useState('GA');
  const [gameType,  setGameType]  = useState('pick3');
  const [startDate, setStartDate] = useState(daysAgo(3));
  const [endDate,   setEndDate]   = useState(todayIso());
  const [results,   setResults]   = useState<DrawRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [queried,   setQueried]   = useState(false);

  async function runQuery(
    qState = state,
    qGame  = gameType,
    qStart = startDate,
    qEnd   = endDate
  ) {
    setLoading(true); setError(''); setResults([]); setQueried(true);
    try {
      const lookahead = Math.max(
        1,
        Math.ceil((new Date(qEnd).getTime() - new Date(qStart).getTime()) / 86_400_000) + 1
      );
      const res = await fetch('/api/backtest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state:          qState,
          game_type:      qGame,
          anchor_date:    qStart,
          lookahead_days: lookahead,
          candidates:     ['000'],   // dummy — we only read all_draws
          label:          'results-viewer',
        }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data?.error ?? 'Engine query failed.');

      const draws: DrawRow[] = (data.all_draws ?? [])
        .map((d: any) => ({
          state:          qState,
          game_type:      qGame,
          draw_date:      d.draw_date ?? '',
          draw_time:      d.draw_time ?? '',
          winning_number: d.winning_number ?? '',
          is_verified:    d.is_verified ?? false,
          source_name:    d.source_name ?? '',
        }))
        .filter((d: DrawRow) => d.winning_number)
        .sort((a: DrawRow, b: DrawRow) =>
          a.draw_date < b.draw_date ? 1
          : a.draw_date > b.draw_date ? -1
          : a.draw_time.localeCompare(b.draw_time) * -1
        );

      setResults(draws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-load on mount with default values
  useEffect(() => { void runQuery(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const states = gameType === 'pick3' ? PICK3_STATES : PICK4_STATES;

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        {/* Header */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Results Log</h1>
            <p>
              Live draw results from the Railway engine database — the same results used for
              dream hit detection. Filter by state, game, and date range.
            </p>
          </div>
        </section>

        {/* Filter controls */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label className="journal-label" htmlFor="stateSelect">State</label>
              <select
                id="stateSelect"
                className="journal-select"
                value={state}
                onChange={e => setState(e.target.value)}
              >
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="gameSelect">Game</label>
              <select
                id="gameSelect"
                className="journal-select"
                value={gameType}
                onChange={e => {
                  const g = e.target.value;
                  setGameType(g);
                  // Reset state if current state not in new game's list
                  const list = g === 'pick3' ? PICK3_STATES : PICK4_STATES;
                  if (!list.includes(state)) setState(list[0]);
                }}
              >
                <option value="pick3">Pick 3 / Cash 3</option>
                <option value="pick4">Pick 4 / Cash 4</option>
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="startDate">From</label>
              <input
                id="startDate"
                type="date"
                className="journal-input"
                value={startDate}
                max={endDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="journal-label" htmlFor="endDate">To</label>
              <input
                id="endDate"
                type="date"
                className="journal-input"
                value={endDate}
                max={todayIso()}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runQuery()}
              disabled={loading}
            >
              {loading ? 'Loading results...' : 'Query Engine Results'}
            </button>
          </div>
        </section>

        {/* Error */}
        {error && (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        )}

        {/* Summary strip — shown once results are loaded */}
        {queried && !loading && !error && (
          <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div>
              <div className="journal-label">Draws Found</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{results.length}</div>
            </div>
            <div>
              <div className="journal-label">State</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{state}</div>
            </div>
            <div>
              <div className="journal-label">Game</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{gameType === 'pick3' ? 'Pick 3' : 'Pick 4'}</div>
            </div>
            <div>
              <div className="journal-label">Date Range</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{startDate} → {endDate}</div>
            </div>
            <div>
              <div className="journal-label">Verified</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>
                {results.filter(r => r.is_verified).length} / {results.length}
              </div>
            </div>
          </section>
        )}

        {/* Empty state */}
        {queried && !loading && !error && results.length === 0 && (
          <section className="journal-card">
            <p style={{ color: 'var(--ink-light)', margin: 0 }}>
              No draw results found for <strong>{state}</strong> {gameType === 'pick3' ? 'Pick 3' : 'Pick 4'} between {startDate} and {endDate}.
              The engine may not have ingested this range yet, or this state/game combination may not be supported.
            </p>
          </section>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <section style={{ display: 'grid', gap: '8px' }}>
            {results.map((row, idx) => (
              <article
                key={`${row.draw_date}-${row.draw_time}-${row.winning_number}-${idx}`}
                className="journal-card-flat"
                style={{ padding: '12px 16px' }}
              >
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', alignItems: 'center' }}>
                  <div>
                    <div className="journal-label">Date</div>
                    <div style={{ fontWeight: 600 }}>{row.draw_date}</div>
                  </div>
                  <div>
                    <div className="journal-label">Draw</div>
                    <div style={{ textTransform: 'capitalize' }}>{row.draw_time}</div>
                  </div>
                  <div>
                    <div className="journal-label">Result</div>
                    <div style={{ fontWeight: 700, fontSize: '20px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                      {row.winning_number}
                    </div>
                  </div>
                  <div>
                    <div className="journal-label">State</div>
                    <div style={{ fontWeight: 600 }}>{row.state}</div>
                  </div>
                  <div>
                    <div className="journal-label">Game</div>
                    <div>{row.game_type === 'pick3' ? 'Pick 3' : 'Pick 4'}</div>
                  </div>
                  <div>
                    <div className="journal-label">Verified</div>
                    <div style={{ color: row.is_verified ? '#4a7c59' : '#888', fontWeight: row.is_verified ? 600 : 400 }}>
                      {row.is_verified ? '✓ Verified' : '—'}
                    </div>
                  </div>
                  {row.source_name && (
                    <div>
                      <div className="journal-label">Source</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-light)' }}>{row.source_name}</div>
                    </div>
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
