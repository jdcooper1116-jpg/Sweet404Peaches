'use client';

import { useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { bulkCreateLotteryResults } from '@/lib/firebase/firestore';
import type { DrawTime, GameType, LotteryResult } from '@/lib/types';

type ParsedRow = Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt' | 'boxedKey'>;

function normalizeResult(value: string): string {
  return value.replace(/\D/g, '');
}

function parseGameType(value: string): GameType | null {
  const v = value.trim().toLowerCase();
  if (v === 'cash3' || v === 'pick3' || v === 'pick 3') return 'cash3';
  if (v === 'cash4' || v === 'pick4' || v === 'pick 4') return 'cash4';
  return null;
}

function parseDrawTime(value: string): DrawTime {
  const v = value.trim().toLowerCase();
  if (v === 'midday') return 'midday';
  if (v === 'evening') return 'evening';
  if (v === 'night') return 'night';
  return 'unknown';
}

function parsePasteInput(raw: string): ParsedRow[] {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const parts = line.includes('\t')
      ? line.split('\t').map(p => p.trim())
      : line.split(',').map(p => p.trim());

    if (parts.length < 5) continue;

    const [state, date, gameRaw, drawTimeRaw, resultRaw] = parts;

    const gameType = parseGameType(gameRaw);
    if (!gameType) continue;

    const normalizedResult = normalizeResult(resultRaw);
    if (
      (gameType === 'cash3' && normalizedResult.length !== 3) ||
      (gameType === 'cash4' && normalizedResult.length !== 4)
    ) {
      continue;
    }

    rows.push({
      state,
      date,
      gameType,
      drawTime: parseDrawTime(drawTimeRaw),
      rawResult: resultRaw,
      normalizedResult,
      sourceType: 'paste',
    });
  }

  return rows;
}

export default function ResultsImportPage() {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const previewRows = useMemo(() => parsePasteInput(input), [input]);

  async function handleSave() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!previewRows.length) {
      setError('No valid rows were found to import.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await bulkCreateLotteryResults(user.uid, previewRows);
      setMessage(`Imported ${previewRows.length} result row(s).`);
      setInput('');
    } catch (err) {
      console.error(err);
      setError('Could not import results. Check Firestore permissions.');
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
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Results Import</h1>
            <p>
              Paste results in CSV or tab-separated format:
              <br />
              <strong>state,date,gameType,drawTime,result</strong>
            </p>
          </div>
        </section>

        <section className="journal-card">
          <label className="journal-label" htmlFor="resultsPaste">
            Paste Results
          </label>
          <textarea
            id="resultsPaste"
            className="journal-textarea"
            rows={12}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              'GA,2026-04-06,cash3,midday,040\nGA,2026-04-06,cash4,midday,2915\nFL,2026-04-06,cash3,evening,726'
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
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Importing...' : 'Import Results'}
            </button>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Preview</h1>
            <p>{previewRows.length} valid row(s) detected.</p>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {previewRows.length ? (
              previewRows.map((row, index) => (
                <div key={`${row.state}-${row.date}-${row.gameType}-${row.drawTime}-${index}`} className="journal-card-flat">
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
      </section>
    </main>
  );
}
