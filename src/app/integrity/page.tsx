'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { buildIntegrityAudit } from '@/lib/intelligence/dataIntegrity';

export default function IntegrityPage() {
  const { user } = useAuth();

  const [activeWindows,  setActiveWindows]  = useState<any[]>([]);
  const [dreamHits,      setDreamHits]      = useState<any[]>([]);
  const [personalRows,   setPersonalRows]   = useState<any[]>([]);
  const [backtestDreams, setBacktestDreams] = useState<any[]>([]);
  const [engineStatus,   setEngineStatus]   = useState<any>(null);
  const [loading,        setLoading]        = useState(true);
  const [working,        setWorking]        = useState(false);
  const [error,          setError]          = useState('');
  const [message,        setMessage]        = useState('');

  async function loadAll() {
    if (!user) { setLoading(false); return; }
    setError('');
    try {
      const uid = encodeURIComponent(user.uid);
      const [winRes, hitRes, memRes, btRes, engRes] = await Promise.all([
        fetch(`/api/dreams/windows?ownerUid=${uid}`),
        fetch(`/api/dreams/hits?ownerUid=${uid}`),
        fetch(`/api/fell-before?ownerUid=${uid}`),
        fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
        fetch('/api/engine/status').catch(() => null),
      ]);
      const [wD, hD, mD, bD] = await Promise.all([winRes.json(), hitRes.json(), memRes.json(), btRes.json()]);
      const eD = engRes ? await engRes.json().catch(() => null) : null;

      if (wD.ok) setActiveWindows(wD.windows     ?? []);
      if (hD.ok) setDreamHits(hD.hits             ?? []);
      if (mD.ok) setPersonalRows(mD.rows           ?? []);
      if (bD.ok) setBacktestDreams(bD.dreams       ?? []);
      setEngineStatus(eD);
    } catch (err) {
      setError('Could not load Integrity Console data.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadAll(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const audit = useMemo(() =>
    buildIntegrityAudit({ activeWindows, dreamHits, personalRows, backtestDreams, backtestHits: [] }),
    [activeWindows, dreamHits, personalRows, backtestDreams]
  );

  async function runReset(scope: 'live' | 'research' | 'hard') {
    if (!user) return;
    const confirmMap: Record<string, string> = {
      live:     'Remove live ops data (activeDreamWindows, dreamHits, dreamHitPromotions)? Dictionaries are preserved.',
      research: 'Remove research data (backtestHits, backtestSummaries, personalHitEvents)? Dictionaries are preserved.',
      hard:     'Remove ALL operational data (live + research)? Dictionaries are preserved. This cannot be undone.',
    };
    if (!window.confirm(confirmMap[scope])) return;
    setWorking(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid, scope, confirm: `CONFIRM_${scope.toUpperCase()}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Reset failed.');
      setMessage(`Reset complete (${scope}): ${JSON.stringify(data.results)}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally { setWorking(false); }
  }

  const engineOk    = engineStatus?.is_current === true;
  const engineStale = engineStatus && !engineStatus.is_current;
  const engineDown  = !engineStatus;

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background: 'radial-gradient(circle at top left,rgba(228,192,123,0.14),transparent 18%),radial-gradient(circle at top right,rgba(108,120,255,0.12),transparent 22%),linear-gradient(135deg,#1A1A2E 0%,#16213E 48%,#0F3460 100%)',
    }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display:'flex',justifyContent:'space-between',gap:'16px',alignItems:'flex-start',flexWrap:'wrap' }}>
            <div className="page-header">
              <h1>Integrity Console</h1>
              <p>System health, engine reachability, data counts, and safe reset tools. Dictionaries are preserved by all reset operations.</p>
            </div>
            <div style={{ display:'flex',gap:'10px',flexWrap:'wrap' }}>
              <Link href="/daily-ops"          className="btn-secondary">Daily Ops</Link>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
              <Link href="/results/import"     className="btn-secondary">Engine Coverage</Link>
            </div>
          </div>
        </section>

        {loading && <section className="journal-card"><p>Loading Integrity Console…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{error}</section>}
        {message && <section className="journal-card-flat" style={{ borderColor:'#cfe5c8',background:'#f5fbf2',color:'#315a2b' }}>{message}</section>}

        {/* Engine + route health */}
        <section className="journal-card">
          <div className="page-header"><h1>System Health</h1><p>Engine reachability and server route status.</p></div>
          <div style={{ display:'grid',gap:'8px',marginTop:'12px' }}>
            <div className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
              <span>Lottery Engine</span>
              <strong style={{ color: engineOk ? '#6dbf8a' : engineStale ? '#fbbf24' : '#f87171' }}>
                {engineOk ? '✓ Current' : engineStale ? '⚠ Stale' : '✗ Not reachable'}
              </strong>
            </div>
            {engineStatus?.last_run_at && (
              <div className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                <span>Last Engine Ingest</span>
                <strong>{new Date(engineStatus.last_run_at).toLocaleString()}</strong>
              </div>
            )}
            {[
              ['/api/dreams/windows',        activeWindows.length,  'windows'],
              ['/api/dreams/hits',           dreamHits.length,      'hits'],
              ['/api/fell-before',           personalRows.length,   'memory rows'],
              ['/api/backtest/list-dreams',  backtestDreams.length, 'backtests'],
            ].map(([route, count, label]) => (
              <div key={String(route)} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                <span>{String(route)}</span>
                <strong style={{ color:'#6dbf8a' }}>✓ {count} {label}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Audit summary */}
        <section className="journal-card">
          <div className="page-header"><h1>Audit Summary</h1><p>Data integrity counts across live and research memory.</p></div>
          <div style={{ display:'grid',gap:'10px',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',marginTop:'12px' }}>
            {Object.entries(audit.summary).map(([key, value]) => (
              <div key={key} className="journal-card-flat">
                <div className="journal-label">{key}</div>
                <div style={{ fontSize:'22px',fontWeight:700 }}>{String(value)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Duplicates + orphans */}
        <section style={{ display:'grid',gap:'20px',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))' }}>
          <section className="journal-card">
            <div className="page-header"><h1>Duplicates</h1><p>Most important duplicate patterns detected.</p></div>
            <div style={{ display:'grid',gap:'8px',marginTop:'12px' }}>
              {audit.duplicateLiveHits.slice(0,5).map((r: any) => (
                <div key={r.key} className="journal-card-flat" style={{ fontSize:'13px' }}>Live hit duplicate ×{r.count}</div>
              ))}
              {audit.duplicatePersonalMappings.slice(0,5).map((r: any) => (
                <div key={r.key} className="journal-card-flat" style={{ fontSize:'13px' }}>Personal mapping duplicate ×{r.count}</div>
              ))}
              {audit.duplicateBacktestHits?.slice(0,5).map((r: any) => (
                <div key={r.key} className="journal-card-flat" style={{ fontSize:'13px' }}>Backtest hit duplicate ×{r.count}</div>
              ))}
              {!audit.duplicateLiveHits.length && !audit.duplicatePersonalMappings.length && (
                <p style={{ color:'var(--ink-light)',margin:0,fontSize:'13px' }}>No duplicate groups detected.</p>
              )}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header"><h1>Orphans / Weak Records</h1><p>Records missing expected links.</p></div>
            <div style={{ display:'grid',gap:'8px',marginTop:'12px' }}>
              {[
                ['Orphan Active Windows',  audit.orphanActiveWindows?.length ?? 0],
                ['Orphan Dream Hits',      audit.orphanDreamHits?.length     ?? 0],
                ['Orphan Backtest Hits',   audit.orphanBacktestHits?.length  ?? 0],
                ['Weak Backtest Dreams',   audit.weakBacktestDreams?.length  ?? 0],
              ].map(([label, val]) => (
                <div key={String(label)} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                  <span>{label}</span><strong>{val}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>

        {/* Reset tools */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Safe Reset Tools</h1>
            <p>These resets preserve dictionaries: personalHitMappings and termNumberMappings are never deleted. Each reset requires a confirmation dialog.</p>
          </div>
          <div style={{ display:'flex',gap:'12px',flexWrap:'wrap',marginTop:'14px' }}>
            <button className="btn-secondary" disabled={working} onClick={() => runReset('live')}>
              {working ? 'Working…' : 'Reset Live Ops'}
            </button>
            <button className="btn-secondary" disabled={working} onClick={() => runReset('research')}>
              {working ? 'Working…' : 'Reset Research'}
            </button>
            <button className="btn-primary" disabled={working} onClick={() => runReset('hard')}>
              {working ? 'Working…' : 'Hard Operational Reset'}
            </button>
          </div>
          <p style={{ margin:'12px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.35)' }}>
            Live reset removes: activeDreamWindows, dreamHits, dreamHitPromotions.
            Research reset removes: backtestHits, backtestSummaries, personalHitEvents.
            Hard reset removes both. Dictionaries are always preserved.
          </p>
        </section>

      </section>
    </main>
  );
}
