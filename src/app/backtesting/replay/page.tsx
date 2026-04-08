'use client';

import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';

const replayChecks = [
  'Load the historical dream and its parsed terms',
  'Load the 7-day historical result window',
  'Compare watch numbers against all uploaded results',
  'Detect straight hits and boxed hits',
  'Calculate days-from-dream and first-hit timing',
  'Build the dream replay timeline',
  'Write evidence into the Universal and Personal dictionaries',
];

export default function BacktestingReplayPage() {
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
                This is where the historical dream and its 7-day results window will be
                replayed to measure exactly how the dream would have performed.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/results" className="btn-secondary">
                Historical Results Intake
              </Link>
              <Link href="/backtesting/evidence" className="btn-secondary">
                Evidence Rules
              </Link>
            </div>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Replay Workflow</h1>
            <p>The replay engine will eventually follow this checklist automatically.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              marginTop: '12px',
            }}
          >
            {replayChecks.map((item, index) => (
              <div key={item} className="journal-card-flat">
                <strong>Step {index + 1}</strong>
                <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>{item}</p>
              </div>
            ))}
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
            <div className="journal-label">Historical Outcome Summary</div>
            <div style={{ fontWeight: 700 }}>Coming Next</div>
          </div>

          <div>
            <div className="journal-label">Replay Timeline</div>
            <div style={{ fontWeight: 700 }}>Coming Next</div>
          </div>

          <div>
            <div className="journal-label">State-Specific Hits</div>
            <div style={{ fontWeight: 700 }}>Coming Next</div>
          </div>

          <div>
            <div className="journal-label">Evidence Promotion</div>
            <div style={{ fontWeight: 700 }}>Coming Next</div>
          </div>
        </section>

        <section className="journal-card-flat">
          <strong>Shell Note</strong>
          <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
            The next build will connect this Replay Lab to real backtest dream records and
            historical results so each dream produces a true replay timeline, hit summary,
            and evidence promotion flow.
          </p>
        </section>
      </section>
    </main>
  );
}
