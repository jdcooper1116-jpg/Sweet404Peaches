'use client';

import Link from 'next/link';

// Static workflow launcher — no data fetching needed.
// Heavy data lives in the individual sub-pages (intake, replay, archive, evidence).

const CARDS = [
  {
    href:    '/backtesting/intake',
    icon:    '📖',
    title:   'Historical Dream Intake',
    desc:    'Add historical dream records with dreamer identity, mapped terms, and number candidates. Runs a full engine replay across all states automatically.',
    badge:   'Step 1',
  },
  {
    href:    '/backtesting/replay',
    icon:    '⚡',
    title:   'Replay Lab',
    desc:    'Select a saved historical dream and re-run it through the Lottery Engine. Confirms hits and saves dreamer-scoped evidence.',
    badge:   'Step 2',
  },
  {
    href:    '/backtesting/archive',
    icon:    '🗂',
    title:   'Archive',
    desc:    'Review all saved historical dream test records, their replay status, hit counts, and dreamer attribution.',
    badge:   'Review',
  },
  {
    href:    '/backtesting/evidence',
    icon:    '🔍',
    title:   'Evidence Tracker',
    desc:    'Inspect confirmed evidence patterns across historical replays. Identify strong terms, states, and number families.',
    badge:   'Analytics',
  },
];

export default function BacktestingPortalPage() {
  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.5rem,3vw,2.1rem)', fontWeight:900,
              letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#ffffff' }}>
              Backtesting &amp; Replay
            </h1>
            <p style={{ margin:'8px 0 0', color:'rgba(255,255,255,0.55)', fontSize:'14px', lineHeight:1.65, maxWidth:'600px' }}>
              Replay historical dreams through the Lottery Engine and preserve dreamer-specific evidence.
            </p>
          </div>
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            <Link href="/daily-ops"       className="btn-secondary" style={{ fontSize:'12px' }}>Daily Ops</Link>
            <Link href="/universal-scope" className="btn-secondary" style={{ fontSize:'12px' }}>Universal Scope</Link>
            <Link href="/fell-before"     className="btn-secondary" style={{ fontSize:'12px' }}>As They Fell Before</Link>
          </div>
        </div>
      </section>

      {/* How backtesting evidence flows */}
      <section style={{ padding:'16px 20px', borderRadius:'16px',
        border:'1px solid rgba(160,144,255,0.22)', background:'rgba(160,144,255,0.07)' }}>
        <div style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
          <span style={{ fontSize:'20px', lineHeight:1 }}>💡</span>
          <div>
            <strong style={{ color:'#a090ff', fontFamily:'system-ui,sans-serif', fontSize:'13px' }}>
              How backtesting evidence feeds the system
            </strong>
            <p style={{ margin:'6px 0 0', fontSize:'13px', color:'rgba(255,255,255,0.60)', lineHeight:1.7 }}>
              Backtesting evidence feeds both the <strong style={{ color:'#fff' }}>Universal Dream Dictionary</strong> (every mapped term-number pair)
              and each dreamer&apos;s <strong style={{ color:'#fff' }}>As They Fell Before memory</strong> (confirmed hits scoped to the correct dreamer).
              This strengthens State Playlists, Hot Families, Universal Scope, Forecast Board, and Chat recommendations.
            </p>
          </div>
        </div>
      </section>

      {/* Workflow cards */}
      <section style={{ display:'grid', gap:'14px', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))' }}>
        {CARDS.map(card => (
          <Link key={card.href} href={card.href} style={{ textDecoration:'none' }}>
            <div style={{ padding:'22px 20px', borderRadius:'20px',
              background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.11)',
              cursor:'pointer', height:'100%', display:'grid', gap:'10px',
              transition:'border-color 0.15s', gridTemplateRows:'auto auto 1fr auto' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(160,144,255,0.35)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.11)')}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <span style={{ fontSize:'28px', lineHeight:1 }}>{card.icon}</span>
                <span style={{ padding:'3px 10px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                  background:'rgba(160,144,255,0.14)', border:'1px solid rgba(160,144,255,0.28)',
                  color:'#a090ff', fontFamily:'system-ui,sans-serif', letterSpacing:'0.05em' }}>
                  {card.badge}
                </span>
              </div>
              <h2 style={{ margin:0, fontSize:'15px', fontWeight:800, color:'#ffffff',
                fontFamily:'system-ui,sans-serif', letterSpacing:'-0.02em' }}>
                {card.title}
              </h2>
              <p style={{ margin:0, fontSize:'13px', color:'rgba(255,255,255,0.50)', lineHeight:1.65 }}>
                {card.desc}
              </p>
              <div style={{ fontSize:'12px', color:'#a090ff', fontWeight:600, marginTop:'4px' }}>
                Go to {card.title} →
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Quick status note */}
      <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7 }}>
        <strong style={{ color:'rgba(255,255,255,0.60)' }}>Dreamer scope:</strong> Each historical dream is saved with a selected dreamer.
        Engine replay evidence is credited to that dreamer — not globally to owner-self.
        Re-running the same replay is safe: the system prevents double-counting via idempotency keys.
      </section>

    </div>
  );
}
