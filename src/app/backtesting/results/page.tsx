'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';

function buildDayList(startDate: string) {
  if (!startDate) return [];
  const base = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];

  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export default function BacktestingResultsPage() {
  const [windowStart, setWindowStart] = useState('');
  const [resultsPaste, setResultsPaste] = useState('');

  const dayList = useMemo(() => buildDayList(windowStart), [windowStart]);

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
              <h1>Historical Results Intake</h1>
              <p>
                This page is where you load the all-state Pick 3 / Pick 4 results for the
                historical 7-day backtest window.
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
            <label className="journal-label" htmlFor="windowStart">
              Backtest Window Start
            </label>
            <input
              id="windowStart"
              type="date"
              className="journal-input"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
          </div>

          <div className="journal-card-flat">
            <div className="journal-label">Window Days</div>
            <div style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
              {dayList.length ? dayList.join(' • ') : 'Choose a start date to preview the 7-day replay window.'}
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
        </section>

        <section className="journal-card-flat">
          <strong>Shell Note</strong>
          <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
            In the next build, this page will store results specifically under the linked
            backtest dream window, then pass those results into the Replay Lab so the app can
            simulate how the dream would have performed historically.
          </p>
        </section>
      </section>
    </main>
  );
}
