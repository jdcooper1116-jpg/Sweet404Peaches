'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function ResultsRescanPage() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<any>(null);
  const [error,   setError]   = useState('');

  async function handleRefresh() {
    if (!user) { setError('You must be signed in.'); return; }
    setRunning(true); setResult(null); setError('');
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed.');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally { setRunning(false); }
  }

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div className="page-header">
            <h1>Dream Re-Refresh</h1>
            <p>Re-check all active dream windows against the latest Lottery Engine results and write any new confirmed hits. The engine is the source of truth — no local result scanning.</p>
          </div>
        </section>

        <section className="journal-card" style={{ display:'grid',gap:'14px' }}>
          <p style={{ margin:0,color:'var(--ink-light)',fontSize:'14px',lineHeight:1.6 }}>
            This triggers <strong>/api/dreams/refresh</strong> — it loads all active windows, calls the Railway Lottery Engine for each candidate set, and writes any new hits to Firestore. It is safe to run repeatedly (idempotent).
          </p>
          <div>
            <button type="button" className="btn-primary"
              onClick={handleRefresh} disabled={running || !user}>
              {running ? 'Refreshing all windows…' : '⚡ Re-Refresh Dream Windows Now'}
            </button>
          </div>

          {error && <div className="journal-card-flat" style={{ borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{error}</div>}

          {result && (
            <div className="journal-card-flat" style={{ borderColor:'#cfe5c8',background:'#f5fbf2',color:'#315a2b' }}>
              <strong>Refresh complete.</strong>
              <div style={{ display:'grid',gap:'6px',marginTop:'10px',fontSize:'13px' }}>
                {[
                  ['Windows Checked',    result.windowsChecked   ?? 0],
                  ['Windows With Hits',  result.windowsWithNewHits ?? 0],
                  ['New Hits Found',     result.totalNewHits      ?? 0],
                  ['Engine Calls Made',  result.engineCallsMade   ?? 0],
                  ['Errors',             result.errors?.length    ?? 0],
                ].map(([label, val]) => (
                  <div key={String(label)} style={{ display:'flex',justifyContent:'space-between' }}>
                    <span>{label}</span><strong>{val}</strong>
                  </div>
                ))}
                {result.checkedAt && <div style={{ marginTop:'4px',opacity:0.6 }}>Checked at: {String(result.checkedAt).slice(0,16).replace('T',' ')} UTC</div>}
              </div>
            </div>
          )}
        </section>

        <section className="journal-card-flat" style={{ display:'flex',gap:'10px',flexWrap:'wrap' }}>
          {[
            { href:'/windows',    label:'Active Windows' },
            { href:'/hits',       label:'Hits Detector'  },
            { href:'/daily-ops',  label:'Daily Ops'      },
            { href:'/fell-before',label:'As They Fell Before' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="btn-secondary" style={{ fontSize:'13px' }}>{label}</Link>
          ))}
        </section>
    </div>
  );
}
