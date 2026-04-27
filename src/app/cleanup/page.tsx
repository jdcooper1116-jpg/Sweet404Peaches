'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function CleanupPage() {
  const { user } = useAuth();
  const [scope,    setScope]    = useState<'live'|'research'|'hard'>('live');
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const SCOPE_DESC: Record<string, { label: string; removes: string; preserves: string }> = {
    live:     { label: 'Reset Live Ops',     removes: 'activeDreamWindows · dreamHits · dreamHitPromotions', preserves: 'personalHitMappings · termNumberMappings · backtestDreams · backtestHits' },
    research: { label: 'Reset Research',     removes: 'backtestHits · backtestSummaries · personalHitEvents', preserves: 'personalHitMappings · termNumberMappings · activeDreamWindows · dreamHits' },
    hard:     { label: 'Hard Reset (Both)',  removes: 'activeDreamWindows · dreamHits · dreamHitPromotions · backtestHits · backtestSummaries · personalHitEvents', preserves: 'personalHitMappings · termNumberMappings (dictionaries always preserved)' },
  };

  async function handleReset() {
    if (!user || !confirmed) return;
    setRunning(true); setResult(null); setError('');
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid, scope, confirm: `CONFIRM_${scope.toUpperCase()}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Reset failed.');
      setResult(data);
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally { setRunning(false); }
  }

  const desc = SCOPE_DESC[scope];

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background: 'radial-gradient(circle at top left,rgba(228,192,123,0.14),transparent 18%),radial-gradient(circle at top right,rgba(108,120,255,0.12),transparent 22%),linear-gradient(135deg,#1A1A2E 0%,#16213E 48%,#0F3460 100%)',
    }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px', alignContent: 'start' }}>

        <section className="journal-card">
          <div style={{ display:'flex',justifyContent:'space-between',gap:'16px',alignItems:'flex-start',flexWrap:'wrap' }}>
            <div className="page-header">
              <h1>Cleanup Tools</h1>
              <p>Safe reset operations for operational data. Dictionaries (personalHitMappings, termNumberMappings) are <strong>always preserved</strong>.</p>
            </div>
            <Link href="/integrity" className="btn-secondary">Integrity Console</Link>
          </div>
        </section>

        {/* Scope selector */}
        <section className="journal-card">
          <div style={{ display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',color:'var(--deep-plum)' }}>
            <Trash2 size={18} /><strong>Select Reset Scope</strong>
          </div>

          <div style={{ display:'grid',gap:'10px' }}>
            {(['live','research','hard'] as const).map(s => (
              <label key={s} style={{ display:'flex',gap:'12px',alignItems:'flex-start',cursor:'pointer',padding:'12px',borderRadius:'14px',
                border: scope===s ? '1px solid rgba(108,120,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
                background: scope===s ? 'rgba(108,120,255,0.08)' : 'transparent' }}>
                <input type="radio" value={s} checked={scope===s} onChange={() => { setScope(s); setConfirmed(false); setResult(null); }}
                  style={{ marginTop:'3px' }} />
                <div>
                  <strong style={{ fontSize:'14px' }}>{SCOPE_DESC[s].label}</strong>
                  <div style={{ fontSize:'12px',color:'rgba(255,0,0,0.8)',marginTop:'4px' }}>
                    Removes: {SCOPE_DESC[s].removes}
                  </div>
                  <div style={{ fontSize:'12px',color:'#6dbf8a',marginTop:'3px' }}>
                    Preserves: {SCOPE_DESC[s].preserves}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Confirmation */}
        <section className="journal-card" style={{ borderColor: scope==='hard' ? 'rgba(248,113,113,0.3)' : undefined }}>
          <strong style={{ color: scope==='hard' ? '#f87171' : 'var(--ink)' }}>
            {scope==='hard' ? '⚠ Hard Reset — Confirm Before Proceeding' : `Confirm ${desc.label}`}
          </strong>
          <p style={{ margin:'8px 0 12px',fontSize:'13px',color:'var(--ink-light)',lineHeight:1.6 }}>
            This will <strong>permanently delete</strong>:<br />
            {desc.removes}
            <br /><br />
            <span style={{ color:'#6dbf8a' }}>Preserved: {desc.preserves}</span>
          </p>
          <label style={{ display:'flex',gap:'10px',alignItems:'center',cursor:'pointer',fontSize:'13px' }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            I understand this is permanent for ownerUid: {user?.uid?.slice(0, 12)}…
          </label>
          <div style={{ marginTop:'14px' }}>
            <button type="button"
              className={scope==='hard' ? 'btn-primary' : 'btn-secondary'}
              style={{ background: confirmed && scope==='hard' ? 'rgba(248,113,113,0.2)' : undefined }}
              disabled={!confirmed || running || !user}
              onClick={handleReset}>
              {running ? 'Resetting…' : desc.label}
            </button>
          </div>

          {error  && <div className="journal-card-flat" style={{ marginTop:'12px',borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{error}</div>}
          {result && (
            <div className="journal-card-flat" style={{ marginTop:'12px',borderColor:'#cfe5c8',background:'#f5fbf2',color:'#315a2b' }}>
              <strong>Reset complete.</strong>
              <pre style={{ marginTop:'8px',fontSize:'12px',whiteSpace:'pre-wrap' }}>{JSON.stringify(result.results, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Info */}
        <section className="journal-card-flat" style={{ fontSize:'13px',color:'var(--ink-light)',lineHeight:1.6 }}>
          <strong style={{ color:'var(--ink)' }}>When to use Cleanup Tools:</strong><br />
          Use <em>Reset Live Ops</em> after testing or when you want to start fresh with new current dream entries.<br />
          Use <em>Reset Research</em> to clear historical backtest hit data without affecting live operations.<br />
          Use <em>Hard Reset</em> only when you want a complete clean slate for operational data before a fresh start.
        </section>

      </section>
    </main>
  );
}
