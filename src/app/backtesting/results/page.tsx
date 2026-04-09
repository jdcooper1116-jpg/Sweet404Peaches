'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  bulkCreateBacktestResults,
  listBacktestDreams,
  listBacktestResultsForDream,
} from '@/lib/firebase/firestore';
import {
  parseBacktestResultsPaste,
  type BacktestParsedRow,
} from '@/lib/parser/backtestResultsPaste';

export default function BacktestingResultsPage() {
  const { user } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [selectedBacktestId, setSelectedBacktestId] = useState('');
  const [resultsPaste, setResultsPaste] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingDreams, setLoadingDreams] = useState(true);
  const [loadingSavedRows, setLoadingSavedRows] = useState(true);
  const [savedRows, setSavedRows] = useState<any[]>([]);
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
    async function loadSavedRows() {
      if (!user || !selectedBacktestId) {
        setSavedRows([]);
        setLoadingSavedRows(false);
        return;
      }

      setLoadingSavedRows(true);

      try {
        const rows = await listBacktestResultsForDream(user.uid, selectedBacktestId);
        setSavedRows(rows);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSavedRows(false);
      }
    }

    void loadSavedRows();
  }, [user, selectedBacktestId]);

  const selectedDream = useMemo(
    () => dreams.find((dream) => dream.id === selectedBacktestId) ?? null,
    [dreams, selectedBacktestId]
  );

  const previewRows = useMemo<BacktestParsedRow[]>(
    () => parseBacktestResultsPaste(resultsPaste),
    [resultsPaste]
  );

  async function handleSaveBacktestResults() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!selectedBacktestId) {
      setError('Please select a backtest dream first.');
      return;
    }

    if (!previewRows.length) {
      setError(
        'No valid rows were found to import. Paste a state on one line, then Game / Draw Date / Results on the following line(s).'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await bulkCreateBacktestResults(
        user.uid,
        selectedBacktestId,
        previewRows.map(({ gameLabel, bonusText, ...row }) => row)
      );

      const refreshed = await listBacktestResultsForDream(user.uid, selectedBacktestId);
      setSavedRows(refreshed);

      setMessage(
        `Imported ${previewRows.length} historical result row(s) for the selected backtest dream.`
      );
      setResultsPaste('');
    } catch (err) {
      console.error(err);
      setError('Could not save historical backtest results.');
    } finally {
      setSaving(false);
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
              <h1>Historical Results Intake</h1>
              <p>
                Attach all-state Pick 3 / Pick 4 results to a saved historical dream so the Replay Lab can simulate the full 7-day window.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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

        <section className="journal-card">
          <label className="journal-label" htmlFor="resultsPaste">
            Paste Historical Results
          </label>
          <textarea
            id="resultsPaste"
            className="journal-textarea"
            rows={18}
            value={resultsPaste}
            onChange={(e) => setResultsPaste(e.target.value)}
            placeholder={
              'Game\tDraw Date\tResults\nGeorgia\nCash 3 Midday\tTue, Apr 7, 2026\t9-0-2\nGeorgia\nCash 4 Midday\tTue, Apr 7, 2026\t8-2-7-8'
            }
          />

          {message ? (
            <div
              className="journal-card-flat"
              style={{
                marginTop: '16px',
                borderColor: '#cfe5c8',
                background: '#f5fbf2',
                color: '#315a2b',
              }}
            >
              {message}
            </div>
          ) : null}

          {error ? (
            <div
              className="journal-card-flat"
              style={{
                marginTop: '16px',
                borderColor: '#e9c2c2',
                background: '#fff4f4',
                color: '#8a2f2f',
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveBacktestResults}
              disabled={saving}
            >
              {saving ? 'Importing...' : 'Save Historical Results'}
            </button>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Preview</h1>
            <p>{previewRows.length} valid historical result row(s) detected.</p>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {previewRows.length ? (
              previewRows.map((row, index) => (
                <div
                  key={`${row.state}-${row.date}-${row.gameType}-${row.drawTime}-${index}`}
                  className="journal-card-flat"
                >
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    }}
                  >
                    <div><strong>State:</strong> {row.state}</div>
                    <div><strong>Date:</strong> {row.date}</div>
                    <div><strong>Game Type:</strong> {row.gameType}</div>
                    <div><strong>Game Label:</strong> {row.gameLabel}</div>
                    <div><strong>Draw:</strong> {row.drawTime}</div>
                    <div><strong>Result:</strong> {row.normalizedResult}</div>
                    <div><strong>Raw:</strong> {row.rawResult}</div>
                    {row.bonusText ? <div><strong>Bonus:</strong> {row.bonusText}</div> : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                No valid rows yet.
              </div>
            )}
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Saved Historical Results</h1>
            <p>Rows already attached to the selected backtest dream.</p>
          </div>

          {loadingSavedRows ? (
            <p>Loading saved results...</p>
          ) : savedRows.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {savedRows.map((row) => (
                <div key={row.id} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    }}
                  >
                    <div><strong>State:</strong> {row.state}</div>
                    <div><strong>Date:</strong> {row.date}</div>
                    <div><strong>Game:</strong> {row.gameType}</div>
                    <div><strong>Draw:</strong> {row.drawTime}</div>
                    <div><strong>Result:</strong> {row.normalizedResult}</div>
                    <div><strong>Raw:</strong> {row.rawResult}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No saved historical results for this backtest dream yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
