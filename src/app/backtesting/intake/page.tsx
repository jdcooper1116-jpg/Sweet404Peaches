'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BacktestingIntakePage() {
  const [dreamDate, setDreamDate] = useState('');
  const [dreamSource, setDreamSource] = useState('handwritten-journal');
  const [confidence, setConfidence] = useState('high');
  const [dreamText, setDreamText] = useState('');
  const [notes, setNotes] = useState('');

  const windowStart = dreamDate || '—';
  const windowEnd = useMemo(() => (dreamDate ? addDays(dreamDate, 6) : '—'), [dreamDate]);

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
                This page is where you load old timestamped dreams into Research Mode.
                The shell previews the backtest window and data fields we will persist next.
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

          <div style={{ marginTop: '16px' }}>
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
            <div className="journal-label">Next Step</div>
            <div style={{ fontWeight: 700 }}>Parse + Generate Watch Window</div>
          </div>
        </section>

        <section className="journal-card-flat">
          <strong>Shell Note</strong>
          <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
            In the next build, this page will save historical dreams into a dedicated backtest
            collection, parse the terms and numbers, and automatically generate a 7-day
            research window.
          </p>
        </section>
      </section>
    </main>
  );
}
