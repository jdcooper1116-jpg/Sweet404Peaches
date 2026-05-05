'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildEvidenceSummary,
  buildTermEvidence,
  buildNumberEvidence,
  buildStateEvidence,
  buildSuggestionEvidence,
  buildBoxedFamilyEvidence,
} from '@/lib/intelligence/evidenceAnalysis';
import { buildReplayLearningSummary } from '@/lib/intelligence/replayLearning';
import { boxedKey } from '@/lib/intelligence/universalScope';

// ─── Visual primitives ────────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50' : '#ff9090';
  return (
    <div style={{ padding:'12px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      <strong>{isIndex ? '⚠ Index required — ' : isQuota ? '⚠ Quota exhausted — ' : '⚠ '}</strong>
      {isIndex ? 'Create composite index in Firebase Console.' : isQuota ? 'Wait for quota reset.' : msg}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ marginLeft:'8px', fontSize:'10px', opacity:0.6, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
        {open ? 'hide' : 'details'}
      </button>
      {open && <div style={{ marginTop:'5px', fontSize:'10px', fontFamily:'monospace', opacity:0.7, wordBreak:'break-all' }}>{msg}</div>}
    </div>
  );
}

function NumberChip({ n, game }: { n: string; game: string }) {
  const c4 = game === 'cash4';
  return <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'12px', padding:'2px 7px', borderRadius:'7px',
    background: c4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
    border:`1px solid ${c4 ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}`,
    color: c4 ? '#a090ff' : '#ff8a6a' }}>{n}</span>;
}

function StateChip({ state }: { state: string }) {
  return <span style={{ padding:'2px 7px', borderRadius:'7px', fontSize:'11px', fontWeight:800,
    background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a',
    fontFamily:'system-ui,sans-serif' }}>{state}</span>;
}

function TierBadge({ tier }: { tier: string }) {
  const c: Record<string, string> = {
    'Strong Evidence':  '#60e09a', 'Strong Focus':   '#60e09a',
    'Moderate Evidence':'#ffcc50', 'Moderate Focus': '#ffcc50',
    'Watchlist':        '#a090ff', 'Needs More Evidence':'rgba(255,255,255,0.45)',
    'Needs More':       'rgba(255,255,255,0.45)',
  };
  const color = c[tier] ?? 'rgba(255,255,255,0.45)';
  return <span style={{ padding:'2px 8px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
    border:`1px solid ${color}40`, color, fontFamily:'system-ui,sans-serif' }}>{tier}</span>;
}

function StatTile({ label, val, color, sub }: { label: string; val: number | string; color: string; sub?: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'16px', padding:'14px 16px' }}>
      <strong style={{ fontSize:'1.8rem', fontWeight:900, letterSpacing:'-0.05em', display:'block', lineHeight:1, color, fontFamily:'system-ui,sans-serif' }}>{val}</strong>
      <span style={{ color:'rgba(255,255,255,0.40)', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em', fontFamily:'system-ui,sans-serif' }}>{label}</span>
      {sub && <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.30)', marginTop:'2px' }}>{sub}</div>}
    </div>
  );
}

function SH({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom:'14px' }}>
      <h2 style={{ margin:0, fontSize:'1.0rem', fontWeight:900, letterSpacing:'-0.02em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>{title}</h2>
      {sub && <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginTop:'3px' }}>{sub}</div>}
    </div>
  );
}

function HealthDot({ ok }: { ok: boolean }) {
  return <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'50%',
    background: ok ? '#60e09a' : '#ffcc50', marginRight:'6px', verticalAlign:'middle' }} />;
}

const ACTIVE_BADGE = <span style={{ padding:'2px 6px', borderRadius:'999px', fontSize:'9px', fontWeight:700,
  background:'rgba(255,107,74,0.14)', border:'1px solid rgba(255,107,74,0.28)', color:'#ff8a6a' }}>Active</span>;
const PINNED_BADGE = <span style={{ padding:'2px 6px', borderRadius:'999px', fontSize:'9px', fontWeight:700,
  background:'rgba(255,204,80,0.14)', border:'1px solid rgba(255,204,80,0.28)', color:'#ffcc50' }}>Pinned</span>;
