'use client';

import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';

const cards = [
  {
    href: '/backtesting/intake',
    title: 'Historical Dream Intake',
    description:
      'Paste or upload an old dream, assign the original dream date, and preview the 7-day research window.',
  },
  {
    href: '/backtesting/results',
    title: 'Historical Results Intake',
    description:
      'Load the all-state Pick 3 / Pick 4 results for the 7-day backtest window tied to a historical dream.',
  },
  {
    href: '/backtesting/replay',
    title: 'Replay Lab',
    description:
      'Run the backtest logic conceptually: dream terms, watch numbers, hits, timelines, and replay outcomes.',
  },
  {
    href: '/backtesting/evidence',
    title: 'Evidence Rules',
    description:
      'Define how parsed dreams strengthen the Universal Dictionary and how confirmed hits strengthen the Personal Dictionary.',
  },
];

export default function BacktestingPortalPage() {
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
              <h1>Backtesting Portal</h1>
              <p>
                This is the research lane of Sweet404Peaches. Use it to replay old
                timestamped dreams, test the next 7 days of results, and strengthen both
                the Universal Dream Dictionary and your Personal As They Fell Before
                Dictionary with evidence.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/forecast-board" className="btn-secondary">
                Forecast Board
              </Link>
              <Link href="/intelligence" className="btn-secondary">
                Intelligence Hub
              </Link>
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
            <div className="journal-label">Portal Goal</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Historical Replay</div>
          </div>

          <div>
            <div className="journal-label">Research Mode</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Separated from Live Mode</div>
          </div>

          <div>
            <div className="journal-label">Dictionary Targets</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>
              Universal + Personal
            </div>
          </div>

          <div>
            <div className="journal-label">Window Rule</div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Dream Date + 7 Days</div>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Backtesting Workflow</h1>
            <p>
              This shell is designed around your real research process.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '14px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              marginTop: '12px',
            }}
          >
            {[
              '1. Upload or paste a historical dream',
              '2. Assign the original dream date',
              '3. Parse terms, Cash 3, and Cash 4 numbers',
              '4. Generate the 7-day historical watch window',
              '5. Upload all-state results for the historical window',
              '6. Replay hits and timeline outcomes',
              '7. Promote evidence into the dictionaries',
            ].map((item) => (
              <div key={item} className="journal-card-flat">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="journal-card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: '10px' }}
            >
              <h2 style={{ margin: 0 }}>{card.title}</h2>
              <p style={{ margin: 0, color: 'var(--ink-light)', lineHeight: 1.6 }}>
                {card.description}
              </p>
            </Link>
          ))}
        </section>

        <section className="journal-card-flat">
          <strong>Research Philosophy</strong>
          <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
            Parsed historical dreams should strengthen the Universal Dream Dictionary.
            Confirmed historical hits should strengthen the Personal As They Fell Before
            Dictionary. Historical evidence should make the live system smarter without
            confusing research activity with live prediction activity.
          </p>
        </section>
      </section>
    </main>
  );
}
