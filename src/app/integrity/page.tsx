'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildPipelineHealth, buildCompletenessAudit, buildPromotionGapAudit,
  buildDictGapAudit, buildDreamerScopeAudit, type HealthStatus,
} from '@/lib/intelligence/integrityAudit';

function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50' : '#ff9090';
  return (
    <div style={{ padding:'12px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      <strong>{isIndex ? '\u26a0 Index required — ' : isQuota ? '\u26a0 Quota — ' : '\u26a0 '}</strong>
      {isIndex ? 'Create composite index in Firebase Console, then refresh.' : isQuota ? 'Wait for quota reset.' : msg}
      <button type="button" onClick={() => setOpen(o => !o)} style={{ marginLeft:'8px', fontSize:'10px', opacity:0.6, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
        {open ? 'hide' : 'details'}
      </button>
      {open && <div style={{ marginTop:'5px', fontSize:'10px', fontFamily:'monospace', opacity:0.7, wordBreak:'break-all' }}>{msg}</div>}
    </div>
  );
}

const STATUS_COLORS: Record<HealthStatus, { bg: string; border: string; color: string; label: string }> = {
  healthy: { bg:'rgba(96,224,154,0.10)',  border:'rgba(96,224,154,0.26)',  color:'#60e09a', label:'\u2713 Healthy'    },
  warning: { bg:'rgba(255,204,80,0.10)',  border:'rgba(255,204,80,0.28)',  color:'#ffcc50', label:'\u26a0 Warning'    },
  error:   { bg:'rgba(255,85,85,0.10)',   border:'rgba(255,85,85,0.28)',   color:'#ff9090', label:'\u2717 Needs Repair'},
  unknown: { bg:'rgba(255,255,255,0.05)', border:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.45)', label:'? Unknown'},
};

function HealthCard({ item }: { item: any }) {
  const c = STATUS_COLORS[item.status as HealthStatus] ?? STATUS_COLORS.unknown;
  return (
    <div style={{ padding:'12px 14px', borderRadius:'13px', background:c.bg, border:`1px solid ${c.border}`, display:'grid', gap:'4px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:'8px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'12px', fontWeight:700, color:'#fff', fontFamily:'system-ui,sans-serif' }}>{item.label}</span>
        <span style={{ fontSize:'10px', fontWeight:700, color:c.color }}>{c.label}</span>
      </div>
      <div style={{ fontSize:'12px', color:c.color, fontFamily:'monospace' }}>{item.value}</div>
      {item.detail && <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.50)', lineHeight:1.6 }}>{item.detail}</div>}
    </div>
  );
}

export default function IntegrityConsolePage() {
  const { user, loading: authLoading } = useAuth();

  const [windows,    setWindows]    = useState<any[]>([]);
  const [hits,       setHits]       = useState<any[]>([]);
  const [fell,       setFell]       = useState<any[]>([]);
  const [backtests,  setBacktests]  = useState<any[]>([]);
  const [dreamers,   setDreamers]   = useState<any[]>([]);
  const [dictTerms,  setDictTerms]  = useState<any[]>([]);
  const [pinned,     setPinned]     = useState<any[]>([]);
  const [engineStatus, setEngineStatus] = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [errors,     setErrors]     = useState<string[]>([]);
  const [quotaError, setQuotaError] = useState(false);
  const [indexError, setIndexError] = useState(false);
  const [repairing,  setRepairing]  = useState(false);
  const [promoting,  setPromoting]  = useState(false);
  const [actionResult, setActionResult] = useState('');
  const [actionError,  setActionError]  = useState('');

  useEffect(() => {
    if (authLoading || !user) { if (!authLoading) setLoading(false); return; }
    const uid = encodeURIComponent(user.uid);
    const errs: string[] = [];
    const safe = async (url: string) => {
      try { const r = await fetch(url); const d = await r.json();
        if (d.quota) setQuotaError(true);
        if (String(d.error ?? '').includes('FAILED_PRECONDITION')) setIndexError(true);
        return d;
      } catch (e) { errs.push(String(e)); return {}; }
    };
    Promise.all([
      safe(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
      safe(`/api/dreams/hits?ownerUid=${uid}&limit=100`),
      safe(`/api/fell-before?ownerUid=${uid}&limit=250`),
      safe(`/api/backtest/list-dreams?ownerUid=${uid}`),
      safe(`/api/dreamers?ownerUid=${uid}&limit=100`),
      safe(`/api/dictionary/terms?ownerUid=${uid}&limit=200`),
      safe(`/api/pinned-plays?ownerUid=${uid}`),
      fetch('/api/engine/status').then(r => r.json()).catch(() => null),
    ]).then(([wd, hd, fd, bd, dr, td, pd, eng]) => {
      if (wd?.ok) setWindows(wd.windows   ?? []);
      if (hd?.ok) setHits(hd.hits         ?? []);
      if (fd?.ok) setFell(fd.rows         ?? []);
      if (bd?.ok) setBacktests(bd.dreams  ?? []);
      if (dr?.ok) setDreamers(dr.dreamers ?? []);
      if (td?.ok) setDictTerms(td.terms   ?? []);
      if (pd?.ok) setPinned(pd.plays      ?? []);
      if (eng?.is_current !== undefined) setEngineStatus(eng);
      if (errs.length) setErrors(errs);
      setLoading(false);
    });
  }, [user, authLoading]); // eslint-disable-line

  const health       = useMemo(() => buildPipelineHealth({ windows, hits, fell, dreamers, backtests, engineStatus, quotaError, indexError }), [windows, hits, fell, dreamers, backtests, engineStatus, quotaError, indexError]);
  const completeness = useMemo(() => buildCompletenessAudit({ windows, hits, fell, pinned }), [windows, hits, fell, pinned]);
  const promoGap     = useMemo(() => buildPromotionGapAudit(hits, fell),                      [hits, fell]);
  const dictGap      = useMemo(() => buildDictGapAudit(windows, dictTerms),                   [windows, dictTerms]);
  const dreamerAudit = useMemo(() => buildDreamerScopeAudit({ dreamers, hits, fell }),         [dreamers, hits, fell]);

  const healthyCount = health.filter(h => h.status === 'healthy').length;
  const warningCount = health.filter(h => h.status === 'warning').length;
  const errorCount   = health.filter(h => h.status === 'error').length;

  async function runRepair() {
    if (!user) return;
    const ok = window.confirm('Run repair-hit-memory? This backfills personalHitMappings + termNumberMappings from existing records. It is idempotent.');
    if (!ok) return;
    setRepairing(true); setActionResult(''); setActionError('');
    try {
      const res  = await fetch('/api/admin/repair-hit-memory', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ ownerUid: user.uid, hitsLimit: 500, windowsLimit: 200 }),
      });
      const data = await res.json();
      if (!data.ok) { setActionError(data.error ?? 'Repair failed.'); return; }
      setActionResult(`Repair complete — ${data.hitsPromoted ?? 0} hits promoted, ${data.dictRowsWritten ?? 0} dictionary rows, ${data.hitsSkipped ?? 0} skipped.`);
    } catch (e) { setActionError(String(e)); }
    finally { setRepairing(false); }
  }

  async function runPromote() {
    if (!user) return;
    setPromoting(true); setActionResult(''); setActionError('');
    try {
      const res  = await fetch('/api/admin/promote-hits', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (!data.ok) { setActionError(data.error ?? 'Promote failed.'); return; }
      setActionResult(`Promote complete — ${data.promoted ?? 0} promoted, ${data.skipped ?? 0} skipped.`);
    } catch (e) { setActionError(String(e)); }
    finally { setPromoting(false); }
  }

  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.4rem,3vw,2rem)', fontWeight:900, letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>Integrity Console</h1>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.50)', fontSize:'13px' }}>Pipeline health, data completeness audits, and repair actions.</p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <Link href="/evidence"  className="btn-secondary" style={{ fontSize:'12px' }}>Evidence Tracker</Link>
            <Link href="/daily-ops" className="btn-secondary" style={{ fontSize:'12px' }}>Daily Ops</Link>
          </div>
        </div>
      </section>

      {errors.length > 0 && <ErrorBanner msg={errors[0]} />}
      {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading integrity data…</p></section>}

      {!loading && (
        <>
          <section style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            {[{val:healthyCount,label:'Healthy',color:'#60e09a'},{val:warningCount,label:'Warnings',color:'#ffcc50'},{val:errorCount,label:'Needs Repair',color:'#ff9090'}].map(({val,label,color}) => (
              <div key={label} style={{ padding:'8px 14px', borderRadius:'12px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                <strong style={{ fontSize:'1.4rem', fontWeight:900, color, fontFamily:'system-ui,sans-serif' }}>{val}</strong>
                <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)', marginLeft:'6px', fontFamily:'system-ui,sans-serif' }}>{label}</span>
              </div>
            ))}
          </section>

          <section className="journal-card">
            <h2 style={{ margin:'0 0 14px', fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Pipeline Health Checklist</h2>
            <div style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
              {health.map(item => <HealthCard key={item.label} item={item} />)}
            </div>
          </section>

          {completeness.length > 0 ? (
            <section className="journal-card">
              <h2 style={{ margin:'0 0 12px', fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Data Completeness Issues</h2>
              <div style={{ display:'grid', gap:'7px' }}>
                {completeness.map((issue: any, i: number) => (
                  <div key={i} style={{ padding:'9px 12px', borderRadius:'12px', background:'rgba(255,204,80,0.07)', border:'1px solid rgba(255,204,80,0.18)', display:'flex', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
                    <span><span style={{ fontFamily:'monospace', color:'#fff', fontSize:'12px' }}>{issue.collection}</span><span style={{ color:'rgba(255,255,255,0.45)', fontSize:'12px' }}> · missing </span><span style={{ fontFamily:'monospace', color:'#ffcc50', fontSize:'12px' }}>{issue.field}</span></span>
                    <span style={{ color:'#ffcc50', fontWeight:700, fontSize:'12px' }}>{issue.count} row{issue.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div style={{ padding:'12px 16px', borderRadius:'14px', border:'1px solid rgba(96,224,154,0.22)', background:'rgba(96,224,154,0.07)', color:'#60e09a', fontSize:'13px' }}>
              ✓ No data completeness issues in sampled records.
            </div>
          )}

          <section className="journal-card">
            <h2 style={{ margin:'0 0 12px', fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Promotion Gap</h2>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.65)', display:'grid', gap:'5px' }}>
              <div>Detected hits (sampled): <strong style={{ color:'#fff' }}>{promoGap.dreamHitsTotal}</strong></div>
              <div>As They Fell Before rows: <strong style={{ color:'#fff' }}>{promoGap.fellBeforeRows}</strong></div>
              <div>Estimated unpromoted: <strong style={{ color: promoGap.estimatedUnpromoted > 0 ? '#ffcc50' : '#60e09a' }}>{promoGap.estimatedUnpromoted}</strong></div>
              {promoGap.repairRecommended && <div style={{ color:'#ffcc50' }}>⚠ Gap detected — run repair-hit-memory below.</div>}
            </div>
          </section>

          <section className="journal-card">
            <h2 style={{ margin:'0 0 12px', fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Dictionary Gap</h2>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.65)', display:'grid', gap:'5px' }}>
              <div>Active terms: <strong style={{ color:'#fff' }}>{dictGap.activeWindowTerms.length}</strong><span style={{ color:'rgba(255,255,255,0.35)', marginLeft:'6px' }}>{dictGap.activeWindowTerms.slice(0,4).join(', ')}</span></div>
              <div>Dictionary terms: <strong style={{ color:'#fff' }}>{dictGap.dictTerms.length}</strong></div>
              {dictGap.dictMissingDreamer > 0 && <div style={{ color:'#ffcc50' }}>⚠ {dictGap.dictMissingDreamer} rows missing dreamerId (pre-patch records). Run repair.</div>}
              {dictGap.missingTerms.length > 0 && <div style={{ color:'#ffcc50' }}>⚠ Missing from dictionary: <strong>{dictGap.missingTerms.slice(0,5).join(', ')}</strong>. Run repair.</div>}
              {dictGap.missingTerms.length === 0 && dictGap.dictMissingDreamer === 0 && <div style={{ color:'#60e09a' }}>✓ Dictionary coverage looks complete.</div>}
            </div>
          </section>

          <section className="journal-card">
            <h2 style={{ margin:'0 0 12px', fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Dreamer Scope</h2>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.65)', display:'grid', gap:'5px' }}>
              <div>Saved dreamers: <strong style={{ color:'#fff' }}>{dreamerAudit.dreamerCount}</strong></div>
              <div>owner-self hits: <strong style={{ color:'#fff' }}>{dreamerAudit.ownerSelfHits}</strong></div>
              {dreamerAudit.missingNameHits > 0 && <div style={{ color:'#ffcc50' }}>⚠ {dreamerAudit.missingNameHits} hit rows missing dreamerName. Run promote-hits.</div>}
              {dreamerAudit.missingNameHits === 0 && <div style={{ color:'#60e09a' }}>✓ All sampled hits have dreamerName.</div>}
            </div>
          </section>

          <section className="journal-card">
            <h2 style={{ margin:'0 0 14px', fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Repair Actions</h2>
            <div style={{ display:'grid', gap:'10px' }}>
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
                <button type="button" className="btn-primary" onClick={runRepair} disabled={repairing || !user} style={{ fontSize:'13px' }}>
                  {repairing ? '⏳ Repairing…' : '🔧 Run repair-hit-memory'}
                </button>
                <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.50)' }}>Backfills personalHitMappings + termNumberMappings. Idempotent, safe to re-run.</span>
              </div>
              <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
                <button type="button" className="btn-secondary" onClick={runPromote} disabled={promoting || !user} style={{ fontSize:'13px' }}>
                  {promoting ? '⏳ Promoting…' : '📥 Run promote-hits'}
                </button>
                <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.50)' }}>Promotes unpromoted dreamHits into As They Fell Before via dreamHitPromotions registry.</span>
              </div>
              <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                <Link href="/windows" className="btn-secondary" style={{ fontSize:'12px' }}>🔄 Active Windows</Link>
                <Link href="/backtesting/replay" className="btn-secondary" style={{ fontSize:'12px' }}>⚡ Replay Lab</Link>
                <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="btn-secondary" style={{ fontSize:'12px' }}>🗃 Firebase Console</a>
              </div>
              {actionResult && <div style={{ padding:'10px 14px', borderRadius:'12px', background:'rgba(96,224,154,0.09)', border:'1px solid rgba(96,224,154,0.24)', color:'#60e09a', fontSize:'13px' }}>{actionResult}</div>}
              {actionError  && <div style={{ padding:'10px 14px', borderRadius:'12px', background:'rgba(255,85,85,0.09)',  border:'1px solid rgba(255,85,85,0.24)',  color:'#ff9090', fontSize:'13px' }}>✗ {actionError}</div>}
            </div>
          </section>

          <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7 }}>
            · All checks use capped data. Full historical audits should be run manually. · Index required: activeDreamWindows — ownerUid ASC + activeEnd ASC.
          </section>
        </>
      )}
    </div>
  );
}
