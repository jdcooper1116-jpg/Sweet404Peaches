// @ts-nocheck
'use client';

import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import PageIntro from '@/components/ui/PageIntro';

const cards = [
  {
    href: '/backtesting/intake',
    title: 'Historical Dream Intake',
    description:
      'Capture an old dream, assign the correct dream date, and prepare the 7-day research window.',
  },
  {
    href: '/backtesting/results',
    title: 'Historical Results Intake',
    description:
      'Load the state results tied to the selected dream window so the replay engine can evaluate them.',
  },
  {
    href: '/backtesting/replay',
    title: 'Replay Lab',
    description:
      'Run the backtest and evaluate how the dream performed across hits, states, timing, and patterns.',
  },
  {
    href: '/backtesting/archive',
    title: 'Backtest Archive',
    description:
      'Browse completed historical dreams, monitor research status, and inspect strongest results.',
  },
  {
    href: '/backtesting/evidence',
    title: 'Evidence Rules',
    description:
      'See weighted evidence scoring, promotion candidates, and how backtesting strengthens live intelligence.',
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
        <PageIntro
          title="Backtesting Portal"
          description="Historical replay, evidence tracking, and research workflows that teach the live system what to strengthen."
          actions={[
            { href: '/forecast-board', label: 'Forecast Board' },
            { href: '/chat', label: 'Intelligence Chat' },
          ]}
        />

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
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'grid',
                gap: '10px',
              }}
            >
              <h2 style={{ margin: 0 }}>{card.title}</h2>
              <p style={{ margin: 0, color: 'var(--ink-light)', lineHeight: 1.6 }}>
                {card.description}
              </p>
            </Link>
          ))}
        </section>
      </section>
    </main>
  );
}
