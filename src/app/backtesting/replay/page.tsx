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
  runBacktestReplayForDream,
} from '@/lib/firebase/firestore';

export default function BacktestingReplayPage() {
  const { user } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [selectedBacktestId, setSelectedBacktestId] = useState('');
  const [running, setRunning] = useState(false);
  const [loadingDreams, setLoadingDreams] = useState(true);
  const [loadingReplayData, setLoadingReplayData] = useState(true);
  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [hits, setHits] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDreams() {
      if (!user) {
        setDreams([]);
        setLoadingDreams(false);
        return;
      }

      try {
        const rows = await listBacktestDreams(user.uid);
        setDreams(rows);
        if (rows.length) {
          setSelectedBacktestId((current) => current || rows[0].id);
        }
      } catch (err) {
        console.error(err);
        setError('Could not load backtest dreams.');
      } finally {
        setLoadingDreams(false);
      }
    }

    void loadDreams();
  }, [user]);

  useEffect(() => {
    async function loadReplayData() {
      if (!user || !selectedBacktestId) {
        setSavedResults([]);
        setHits([]);
        setSummary(null);
        setLoadingReplayData(false);
        return;
      }

      setLoadingReplayData(true);

      try {
        const [resultsRows, hitRows, summaryRow] = await Promise.all([
          listBacktestResultsForDream(user.uid, selectedBacktestId),
          listBacktestHitsForDream(user.uid, selectedBacktestId),
          getBacktestSummaryForDream(user.uid, selectedBacktestId),
        ]);

        setSavedResults(resultsRows);
        setHits(hitRows);
        setSummary(summaryRow);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingReplayData(false);
      }
    }

    void loadReplayData();
  }, [user, selectedBacktestId]);

  const selectedDream = useMemo(
    () => dreams.find((dream) => dream.id === selectedBacktestId) ?? null,
    [dreams, selectedBacktestId]
  );

  async function handleRunReplay() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!selectedBacktestId) {
      setError('Please select a backtest dream first.');
      return;
    }

    setRunning(true);
    setError('');
    setMessage('');

    try {
      const summaryRow = await runBacktestReplayForDream(user.uid, selectedBacktestId);
      const hitRows = await listBacktestHitsForDream(user.uid, selectedBacktestId);

      setSummary(summaryRow);
      setHits(hitRows);

      setMessage(
        `Replay complete. ${summaryRow.totalHits ?? 0} hit(s) were detected and the dictionaries were strengthened.`
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not run replay.');
    } finally {
      setRunning(false);
    }
  }

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
              <h1>Replay Lab</h1>
              <p>
                Run a true historical replay for a saved backtest dream and its attached 7-day results window.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/results" className="btn-secondary">
                Historical Results Intake
              </Link>
              <Link href="/fell-before" className="btn-secondary">
                As They Fell Before
              </Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card"
          style={{
            display: 'grid',
            gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          <div>
            <label className="journal-label" htmlFor="backtestDream">
              Select Backtest Dream
            </label>
            <select
              id="backtestDream"
              className="journal-select"
              value={selectedBacktestId}
              onChange={(e) => setSelectedBacktestId(e.target.value)}
              disabled={loadingDreams}
            >
              <option value="">Choose a saved backtest dream</option>
              {dreams.map((dream) => (
                <option key={dream.id} value={dream.id}>
                  {dream.dreamDate || 'No Date'} • {dream.source || 'unknown source'}
                </option>
              ))}
            </select>
          </div>

          <div className="journal-card-flat">
            <div className="journal-label">Window</div>
            <div style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
              {selectedDream
                ? `${selectedDream.activeWindowStart || '—'} → ${selectedDream.activeWindowEnd || '—'}`
                : 'Select a backtest dream to view its replay window.'}
            </div>
          </div>

          <div className="journal-card-flat">
            <div className="journal-label">Current Status</div>
            <div style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
              {selectedDream?.status || '—'}
            </div>
          </div>
        </section>

        {message ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#cfe5c8',
              background: '#f5fbf2',
              color: '#315a2b',
            }}
          >
            {message}
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleRunReplay}
              disabled={running || !selectedBacktestId}
            >
              {running ? 'Running Replay...' : 'Run Historical Replay'}
            </button>
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
            <div className="journal-label">Historical Results Loaded</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{savedResults.length}</div>
          </div>

          <div>
            <div className="journal-label">Backtest Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{hits.length}</div>
          </div>

          <div>
            <div className="journal-label">Straight Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>
              {summary?.straightHits ?? 0}
            </div>
          </div>

          <div>
            <div className="journal-label">Boxed Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>
              {summary?.boxedHits ?? 0}
            </div>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Replay Summary</h1>
            <p>This updates after you run the historical replay.</p>
          </div>

          {loadingReplayData ? (
            <p>Loading replay summary...</p>
          ) : summary ? (
            <div
              style={{
                display: 'grid',
                gap: '12px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                marginTop: '12px',
              }}
            >
              <div className="journal-card-flat">
                <div className="journal-label">Total Hits</div>
                <div>{summary.totalHits ?? 0}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Straight Hits</div>
                <div>{summary.straightHits ?? 0}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Boxed Hits</div>
                <div>{summary.boxedHits ?? 0}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Best State</div>
                <div>{summary.bestState || '—'}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Best Term</div>
                <div>{summary.bestTerm || '—'}</div>
              </div>

              <div className="journal-card-flat">
                <div className="journal-label">Unique States</div>
                <div>
                  {Array.isArray(summary.uniqueStates) ? summary.uniqueStates.length : 0}
                </div>
              </div>
            </div>
          ) : (
            <p>No replay summary yet.</p>
          )}
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Detected Historical Hits</h1>
            <p>These are the replay hits detected for the selected dream.</p>
          </div>

          {loadingReplayData ? (
            <p>Loading backtest hits...</p>
          ) : hits.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {hits.map((hit) => (
                <div key={hit.id} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    }}
                  >
                    <div><strong>Term:</strong> {hit.termLabel}</div>
                    <div><strong>Number:</strong> {hit.number}</div>
                    <div><strong>State:</strong> {hit.state}</div>
                    <div><strong>Game:</strong> {hit.gameType}</div>
                    <div><strong>Draw:</strong> {hit.drawTime}</div>
                    <div><strong>Date:</strong> {hit.drawDate}</div>
                    <div><strong>Hit Type:</strong> {hit.hitType}</div>
                    <div><strong>Result:</strong> {hit.normalizedResult}</div>
                    <div><strong>Days From Dream:</strong> {hit.daysFromDream}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No backtest hits detected yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
