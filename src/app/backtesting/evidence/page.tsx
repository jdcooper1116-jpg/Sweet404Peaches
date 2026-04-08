'use client';

import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';

export default function BacktestingEvidencePage() {
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
              <h1>Evidence Rules</h1>
              <p>
                These rules define how historical backtesting should strengthen the dictionaries
                and improve the prediction model without confusing research with live prediction.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting" className="btn-secondary">
                Backtesting Portal
              </Link>
              <Link href="/fell-before" className="btn-secondary">
                As They Fell Before
              </Link>
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          <section className="journal-card">
            <h2 style={{ marginTop: 0 }}>Universal Dream Dictionary</h2>
            <p style={{ color: 'var(--ink-light)', lineHeight: 1.7 }}>
              Every parsed historical dream should strengthen the Universal Dream Dictionary.
              This means term-to-number relationships can accumulate evidence even before a hit
              is confirmed.
            </p>

            <div className="journal-card-flat">
              <strong>Evidence Sources</strong>
              <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                Parsed terms, parsed numbers, dream date, and research source metadata.
              </p>
            </div>
          </section>

          <section className="journal-card">
            <h2 style={{ marginTop: 0 }}>Personal As They Fell Before Dictionary</h2>
            <p style={{ color: 'var(--ink-light)', lineHeight: 1.7 }}>
              Confirmed historical hits should strengthen the Personal Dictionary. This is the
              state-specific memory layer that tells you where numbers actually fell for a term.
            </p>

            <div className="journal-card-flat">
              <strong>Evidence Sources</strong>
              <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                Straight hits, boxed hits, state, draw, hit timing, and repeated state outcomes.
              </p>
            </div>
          </section>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Recommended Weighting Model</h1>
            <p>
              This is the evidence model we can wire into the backtesting engine next.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            <div className="journal-card-flat">
              <strong>Parsed Dream Evidence</strong>
              <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                Light-weight evidence for the Universal Dream Dictionary.
              </p>
            </div>

            <div className="journal-card-flat">
              <strong>Boxed Hit Evidence</strong>
              <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                Medium-weight evidence for both dictionary systems.
              </p>
            </div>

            <div className="journal-card-flat">
              <strong>Straight Hit Evidence</strong>
              <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                Strongest evidence for both dictionary systems and state confidence.
              </p>
            </div>

            <div className="journal-card-flat">
              <strong>Repeated State Hits</strong>
              <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                Highest value for state-specific playlists and future forecasting.
              </p>
            </div>
          </div>
        </section>

        <section className="journal-card-flat">
          <strong>Shell Note</strong>
          <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
            In the next build, these rules will become actual scoring and promotion logic used by
            the replay engine, the State Playlist, and the Forecast Board.
          </p>
        </section>
      </section>
    </main>
  );
}