const FELL_BADGE   = <span style={{ padding:'2px 6px', borderRadius:'999px', fontSize:'9px', fontWeight:700,
  background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a' }}>Fell Before</span>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { user, loading: authLoading } = useAuth();

  const [windows,     setWindows]     = useState<any[]>([]);
  const [windowsCapped, setWindowsCapped] = useState(false);
  const [hits,        setHits]        = useState<any[]>([]);
  const [fell,        setFell]        = useState<any[]>([]);
  const [dictTerms,   setDictTerms]   = useState<any[]>([]);
  const [pinned,      setPinned]      = useState<any[]>([]);
  const [dreamers,    setDreamers]    = useState<any[]>([]);
  const [backtests,   setBacktests]   = useState<any[]>([]);
  const [engineStatus,setEngineStatus]= useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [errors,      setErrors]      = useState<string[]>([]);
  const [quotaError,  setQuotaError]  = useState(false);
  const [indexError,  setIndexError]  = useState(false);

  // Filters
  const [filterDreamer,setFilterDreamer] = useState('');
  const [filterState,  setFilterState]   = useState('');
  const [filterGame,   setFilterGame]    = useState('');
  const [filterTerm,   setFilterTerm]    = useState('');
  const [activeOnly,   setActiveOnly]    = useState(false);

  useEffect(() => {
    if (authLoading || !user) { if (!authLoading) setLoading(false); return; }
    const uid = encodeURIComponent(user.uid);
    const errs: string[] = [];
    const safe = async (url: string) => {
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (d.quota) setQuotaError(true);
        if (String(d.error ?? '').includes('FAILED_PRECONDITION')) setIndexError(true);
        return d;
      } catch (e) { errs.push(String(e)); return {}; }
    };
    Promise.all([
      safe(`/api/dreams/window-groups?ownerUid=${uid}&limit=50`),
      safe(`/api/dreams/hits?ownerUid=${uid}&limit=100`),
      safe(`/api/fell-before?ownerUid=${uid}&limit=250`),
      safe(`/api/dictionary/terms?ownerUid=${uid}&limit=500`),
      safe(`/api/pinned-plays?ownerUid=${uid}`),
      safe(`/api/dreamers?ownerUid=${uid}&limit=100`),
      safe(`/api/backtest/list-dreams?ownerUid=${uid}`),
      fetch('/api/engine/status').then(r => r.json()).catch(() => null),
    ]).then(([wd, hd, fd, td, pd, dr, bd, eng]) => {
      if (wd?.ok) { setWindows(wd.windows ?? []); setWindowsCapped(wd.capped ?? false); }
      if (hd?.ok) setHits(hd.hits         ?? []);
      if (fd?.ok) setFell(fd.rows         ?? []);
      if (td?.ok) setDictTerms(td.terms   ?? []);
      if (pd?.ok) setPinned(pd.plays      ?? []);
      if (dr?.ok) setDreamers(dr.dreamers ?? []);
      if (bd?.ok) setBacktests(bd.dreams  ?? []);
      if (eng?.is_current !== undefined) setEngineStatus(eng);
      if (errs.length) setErrors(errs);
      setLoading(false);
    });
  }, [user, authLoading]); // eslint-disable-line

  // ── Apply filters to fell-before rows ────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const activeNums = useMemo(() =>
    new Set(windows.filter(w => (w.activeEnd ?? '') >= today).map((w: any) => `${w.number ?? ''}::${w.gameType ?? ''}`)),
    [windows, today]
  );

  const filteredFell = useMemo(() => fell.filter(r => {
    if (filterDreamer && (r.dreamerId ?? '') !== filterDreamer) return false;
    if (filterState   && r.state !== filterState)                return false;
    if (filterGame    && (r.gameType ?? '') !== filterGame)       return false;
    if (filterTerm    && !String(r.termLabel ?? '').toLowerCase().includes(filterTerm.toLowerCase())) return false;
    if (activeOnly    && !activeNums.has(`${r.number ?? ''}::${r.gameType ?? ''}`)) return false;
    return true;
  }), [fell, filterDreamer, filterState, filterGame, filterTerm, activeOnly, activeNums]);

  const filteredHits = useMemo(() => hits.filter(h => {
    if (filterDreamer && (h.dreamerId ?? '') !== filterDreamer) return false;
    if (filterState   && (h.state ?? '') !== filterState)        return false;
    if (filterGame    && (h.gameType ?? h.game_type ?? '') !== filterGame) return false;
    return true;
  }), [hits, filterDreamer, filterState, filterGame]);

  // ── Evidence boards ───────────────────────────────────────────────────────
  const summary     = useMemo(() => buildEvidenceSummary(filteredFell, filteredHits),                      [filteredFell, filteredHits]);
  const termBoard   = useMemo(() => buildTermEvidence(filteredFell),                                       [filteredFell]);
  const numBoard    = useMemo(() => buildNumberEvidence(filteredFell, windows, pinned),                    [filteredFell, windows, pinned]);
  const stateBoard  = useMemo(() => buildStateEvidence(filteredFell),                                      [filteredFell]);
  const suggBoard   = useMemo(() => buildSuggestionEvidence(pinned, filteredFell, windows),                [pinned, filteredFell, windows]);
  const boxedBoard  = useMemo(() => buildBoxedFamilyEvidence(filteredFell, windows, pinned),               [filteredFell, windows, pinned]);
  const replayLearn = useMemo(() => buildReplayLearningSummary(backtests, fell),                           [backtests, fell]);

  // ── Dreamer performance board (per-dreamer summary) ───────────────────────
  const dreamerBoard = useMemo(() => {
    const map = new Map<string, {
      dreamerId: string; dreamerName: string;
      fellRows: number; hitCount: number; straight: number; boxed: number;
      terms: Set<string>; states: Set<string>;
      topTerm: string; topState: string; latestDate: string;
      activeWindows: number;
    }>();

    for (const r of fell) {
      const did  = String(r.dreamerId   ?? 'owner-self');
      const name = String(r.dreamerName ?? did);
      if (!map.has(did)) map.set(did, { dreamerId:did, dreamerName:name, fellRows:0, hitCount:0, straight:0, boxed:0, terms:new Set(), states:new Set(), topTerm:'', topState:'', latestDate:'', activeWindows:0 });
      const e = map.get(did)!;
      e.fellRows++;
      e.hitCount += Number(r.hitCount ?? 1);
      e.straight += Number(r.straightCount ?? 0);
      e.boxed    += Number(r.boxedCount    ?? 0);
      if (r.termLabel) e.terms.add(String(r.termLabel).toLowerCase());
      if (r.state)     e.states.add(r.state);
      const d = String(r.lastHitDate ?? r.drawDate ?? '');
      if (d > e.latestDate) e.latestDate = d;
    }

    // Add active window counts per dreamer
    for (const w of windows) {
      const did = String(w.dreamerId ?? 'owner-self');
      if (!map.has(did)) map.set(did, { dreamerId:did, dreamerName:String(w.dreamerName ?? did), fellRows:0, hitCount:0, straight:0, boxed:0, terms:new Set(), states:new Set(), topTerm:'', topState:'', latestDate:'', activeWindows:0 });
      if ((w.activeEnd ?? '') >= today) map.get(did)!.activeWindows++;
    }

    // Find top term and state per dreamer
    return Array.from(map.values()).map(e => {
      const termHits = new Map<string, number>();
      const stateHits = new Map<string, number>();
      fell.filter(r => (r.dreamerId ?? 'owner-self') === e.dreamerId).forEach(r => {
        if (r.termLabel) termHits.set(r.termLabel,  (termHits.get(r.termLabel)  ?? 0) + Number(r.hitCount ?? 1));
        if (r.state)     stateHits.set(r.state,     (stateHits.get(r.state)     ?? 0) + Number(r.hitCount ?? 1));
      });
      return {
        ...e,
        terms:    e.terms,
        states:   e.states,
        topTerm:  [...termHits.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? '',
        topState: [...stateHits.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? '',
      };
    }).sort((a, b) => b.hitCount - a.hitCount);
  }, [fell, windows, today]);

  // ── Quality scorecard ─────────────────────────────────────────────────────
  const qualityScore = useMemo(() => {
    const totalHits   = hits.length;
    const totalFell   = fell.length;
    const hasName     = hits.filter(h => h.dreamerName).length;
    const hasGameType = hits.filter(h => h.gameType || h.game_type).length;
    const hasDrawDate = hits.filter(h => h.drawDate || h.draw_date).length;
    const hasState    = hits.filter(h => h.state).length;
    const dictHasDid  = dictTerms.filter(t => t.dreamerId).length;
    return {
      totalHits, totalFell,
      nameRate:     totalHits ? Math.round((hasName / totalHits) * 100) : 100,
      gameTypeRate: totalHits ? Math.round((hasGameType / totalHits) * 100) : 100,
      drawDateRate: totalHits ? Math.round((hasDrawDate / totalHits) * 100) : 100,
      stateRate:    totalHits ? Math.round((hasState / totalHits) * 100) : 100,
      dictDreamerRate: dictTerms.length ? Math.round((dictHasDid / dictTerms.length) * 100) : 100,
      promoRate: totalHits && totalFell ? Math.min(100, Math.round((totalFell / totalHits) * 100)) : (totalFell > 0 ? 100 : 0),
    };
  }, [hits, fell, dictTerms]);

  // ── Unique filter options ─────────────────────────────────────────────────
  const allStates  = useMemo(() => [...new Set(fell.map(r => r.state).filter(Boolean))].sort(), [fell]);
  const allGames   = useMemo(() => [...new Set(fell.map(r => r.gameType).filter(Boolean))].sort(), [fell]);

  // Recent proof stream
  const recentStream = useMemo(() =>
    [...filteredHits.slice(0, 8), ...filteredFell.slice(0, 8)]
      .sort((a: any, b: any) =>
        String(b.drawDate ?? b.draw_date ?? b.lastHitDate ?? '').localeCompare(
        String(a.drawDate ?? a.draw_date ?? a.lastHitDate ?? '')))
      .slice(0, 16),
    [filteredHits, filteredFell]
  );

  const topTier = summary.topTier;
  const straight = summary.straightCount;
  const boxedC   = summary.boxedCount;
  const total    = straight + boxedC;

  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      {/* ── Header ── */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.5rem,3vw,2.2rem)', fontWeight:900, letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>
              Performance
            </h1>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.50)', fontSize:'14px', lineHeight:1.65, maxWidth:'600px' }}>
              System learning analytics — detected hits, fell-before evidence, dreamer performance, and suggestion support.
            </p>
            <div style={{ display:'flex', gap:'8px', marginTop:'10px', flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ padding:'3px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                background:'rgba(96,224,154,0.10)', border:'1px solid rgba(96,224,154,0.24)', color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>✓ Quota-safe mode</span>
              {engineStatus && (
                <span style={{ padding:'3px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                  background: engineStatus.is_current ? 'rgba(96,224,154,0.10)' : 'rgba(255,204,80,0.10)',
                  border:`1px solid ${engineStatus.is_current ? 'rgba(96,224,154,0.24)' : 'rgba(255,204,80,0.24)'}`,
                  color: engineStatus.is_current ? '#60e09a' : '#ffcc50', fontFamily:'system-ui,sans-serif' }}>
                  Engine: {engineStatus.is_current ? '✓ current' : '⚠ stale'}
                </span>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <Link href="/backtesting/evidence" className="btn-secondary" style={{ fontSize:'12px' }}>Evidence Tracker</Link>
            <Link href="/integrity"            className="btn-secondary" style={{ fontSize:'12px' }}>Integrity Console</Link>
            <Link href="/universal-scope"      className="btn-secondary" style={{ fontSize:'12px' }}>Universal Scope</Link>
          </div>
        </div>
      </section>

      {(quotaError || indexError || errors.length > 0) && (
        <ErrorBanner msg={quotaError ? 'Firebase quota exhausted.' : indexError ? 'FAILED_PRECONDITION: requires an index' : errors[0]} />
      )}

      {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading performance data…</p></section>}

      {/* ── Filters ── */}
      <section style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))' }}>
        <select className="journal-select" value={filterDreamer} onChange={e => setFilterDreamer(e.target.value)}>
          <option value="">All Dreamers</option>
          {dreamers.map((d: any) => <option key={d.id} value={d.id}>{d.displayName ?? d.id}</option>)}
        </select>
        <input className="journal-input" placeholder="Filter by term…" value={filterTerm} onChange={e => setFilterTerm(e.target.value)} />
        <select className="journal-select" value={filterState} onChange={e => setFilterState(e.target.value)}>
          <option value="">All States</option>
          {allStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="journal-select" value={filterGame} onChange={e => setFilterGame(e.target.value)}>
          <option value="">All Game Types</option>
          {allGames.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'13px', color:'rgba(255,255,255,0.65)', cursor:'pointer' }}>
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Active windows only
        </label>
      </section>

      {!loading && (<>

        {/* ── 1. Performance Hero ── */}
        <section style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))' }}>
          <StatTile label="Detected Hits"      val={filteredHits.length}           color="#ff8a6a" />
          <StatTile label="Fell-Before Rows"   val={filteredFell.length}           color="#60e09a" />
          <StatTile label="Dict Mappings"      val={dictTerms.length}              color="#a090ff" />
          <StatTile label="Active Windows"     val={windows.filter(w => (w.activeEnd ?? '') >= today).length + (windowsCapped ? '+' : '')} color="#ff8a6a" />
          <StatTile label="Active Dreamers"    val={new Set(windows.filter(w => (w.activeEnd ?? '') >= today).map((w: any) => w.dreamerId ?? 'owner-self')).size} color="#ffcc50" />
          <StatTile label="Pinned / Suggest."  val={pinned.filter((p: any) => p.status === 'pinned' || p.status === 'suggested').length} color="#ffcc50" />
          <StatTile label="Straight Hits"      val={straight}                      color="#60e09a"
            sub={total > 0 ? `${Math.round((straight/total)*100)}% of total` : undefined} />
          <StatTile label="Boxed Hits"         val={boxedC}                        color="#ffcc50"
            sub={total > 0 ? `${Math.round((boxedC/total)*100)}% of total` : undefined} />
          <StatTile label="Top Evidence Tier"  val={topTier === 'Strong Focus' ? 'Strong' : topTier === 'Moderate Focus' ? 'Moderate' : topTier === 'Watchlist' ? 'Watchlist' : 'Low'}
            color={topTier === 'Strong Focus' ? '#60e09a' : topTier === 'Moderate Focus' ? '#ffcc50' : '#a090ff'} />
        </section>

        {/* ── 2. Evidence Quality Scorecard ── */}
        <section className="journal-card">
          <SH title="Evidence Quality Scorecard" sub="Data completeness of sampled records" />
          <div style={{ display:'grid', gap:'7px', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))' }}>
            {[
              { label:'Hits with dreamerName',   pct:qualityScore.nameRate,       col:'hits' },
              { label:'Hits with gameType',      pct:qualityScore.gameTypeRate,   col:'hits' },
              { label:'Hits with drawDate',      pct:qualityScore.drawDateRate,   col:'hits' },
              { label:'Hits with state',         pct:qualityScore.stateRate,      col:'hits' },
              { label:'Dict rows with dreamerId',pct:qualityScore.dictDreamerRate,col:'dict' },
              { label:'Hits promoted to memory', pct:qualityScore.promoRate,      col:'fell' },
            ].map(({ label, pct }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', borderRadius:'12px',
                background: pct >= 90 ? 'rgba(96,224,154,0.07)' : pct >= 60 ? 'rgba(255,204,80,0.07)' : 'rgba(255,85,85,0.07)',
                border:`1px solid ${pct >= 90 ? 'rgba(96,224,154,0.18)' : pct >= 60 ? 'rgba(255,204,80,0.18)' : 'rgba(255,85,85,0.18)'}` }}>
                <HealthDot ok={pct >= 80} />
                <span style={{ flex:1, fontSize:'12px', color:'rgba(255,255,255,0.70)' }}>{label}</span>
                <span style={{ fontSize:'13px', fontWeight:700, color: pct >= 90 ? '#60e09a' : pct >= 60 ? '#ffcc50' : '#ff9090', fontFamily:'monospace' }}>{pct}%</span>
              </div>
            ))}
          </div>
          {(qualityScore.promoRate < 50 || qualityScore.nameRate < 80) && (
            <div style={{ marginTop:'10px', fontSize:'12px', color:'#ffcc50' }}>
              ⚠ Evidence gaps detected.{' '}
              <Link href="/integrity" style={{ color:'#a090ff', fontWeight:600 }}>Open Integrity Console →</Link>
            </div>
          )}
        </section>

        {/* ── 3. Dreamer Performance Board ── */}
        {dreamerBoard.length > 0 && (
          <section className="journal-card">
            <SH title="Dreamer Performance" sub="Evidence attributed to each dreamer" />
            <div style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))' }}>
              {dreamerBoard.slice(0, 8).map(d => (
                <div key={d.dreamerId} style={{ padding:'14px 16px', borderRadius:'16px',
                  background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
                    <div>
                      <Link href={`/dreamers/${d.dreamerId}`}
                        style={{ fontSize:'14px', fontWeight:800, color:'#fff', textDecoration:'none', fontFamily:'system-ui,sans-serif' }}>
                        {d.dreamerName || d.dreamerId}
                      </Link>
                      {d.activeWindows > 0 && (
                        <span style={{ marginLeft:'6px', fontSize:'10px', fontWeight:700, padding:'1px 6px', borderRadius:'999px',
                          background:'rgba(255,107,74,0.14)', border:'1px solid rgba(255,107,74,0.28)', color:'#ff8a6a' }}>
                          {d.activeWindows} active
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#60e09a' }}>{d.hitCount} hits</span>
                  </div>
                  <div style={{ display:'grid', gap:'4px', fontSize:'11px', color:'rgba(255,255,255,0.55)' }}>
                    <div>{d.terms.size} term{d.terms.size !== 1 ? 's' : ''} · {d.states.size} state{d.states.size !== 1 ? 's' : ''} · {d.straight}S / {d.boxed}B</div>
                    {d.topTerm  && <div>Top term: <strong style={{ color:'#fff' }}>{d.topTerm}</strong></div>}
                    {d.topState && <div>Top state: <StateChip state={d.topState} /></div>}
                    {d.latestDate && <div style={{ color:'rgba(255,255,255,0.35)', fontFamily:'monospace' }}>{d.latestDate}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Term Performance Board ── */}
        {termBoard.length > 0 && (
          <section className="journal-card">
            <SH title="Term Performance" sub="Evidence grouped by dream term" />
            <div style={{ display:'grid', gap:'8px' }}>
              {termBoard.slice(0, 12).map(t => {
                const isActive = windows.some(w => String(w.termLabel ?? '').toLowerCase() === t.termLabel && (w.activeEnd ?? '') >= today);
                return (
                  <div key={t.termLabel} style={{ padding:'10px 13px', borderRadius:'13px',
                    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)',
                    display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-start' }}>
                    <div style={{ minWidth:'90px' }}>
                      <div style={{ fontSize:'13px', fontWeight:800, color:'#fff', fontFamily:'system-ui,sans-serif' }}>{t.termLabel}</div>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginTop:'3px' }}>
                        <TierBadge tier={t.tier} />
                        {isActive && ACTIVE_BADGE}
                      </div>
                    </div>
                    <div style={{ flex:1, display:'grid', gap:'5px' }}>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {t.numbers.slice(0, 6).map(n => <NumberChip key={n} n={n} game="cash3" />)}
                      </div>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {t.states.slice(0, 5).map(s => <StateChip key={s} state={s} />)}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', fontSize:'11px', color:'rgba(255,255,255,0.45)', whiteSpace:'nowrap' }}>
                      <div>{t.hitCount} hits · {t.straightCount}S / {t.boxedCount}B</div>
                      {t.strongestState && <div style={{ color:'#60e09a' }}>Best: {t.strongestState}</div>}
                      {t.dreamerNames.length > 0 && <div style={{ color:'#a090ff' }}>{t.dreamerNames.slice(0, 2).join(', ')}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 5. Number Performance Board ── */}
        {numBoard.filter(n => n.hitCount > 0).length > 0 && (
          <section className="journal-card">
            <SH title="Number Performance" sub="Numbers with fell-before evidence" />
            <div style={{ display:'grid', gap:'7px' }}>
              {numBoard.filter(n => n.hitCount > 0).slice(0, 12).map(n => (
                <div key={`${n.number}-${n.gameType}`} style={{ padding:'9px 12px', borderRadius:'12px',
                  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)',
                  display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                  <NumberChip n={n.number} game={n.gameType} />
                  <div style={{ flex:1, display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                    {n.isActiveNow && ACTIVE_BADGE}
                    {n.isPinned    && PINNED_BADGE}
                    {FELL_BADGE}
                    <TierBadge tier={n.tier} />
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)' }}>
                      {n.terms.slice(0, 3).join(', ')}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {n.states.slice(0, 4).map(s => <StateChip key={s} state={s} />)}
                  </div>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', whiteSpace:'nowrap' }}>
                    {n.hitCount} hits · {n.straightCount}S
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 6. State Performance Board ── */}
        {stateBoard.length > 0 && (
          <section className="journal-card">
            <SH title="State Performance" sub="States with the most fell-before evidence" />
            <div style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
              {stateBoard.slice(0, 12).map(s => (
                <div key={s.state} style={{ padding:'12px 14px', borderRadius:'14px',
                  background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
                    <span style={{ fontWeight:900, fontSize:'14px', color:'#a090ff', fontFamily:'system-ui,sans-serif' }}>{s.state}</span>
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)' }}>{s.hitCount} hits · {s.straightCount}S / {s.boxedCount}B</span>
                  </div>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'5px' }}>
                    {s.numbers.slice(0, 5).map(n => <NumberChip key={n} n={n} game="cash3" />)}
                  </div>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)' }}>
                    {s.terms.slice(0, 4).join(', ')}
                  </div>
                  {s.latestHitDate && (
                    <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.30)', marginTop:'4px', fontFamily:'monospace' }}>{s.latestHitDate}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 7. Boxed Family Performance ── */}
        {boxedBoard.filter(b => b.hitCount > 1).length > 0 && (
          <section className="journal-card">
            <SH title="Boxed Family Performance" sub="Digit families with multiple fell-before hits" />
            <div style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
              {boxedBoard.filter(b => b.hitCount > 1).slice(0, 8).map(b => (
                <div key={`${b.boxedKey}-${b.gameType}`} style={{ padding:'12px 14px', borderRadius:'14px',
                  background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'7px', flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'1.1rem',
                      color: b.gameType === 'cash4' ? '#a090ff' : '#ff8a6a' }}>{b.boxedKey}</span>
                    <span style={{ fontSize:'9px', fontWeight:800, padding:'2px 6px', borderRadius:'5px',
                      background: b.gameType === 'cash4' ? 'rgba(160,144,255,0.14)' : 'rgba(255,107,74,0.14)',
                      color: b.gameType === 'cash4' ? '#a090ff' : '#ff8a6a', textTransform:'uppercase', letterSpacing:'0.06em' }}>{b.gameType}</span>
                    {b.isActiveNow           && ACTIVE_BADGE}
                    {b.isPinnedOrSuggested   && PINNED_BADGE}
                  </div>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'5px' }}>
                    {b.numbers.map(n => <NumberChip key={n} n={n} game={b.gameType} />)}
                  </div>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)' }}>
                    {b.terms.slice(0, 4).join(', ')}
                    <span style={{ color:'#60e09a', marginLeft:'8px' }}>{b.hitCount} hits</span>
                  </div>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginTop:'5px' }}>
                    {b.states.slice(0, 4).map(s => <StateChip key={s} state={s} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 8. Replay Learning Panel ── */}
        <section className="journal-card">
          <SH title="Replay Learning" sub="Evidence backed by historical backtesting replays" />
          {backtests.length === 0 ? (
            <p style={{ margin:0, color:'rgba(255,255,255,0.50)', fontSize:'13px', lineHeight:1.7 }}>
              Replay learning will appear here after historical dreams are replayed and saved.{' '}
              <Link href="/backtesting/intake" style={{ color:'#a090ff', fontWeight:600 }}>Start a historical intake →</Link>
            </p>
          ) : (
            <div style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))' }}>
              <div style={{ padding:'12px 14px', borderRadius:'14px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                <strong style={{ fontSize:'1.4rem', fontWeight:900, color:'#ff8a6a', display:'block', fontFamily:'system-ui,sans-serif' }}>{replayLearn.totalReplays}</strong>
                <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>Total Replays</span>
              </div>
              <div style={{ padding:'12px 14px', borderRadius:'14px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                <strong style={{ fontSize:'1.4rem', fontWeight:900, color:'#60e09a', display:'block', fontFamily:'system-ui,sans-serif' }}>{replayLearn.totalHits}</strong>
                <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>Replay Hits</span>
              </div>
              {replayLearn.topTerm && (
                <div style={{ padding:'12px 14px', borderRadius:'14px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <strong style={{ fontSize:'14px', fontWeight:800, color:'#fff', display:'block', fontFamily:'system-ui,sans-serif' }}>{replayLearn.topTerm}</strong>
                  <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>Top Replay Term</span>
                </div>
              )}
              {replayLearn.topState && (
                <div style={{ padding:'12px 14px', borderRadius:'14px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <strong style={{ fontSize:'14px', fontWeight:800, color:'#a090ff', display:'block', fontFamily:'system-ui,sans-serif' }}>{replayLearn.topState}</strong>
                  <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>Top Replay State</span>
                </div>
              )}
              {replayLearn.termReliability.slice(0, 3).length > 0 && (
                <div style={{ padding:'12px 14px', borderRadius:'14px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', gridColumn:'span 2' }}>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)', marginBottom:'7px', fontFamily:'system-ui,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em' }}>Top Replay Terms</div>
                  <div style={{ display:'grid', gap:'5px' }}>
                    {replayLearn.termReliability.slice(0, 3).map(t => (
                      <div key={t.termLabel} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'rgba(255,255,255,0.70)' }}>
                        <span>{t.termLabel}</span>
                        <span style={{ color:'#60e09a' }}>{t.hitCount} hits · {t.states.slice(0, 3).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', gridColumn:'1/-1' }}>
                Data is capped for quota safety. Full replay analytics available via{' '}
                <Link href="/backtesting/archive" style={{ color:'#a090ff' }}>Backtest Archive</Link>.
              </div>
            </div>
          )}
        </section>

        {/* ── 9. Suggestion Support Panel ── */}
        {suggBoard.length > 0 && (
          <section className="journal-card">
            <SH title="Suggestion Support" sub="How pinned/suggested plays are backed by evidence — not manual played/won tracking" />
            <div style={{ display:'grid', gap:'7px' }}>
              {suggBoard.slice(0, 10).map((s, i) => (
                <div key={`${s.number}-${i}`} style={{ padding:'9px 12px', borderRadius:'12px',
                  background: s.tier === 'Strong Focus'
                    ? 'rgba(96,224,154,0.07)' : 'rgba(255,255,255,0.05)',
                  border:'1px solid rgba(255,255,255,0.09)',
                  display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                  <NumberChip n={s.number} game={s.gameType} />
                  <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 7px', borderRadius:'999px',
                    color: s.status === 'pinned' ? '#ff8a6a' : '#ffcc50',
                    border:`1px solid ${s.status === 'pinned' ? 'rgba(255,107,74,0.28)' : 'rgba(255,204,80,0.22)'}`,
                    background: s.status === 'pinned' ? 'rgba(255,107,74,0.14)' : 'rgba(255,204,80,0.10)' }}>
                    {s.status}
                  </span>
                  {s.isActiveNow && ACTIVE_BADGE}
                  {s.fellBeforeCount > 0 && FELL_BADGE}
                  <TierBadge tier={s.tier} />
                  <span style={{ flex:1, fontSize:'12px', color:'rgba(255,255,255,0.55)', fontStyle:'italic', minWidth:'120px' }}>{s.reason}</span>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {s.fellBeforeStates.slice(0, 4).map(st => <StateChip key={st} state={st} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 10. Recent Proof Stream ── */}
        {recentStream.length > 0 && (
          <section className="journal-card">
            <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', alignItems:'center', marginBottom:'14px' }}>
              <SH title="Recent Proof Stream" />
              <Link href="/hits" style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600 }}>All hits →</Link>
            </div>
            <div style={{ display:'grid', gap:'6px' }}>
              {recentStream.slice(0, 14).map((r: any, i: number) => {
                const num  = r.candidate ?? r.number ?? '—';
                const date = r.drawDate ?? r.draw_date ?? r.lastHitDate ?? '—';
                const gt   = r.gameType ?? r.game_type ?? 'cash3';
                const ht   = r.hitType ?? r.match_type ?? '';
                const isS  = ht === 'exact' || ht === 'straight';
                const dn   = r.dreamerName ?? '—';
                const src  = r.source ?? '';
                return (
                  <div key={i} style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', padding:'7px 10px',
                    borderRadius:'10px',
                    background: isS ? 'rgba(96,224,154,0.06)' : 'rgba(255,204,80,0.06)',
                    border:`1px solid ${isS ? 'rgba(96,224,154,0.14)' : 'rgba(255,204,80,0.14)'}` }}>
                    <NumberChip n={num} game={gt} />
                    <StateChip state={r.state ?? '—'} />
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)' }}>{r.termLabel ?? ''}</span>
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', marginLeft:'auto' }}>{dn}</span>
                    <span style={{ fontSize:'10px', fontWeight:700, color: isS ? '#60e09a' : '#ffcc50' }}>{isS ? 'Straight' : 'Boxed'}</span>
                    <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.30)', fontFamily:'monospace' }}>{date}</span>
                    {src && <span style={{ fontSize:'9px', color:'rgba(255,255,255,0.22)' }}>{src}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 11. Performance Notes ── */}
        <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7, display:'grid', gap:'4px' }}>
          <strong style={{ color:'rgba(255,255,255,0.60)', display:'block', marginBottom:'4px' }}>About this report</strong>
          <div>· Performance is based on detected dream hits, fell-before memory, replay evidence, and system suggestions. Manual played/won tracking is not available yet.</div>
          <div>· Evidence is sampled/capped for quota safety (hits: 100, fell-before: 250, windows: 50, dictionary: 500).</div>
          <div>· Run <Link href="/integrity" style={{ color:'#a090ff' }}>Integrity Console</Link> if rows look missing or evidence counts seem low.</div>
          <div>· Use Repair Hit Memory from Integrity Console only when gaps are confirmed.</div>
        </section>

      </>)}
    </div>
  );
}
