'use client';
import Link from 'next/link';
import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function CleanupPage() {
  const { user } = useAuth();
  const [scope,    setScope]    = useState<'live'|'research'|'hard'>('live');
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Factory reset state — separate section, extra safeguards
  const [factoryChecked,  setFactoryChecked]  = useState(false);
  const [factoryPhrase,   setFactoryPhrase]   = useState('');
  const [factoryRunning,  setFactoryRunning]  = useState(false);
  const [factoryResult,   setFactoryResult]   = useState<any>(null);
  const [factoryError,    setFactoryError]    = useState('');
  const FACTORY_PHRASE = 'DELETE EVERYTHING';
  const factoryReady = factoryChecked && factoryPhrase.trim() === FACTORY_PHRASE;

  async function handleFactoryReset() {
    if (!user || !factoryReady) return;
    const ok = window.confirm('FINAL CONFIRMATION: This will permanently delete all dreams, dreamers, dictionary entries, and evidence for this account. This cannot be undone. Proceed?');
    if (!ok) return;
    setFactoryRunning(true); setFactoryResult(null); setFactoryError('');
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid, scope: 'factory', confirm: FACTORY_PHRASE }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setFactoryError(data.error ?? 'Factory reset failed.'); return; }
      setFactoryResult(data);
      setFactoryChecked(false);
      setFactoryPhrase('');
    } catch (err) { setFactoryError(err instanceof Error ? err.message : 'Factory reset failed.'); }
    finally { setFactoryRunning(false); }
  }

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
    <div className="page-shell" style={{ padding: 'clamp(18px,3vw,32px)', display: 'grid', gap: '24px', alignContent: 'start' }}>

        <section className="journal-card">
          <div style={{ display:'flex',justifyContent:'space-between',gap:'16px',alignItems:'flex-start',flexWrap:'wrap' }}>
            <div>
              <h1>Cleanup Tools</h1>
              <p>Safe reset operations for operational data. Dictionaries (personalHitMappings, termNumberMappings) are <strong>always preserved</strong>.</p>
            </div>
            <Link href="/integrity" className="btn-secondary">Integrity Console</Link>
          </div>
        </section>

        {/* Scope selector */}
        <section className="journal-card">
          <div style={{ display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px',color:'rgba(160,144,255,0.9)' }}>
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
                  <div style={{ fontSize:'12px',color:'#60e09a',marginTop:'3px' }}>
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
          <p style={{ margin:'8px 0 12px',fontSize:'13px',color:'rgba(255,255,255,0.55)',lineHeight:1.6 }}>
            This will <strong>permanently delete</strong>:<br />
            {desc.removes}
            <br /><br />
            <span style={{ color:'#60e09a' }}>Preserved: {desc.preserves}</span>
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

          {error  && <div className="journal-card-flat" style={{ marginTop:'12px',borderColor:'rgba(255,85,85,0.28)',background:'rgba(255,85,85,0.10)',color:'#ff9090' }}>{error}</div>}
          {result && (
            <div className="journal-card-flat" style={{ marginTop:'12px',borderColor:'rgba(96,224,154,0.28)',background:'rgba(96,224,154,0.08)',color:'#60e09a' }}>
              <strong>Reset complete.</strong>
              <pre style={{ marginTop:'8px',fontSize:'12px',whiteSpace:'pre-wrap' }}>{JSON.stringify(result.results, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Info */}
        <section className="journal-card-flat" style={{ fontSize:'13px',color:'rgba(255,255,255,0.55)',lineHeight:1.6 }}>
          <strong style={{ color:'#fff' }}>When to use Cleanup Tools:</strong><br />
          Use <em>Reset Live Ops</em> after testing or when you want to start fresh with new current dream entries.<br />
          Use <em>Reset Research</em> to clear historical backtest hit data without affecting live operations.<br />
          Use <em>Hard Reset</em> only when you want a complete clean slate for operational data before a fresh start.
        </section>


        {/* ── FACTORY RESET — separate dangerous section ── */}
        <section style={{ padding:'0', display:'grid', gap:'0' }}>
          <div style={{ padding:'2px 0 12px', display:'flex', gap:'10px', alignItems:'center' }}>
            <AlertTriangle size={16} color="#ff9090" />
            <span style={{ fontSize:'12px', fontWeight:700, color:'#ff9090', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'system-ui,sans-serif' }}>
              Danger Zone — Factory Reset
            </span>
          </div>

          <div style={{ padding:'20px', borderRadius:'18px', border:'2px solid rgba(255,85,85,0.30)', background:'rgba(255,85,85,0.06)' }}>
            <h2 style={{ margin:'0 0 10px', fontSize:'1.05rem', fontWeight:900, color:'#ff9090', fontFamily:'system-ui,sans-serif' }}>
              Factory Reset Everything
            </h2>
            <p style={{ margin:'0 0 16px', fontSize:'13px', color:'rgba(255,255,255,0.70)', lineHeight:1.7 }}>
              This <strong style={{ color:'#ff9090' }}>permanently deletes</strong> all dreams, dreamers, active windows,
              hits, backtests, pinned plays, Universal Dictionary entries, and As They Fell Before memory for this owner.
              <strong style={{ color:'#ff9090' }}> This cannot be undone.</strong>
            </p>

            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', marginBottom:'16px', background:'rgba(255,255,255,0.05)', padding:'12px 14px', borderRadius:'10px', lineHeight:1.8 }}>
              <div style={{ marginBottom:'4px', fontWeight:700, color:'rgba(255,85,85,0.80)' }}>Will permanently delete:</div>
              {['dreamEntries','activeDreamWindows','dreamHits','dreamHitPromotions','personalHitEvents',
                'personalHitMappings','termNumberMappings','backtestDreams','backtestHits','backtestSummaries',
                'pinnedPlays','dreamers'].map(c => (
                <div key={c} style={{ fontFamily:'monospace', fontSize:'11px' }}>· {c}</div>
              ))}
              <div style={{ marginTop:'8px', color:'#60e09a', fontWeight:700 }}>✓ Preserved: ownerProfiles (login/auth)</div>
            </div>

            <label style={{ display:'flex', gap:'10px', alignItems:'center', cursor:'pointer', fontSize:'13px', color:'rgba(255,255,255,0.80)', marginBottom:'14px' }}>
              <input type="checkbox" checked={factoryChecked} onChange={e => setFactoryChecked(e.target.checked)} />
              I understand this permanently deletes all app data and cannot be undone.
            </label>

            <div style={{ marginBottom:'16px' }}>
              <label style={{ display:'block', fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.50)', textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:'6px', fontFamily:'system-ui,sans-serif' }}>
                Type <strong style={{ color:'#ff9090' }}>DELETE EVERYTHING</strong> to enable the button:
              </label>
              <input
                type="text"
                className="journal-input"
                value={factoryPhrase}
                onChange={e => setFactoryPhrase(e.target.value)}
                placeholder="DELETE EVERYTHING"
                style={{ fontFamily:'monospace', letterSpacing:'0.05em' }}
              />
            </div>

            <button
              type="button"
              disabled={!factoryReady || factoryRunning || !user}
              onClick={handleFactoryReset}
              style={{
                padding:'11px 20px', borderRadius:'12px', fontSize:'13px', fontWeight:700,
                fontFamily:'system-ui,sans-serif', cursor: factoryReady ? 'pointer' : 'not-allowed',
                background: factoryReady ? 'rgba(255,85,85,0.20)' : 'rgba(255,255,255,0.05)',
                border:`1px solid ${factoryReady ? 'rgba(255,85,85,0.45)' : 'rgba(255,255,255,0.10)'}`,
                color: factoryReady ? '#ff9090' : 'rgba(255,255,255,0.30)',
                opacity: factoryRunning ? 0.7 : 1,
              }}>
              {factoryRunning ? '⏳ Factory resetting…' : '🗑 Factory Reset Everything'}
            </button>

            {factoryError && (
              <div style={{ marginTop:'12px', padding:'10px 14px', borderRadius:'12px', background:'rgba(255,85,85,0.10)', border:'1px solid rgba(255,85,85,0.28)', color:'#ff9090', fontSize:'13px' }}>
                ✗ {factoryError}
              </div>
            )}

            {factoryResult && (
              <div style={{ marginTop:'12px', padding:'14px 16px', borderRadius:'12px', background:'rgba(96,224,154,0.08)', border:'1px solid rgba(96,224,154,0.24)', color:'#60e09a', fontSize:'13px' }}>
                <strong>✓ Factory reset complete.</strong>
                <div style={{ marginTop:'8px', display:'grid', gap:'3px' }}>
                  {Object.entries(factoryResult.results ?? {}).map(([k, v]) => (
                    <div key={k} style={{ fontFamily:'monospace', fontSize:'12px', color:'rgba(255,255,255,0.65)' }}>
                      {k}: <span style={{ color:'#60e09a' }}>{String(v)} deleted</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

    </div>
  );
}
