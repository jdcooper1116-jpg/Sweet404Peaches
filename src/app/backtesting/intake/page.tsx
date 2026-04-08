'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookOpenText, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  createBacktestDreamIntake,
  listBacktestDreams,
  upsertOwnerProfile,
} from '@/lib/firebase/firestore';
import { parseDreamText } from '@/lib/parser/dreamParser';
import type { ParseResult } from '@/lib/types';

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BacktestingIntakePage() {
  const { user } = useAuth();

  const [dreamDate, setDreamDate] = useState('');
  const [dreamSource, setDreamSource] = useState('handwritten-journal');
  const [confidence, setConfidence] = useState('high');
  const [dreamText, setDreamText] = useState('');
  const [notes, setNotes] = useState('');

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recentBacktests, setRecentBacktests] = useState<any[]>([]);

  const windowStart = dreamDate || '—';
  const windowEnd = useMemo(() => (dreamDate ? addDays(dreamDate, 6) : '—'), [dreamDate]);

  useEffect(() => {
    async function loadRecent() {
      if (!user) {
        setRecentBacktests([]);
        setLoadingRecent(false);
        return;
      }

      try {
        const rows = await listBacktestDreams(user.uid);
        setRecentBacktests(rows);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingRecent(false);
      }
    }

    void loadRecent();
  }, [user]);

  function handleParseDream() {
    if (!dreamText.trim()) {
      setError('Please paste the historical dream text first.');
      setParseResult(null);
      return;
    }

    setError('');
    setMessage('');
    setParseResult(parseDreamText(dreamText));
  }

  async function handleSaveBacktestDream() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!dreamDate) {
      setError('Please choose the original dream date.');
      return;
    }

    if (!dreamText.trim()) {
      setError('Please paste the historical dream text.');
      return;
    }

    if (!parseResult) {
      setError('Please parse the dream before saving it.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await upsertOwnerProfile(user.uid, {
        displayName: user.displayName || 'Sweet404Peaches',
        email: user.email || '',
      });

      const backtestDreamId = await createBacktestDreamIntake(user.uid, {
        dreamDate,
        rawText: dreamText,
        source: dreamSource,
        confidence,
        notes,
        parseResult,
      });

      const refreshed = await listBacktestDreams(user.uid);
      setRecentBacktests(refreshed);

      setMessage(
        `Backtest dream saved. ID: ${backtestDreamId}. Parsed evidence was added to the Universal Dream Dictionary and a 7-day research window was created.`
      );

      setDreamText('');
      setNotes('');
      setParseResult(null);
    } catch (err) {
      console.error(err);
      setError('Could not save the historical dream intake.');
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
              <h1>Historical Dream Intake</h1>
              <p>
                Paste an old dream, parse it, and save it into Research Mode with a true 7-day backtest window.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting" className="btn-secondary">
                Backtesting Portal
              </Link>
              <Link href="/backtesting/results" className="btn-secondary">
                Historical Results Intake
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
            <label className="journal-label" htmlFor="dreamDate">
              Original Dream Date
            </label>
            <input
              id="dreamDate"
              type="date"
              className="journal-input"
              value={dreamDate}
              onChange={(e) => setDreamDate(e.target.value)}
            />
          </div>

          <div>
            <label className="journal-label" htmlFor="dreamSource">
              Source
            </label>
            <select
              id="dreamSource"
              className="journal-select"
              value={dreamSource}
              onChange={(e) => setDreamSource(e.target.value)}
            >
              <option value="handwritten-journal">Handwritten Journal</option>
              <option value="notes-app">Notes App</option>
              <option value="text-message">Text Message</option>
              <option value="memory-reconstruction">Memory Reconstruction</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="journal-label" htmlFor="confidence">
              Transcription Confidence
            </label>
            <select
              id="confidence"
              className="journal-select"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </section>

        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '18px',
              color: 'var(--deep-plum)',
            }}
          >
            <BookOpenText size={20} />
            <strong>Historical Dream Intake</strong>
          </div>

          <div style={{ display: 'grid', gap: '18px' }}>
            <div>
              <label className="journal-label" htmlFor="dreamText">
                Historical Dream Text
              </label>
              <textarea
                id="dreamText"
                className="journal-textarea"
                rows={16}
                value={dreamText}
                onChange={(e) => setDreamText(e.target.value)}
                placeholder="Paste the historical dream exactly as recorded..."
              />
            </div>

            <div>
              <label className="journal-label" htmlFor="notes">
                Research Notes
              </label>
              <textarea
                id="notes"
                className="journal-textarea"
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this dream, context, confidence, or why it matters..."
              />
            </div>

            {message ? (
              <div
                className="journal-card-flat"
                style={{
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
                  borderColor: '#e9c2c2',
                  background: '#fff4f4',
                  color: '#8a2f2f',
                }}
              >
                {error}
              </div>
            ) : null}

            <div
              className="journal-card-flat"
              style={{
                display: 'grid',
                gap: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--deep-plum)',
                }}
              >
                <Sparkles size={16} />
                <strong>Research Evidence Flow</strong>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: 'var(--ink-light)',
                  lineHeight: 1.6,
                }}
              >
                Parsed historical dream evidence strengthens the Universal Dream Dictionary immediately.
                Confirmed hits will strengthen the Personal As They Fell Before Dictionary after replay.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleParseDream}
              >
                Parse Historical Dream
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveBacktestDream}
                disabled={saving}
              >
                {saving ? 'Saving...' : parseResult ? 'Save Parsed Backtest Dream' : 'Save Backtest Dream'}
              </button>
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
            <div className="journal-label">Backtest Window Start</div>
            <div style={{ fontWeight: 700 }}>{windowStart}</div>
          </div>

          <div>
            <div className="journal-label">Backtest Window End</div>
            <div style={{ fontWeight: 700 }}>{windowEnd}</div>
          </div>

          <div>
            <div className="journal-label">Mode</div>
            <div style={{ fontWeight: 700 }}>Research / Historical Replay</div>
          </div>

          <div>
            <div className="journal-label">Dictionary Effect</div>
            <div style={{ fontWeight: 700 }}>Universal Dictionary Strengthens</div>
          </div>
        </section>

        {parseResult ? (
          <section className="journal-card" style={{ display: 'grid', gap: '20px' }}>
            <div className="page-header">
              <h1>Parse Preview</h1>
              <p>These are the extracted terms and number candidates from your historical dream.</p>
            </div>

            <div
              style={{
                display: 'grid',
                gap: '16px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              }}
            >
              <div className="journal-card-flat">
                <strong>Cash 3</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                  {parseResult.cash3Numbers.length
                    ? parseResult.cash3Numbers.join(', ')
                    : 'No Cash 3 numbers found'}
                </p>
              </div>

              <div className="journal-card-flat">
                <strong>Cash 4</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                  {parseResult.cash4Numbers.length
                    ? parseResult.cash4Numbers.join(', ')
                    : 'No Cash 4 numbers found'}
                </p>
              </div>

              <div className="journal-card-flat">
                <strong>Archived / Symbolic Numbers</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                  {parseResult.archivedNumbers.length
                    ? parseResult.archivedNumbers.join(', ')
                    : 'None'}
                </p>
              </div>
            </div>

            <div className="journal-card-flat">
              <strong>Mapped Terms</strong>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '12px',
                }}
              >
                {parseResult.termMappings.length ? (
                  parseResult.termMappings.map((mapping) => (
                    <span
                      key={mapping.term}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '999px',
                        background: 'rgba(201,168,76,0.14)',
                        border: '1px solid rgba(201,168,76,0.35)',
                        color: 'var(--deep-plum)',
                        fontSize: '14px',
                      }}
                    >
                      {mapping.term}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--ink-light)' }}>
                    No mapped terms found
                  </span>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Recent Backtest Dreams</h1>
            <p>Your newest historical dream intakes appear here.</p>
          </div>

          {loadingRecent ? (
            <p>Loading recent backtests...</p>
          ) : recentBacktests.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {recentBacktests.map((item) => (
                <div key={item.id} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <div>
                      <div className="journal-label">Dream Date</div>
                      <div>{item.dreamDate || '—'}</div>
                    </div>
                    <div>
                      <div className="journal-label">Window</div>
                      <div>
                        {item.activeWindowStart || '—'} → {item.activeWindowEnd || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="journal-label">Source</div>
                      <div>{item.source || '—'}</div>
                    </div>
                    <div>
                      <div className="journal-label">Cash 3</div>
                      <div>{Array.isArray(item.cash3Numbers) ? item.cash3Numbers.length : 0}</div>
                    </div>
                    <div>
                      <div className="journal-label">Cash 4</div>
                      <div>{Array.isArray(item.cash4Numbers) ? item.cash4Numbers.length : 0}</div>
                    </div>
                    <div>
                      <div className="journal-label">Status</div>
                      <div>{item.status || '—'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No backtest dreams saved yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
