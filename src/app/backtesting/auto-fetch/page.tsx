// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import PageIntro from '@/components/ui/PageIntro';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listBacktestDreams } from '@/lib/firebase/firestore';

export default function BacktestingAutoFetchPage() {
  const { user } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [selectedDreamId, setSelectedDreamId] = useState('');
  const [selectedDream, setSelectedDream] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [fetchedRows, setFetchedRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setLoading(false);
        return;
      }

      try {
        const rows = await listBacktestDreams(user.uid);
        setDreams(rows);
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? 'Could not load backtest dreams.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  useEffect(() => {
    const dream = dreams.find((d: any) => d.id === selectedDreamId) ?? null;
    setSelectedDream(dream);
    setAttempts([]);
    setFetchedRows([]);
    setMessage('');
    setError('');
  }, [selectedDreamId, dreams]);

  async function runAutoFetch() {
    if (!selectedDream) return;

    setWorking(true);
    setError('');
    setMessage('');
    setAttempts([]);
    setFetchedRows([]);

    try {
      const res = await fetch('/api/backtesting/auto-fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dreamDate: selectedDream.dreamDate,
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || 'Auto-fetch failed.');
      }

      setAttempts(payload.attempts || []);
      setFetchedRows(payload.rows || []);
      setMessage(`Fetched ${payload.rows?.length ?? 0} normalized row(s).`);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Auto-fetch failed.');
    } finally {
      setWorking(false);
    }
  }

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
          title="Backtest Auto-Fetch"
          description="Automatically research a 7-day Georgia Cash 3 / Cash 4 result window using provider fallback."
          actions={[
            { href: '/backtesting', label: 'Backtesting Portal' },
            { href: '/backtesting/replay', label: 'Replay Lab' },
            { href: '/backtesting/archive', label: 'Backtest Archive' },
          ]}
        />

        {loading ? <section className="journal-card"><p>Loading backtest dreams...</p></section> : null}
        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}>
            {error}
          </section>
        ) : null}
        {message ? <section className="journal-card-flat surface-accent">{message}</section> : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Select Historical Dream</h1>
            <p>Choose the saved dream you want the app to research automatically.</p>
          </div>

          <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
            <select
              className="journal-select"
              value={selectedDreamId}
              onChange={(e) => setSelectedDreamId(e.target.value)}
            >
              <option value="">Select a backtest dream</option>
              {dreams.map((dream: any) => (
                <option key={dream.id} value={dream.id}>
                  {dream.dreamDate} — {String(dream.cleanedText || dream.rawText || '').slice(0, 60)}
                </option>
              ))}
            </select>

            {selectedDream ? (
              <div className="journal-card-flat">
                <strong>Dream Date:</strong> {selectedDream.dreamDate}
                <br />
                <strong>Dream Preview:</strong> {String(selectedDream.cleanedText || selectedDream.rawText || '').slice(0, 180)}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn-primary" disabled={working || !selectedDream} onClick={runAutoFetch}>
                {working ? 'Fetching...' : 'Auto-Fetch 7-Day Results'}
              </button>
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Provider Attempts</h1>
              <p>Each adapter reports whether it found usable rows.</p>
            </div>

            <div className="metric-row" style={{ marginTop: '14px' }}>
              {attempts.length ? attempts.map((attempt: any, i: number) => (
                <div key={`${attempt.provider}-${i}`} className="journal-card-flat">
                  <strong>{attempt.provider}</strong>
                  <div style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
                    ok: {String(attempt.ok)} • rows: {attempt.count} • {attempt.message}
                  </div>
                </div>
              )) : <p>No provider attempts yet.</p>}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Fetched Rows Preview</h1>
              <p>Normalized rows returned by the provider pipeline.</p>
            </div>

            <div className="metric-row" style={{ marginTop: '14px' }}>
              {fetchedRows.length ? fetchedRows.slice(0, 24).map((row: any, i: number) => (
                <div key={`${row.drawDate}-${row.gameType}-${row.drawTime}-${i}`} className="journal-card-flat">
                  {row.drawDate} • {row.gameLabel || row.gameType} • {row.result} • {row.sourceProvider}
                </div>
              )) : <p>No fetched rows yet.</p>}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
