'use client';

import { useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { bulkCreateLotteryResults } from '@/lib/firebase/firestore';
import type { DrawTime, GameType, LotteryResult } from '@/lib/types';

type ParsedRow = Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt' | 'boxedKey'>;
type PreviewRow = ParsedRow & {
  gameLabel: string;
  bonusText?: string;
};

function normalizeResult(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.trim();
  return parsed.toISOString().slice(0, 10);
}

function extractPrimaryResult(value: string) {
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  const rawResult = parts[0] ?? '';
  const normalizedResult = normalizeResult(rawResult);
  const bonusText = parts.slice(1).join(', ') || undefined;

  return { rawResult, normalizedResult, bonusText };
}

function inferGameType(gameRaw: string, normalizedResult: string): GameType | null {
  if (normalizedResult.length === 3) return 'cash3';
  if (normalizedResult.length === 4) return 'cash4';

  const v = gameRaw.trim().toLowerCase();

  if (
    v.includes('cash 3') ||
    v.includes('pick 3') ||
    v.includes('daily 3') ||
    v.includes('play 3') ||
    v.includes('numbers') ||
    v.includes('pega 3') ||
    v.includes('dc-3')
  ) {
    return 'cash3';
  }

  if (
    v.includes('cash 4') ||
    v.includes('pick 4') ||
    v.includes('daily 4') ||
    v.includes('play 4') ||
    v.includes('win 4') ||
    v.includes('numbers game') ||
    v.includes('pega 4') ||
    v.includes('dc-4')
  ) {
    return 'cash4';
  }

  return null;
}

function parseDrawTime(value: string): DrawTime {
  const v = value.trim().toLowerCase();

  if (v.includes('night')) return 'night';
  if (v.includes('evening')) return 'evening';

  if (
    v.includes('midday') ||
    v.includes('daytime') ||
    /\bday\b/.test(v) ||
    v.includes('morning') ||
    /\b\d{1,2}:\d{2}\s*(am|pm)\b/i.test(value) ||
    /\b\d{1,2}(am|pm)\b/i.test(value)
  ) {
    return 'midday';
  }

  return 'unknown';
}

function isHeaderRow(parts: string[]): boolean {
  if (parts.length < 3) return false;

  return (
    parts[0].trim().toLowerCase() === 'game' &&
    parts[1].trim().toLowerCase() === 'draw date' &&
    parts[2].trim().toLowerCase() === 'results'
  );
}

function splitLineIntoCells(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map(p => p.trim()).filter(Boolean);
  }

  const datePattern =
    /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/;

  const match = line.match(datePattern);
  if (match && match.index !== undefined) {
    const dateText = match[1];
    const before = line.slice(0, match.index).trim();
    const after = line.slice(match.index + dateText.length).trim();

    if (before && after) {
      return [before, dateText, after];
    }
  }

  if (line.includes(',')) {
    return line.split(',').map(p => p.trim()).filter(Boolean);
  }

  return [line.trim()];
}

function parsePasteInput(raw: string): PreviewRow[] {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const rows: PreviewRow[] = [];
  let currentState = '';

  for (const line of lines) {
    const parts = splitLineIntoCells(line).filter(Boolean);

    if (!parts.length) continue;
    if (isHeaderRow(parts)) continue;

    // State-only row like "Georgia"
    if (parts.length === 1) {
      currentState = parts[0];
      continue;
    }

    // Old format support:
    // state,date,gameType,drawTime,result
    if (parts.length >= 5) {
      const [state, date, gameRaw, drawTimeRaw, resultRaw] = parts;

      const { rawResult, normalizedResult, bonusText } = extractPrimaryResult(resultRaw);
      const gameType = inferGameType(gameRaw, normalizedResult);
      if (!gameType) continue;

      if (
        (gameType === 'cash3' && normalizedResult.length !== 3) ||
        (gameType === 'cash4' && normalizedResult.length !== 4)
      ) {
        continue;
      }

      rows.push({
        state,
        date: normalizeDate(date),
        gameType,
        drawTime: parseDrawTime(drawTimeRaw),
        rawResult,
        normalizedResult,
        sourceType: 'paste',
        gameLabel: gameRaw,
        bonusText,
      });

      currentState = state;
      continue;
    }

    // New format support:
    // State on one line, then Game / Draw Date / Results below it
    if (parts.length === 3 && currentState) {
      const [gameRaw, date, resultRaw] = parts;

      const { rawResult, normalizedResult, bonusText } = extractPrimaryResult(resultRaw);
      const gameType = inferGameType(gameRaw, normalizedResult);
      if (!gameType) continue;

      if (
        (gameType === 'cash3' && normalizedResult.length !== 3) ||
        (gameType === 'cash4' && normalizedResult.length !== 4)
      ) {
        continue;
      }

      rows.push({
        state: currentState,
        date: normalizeDate(date),
        gameType,
        drawTime: parseDrawTime(gameRaw),
        rawResult,
        normalizedResult,
        sourceType: 'paste',
        gameLabel: gameRaw,
        bonusText,
      });

      continue;
    }
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
      setError(
        'No valid rows were found to import. Paste a state on one line, then Game / Draw Date / Results on the following line(s).'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await bulkCreateLotteryResults(
        user.uid,
        previewRows.map(({ gameLabel, bonusText, ...row }) => row)
      );

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
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Results Import</h1>
            <p>
              Paste results in either format:
              <br />
              <strong>1)</strong> state,date,gameType,drawTime,result
              <br />
              <strong>2)</strong> State on one line, then Game / Draw Date / Results on the next line(s)
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
            rows={16}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              'Game\tDraw Date\tResults\nGeorgia\nCash 3 Midday\tTue, Apr 7, 2026\t9-0-2\nFlorida\nPick 4 Midday\tTue, Apr 7, 2026\t8-7-2-5, Fireball: 9'
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
                    {row.bonusText ? (
                      <div><strong>Bonus:</strong> {row.bonusText}</div>
                    ) : null}
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
