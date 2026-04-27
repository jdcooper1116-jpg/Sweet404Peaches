'use client';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';

export default function BacktestingResultsPage() {
  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background: 'radial-gradient(circle at top left,rgba(228,192,123,0.14),transparent 18%),radial-gradient(circle at top right,rgba(108,120,255,0.12),transparent 22%),linear-gradient(135deg,#1A1A2E 0%,#16213E 48%,#0F3460 100%)',
    }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px', alignContent: 'start' }}>
        <section className="journal-card">
          <div style={{ display:'inline-flex',alignItems:'center',gap:'8px',padding:'3px 10px',borderRadius:'8px',background:'rgba(156,163,175,0.12)',border:'1px solid rgba(156,163,175,0.2)',color:'#9ca3af',fontSize:'11px',fontWeight:700,marginBottom:'12px' }}>
            LEGACY
          </div>
          <div className="page-header">
            <h1>Historical Results Intake</h1>
            <p>Manual result paste-upload has been replaced by the Lottery Engine workflow. The Lottery Engine is now the source of truth for all draw results.</p>
          </div>
        </section>

        <section className="journal-card">
          <p style={{ color:'var(--ink-light)',lineHeight:1.7,margin:0 }}>
            This page previously allowed pasting historical lottery results manually. That workflow is deprecated.
          </p>
          <br />
          <p style={{ color:'var(--ink-light)',lineHeight:1.7,margin:0 }}>
            <strong style={{ color:'var(--ink)' }}>Use the engine-backed workflow instead:</strong>
          </p>
          <div style={{ display:'grid',gap:'10px',marginTop:'16px' }}>
            {[
              { href:'/backtesting/intake',  label:'Historical Dream Intake',  desc:'Parse and save a historical dream, then run the engine replay.' },
              { href:'/backtesting/replay',  label:'Replay Lab',               desc:'Load a saved dream and view or re-run engine-backed hits.' },
              { href:'/backtesting/archive', label:'Backtest Archive',          desc:'See all saved historical dreams with hit summaries.' },
              { href:'/results',             label:'Results Log',               desc:'Browse live draw results directly from the Railway engine.' },
              { href:'/integrity',           label:'Integrity Console',         desc:'Check system health and engine coverage.' },
            ].map(({ href, label, desc }) => (
              <Link key={href} href={href} className="journal-card-flat"
                style={{ textDecoration:'none',color:'inherit' }}>
                <strong style={{ fontSize:'14px' }}>{label}</strong>
                <div style={{ color:'var(--ink-light)',fontSize:'13px',marginTop:'4px' }}>{desc}</div>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
