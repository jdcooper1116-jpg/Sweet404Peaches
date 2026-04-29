'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildGroupedWindows, buildFellIndex, buildDreamerStream,
  buildNumberConvergence, buildBoxedSignals, buildFellProof,
  buildStateFocus, buildFocusRecs, buildScopeStats,
  type FocusTier,
} from '@/lib/intelligence/universalScope';

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50'                : '#ff9090';
  return (
    <div style={{ padding:'14px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      {isIndex && <strong>⚠ Firestore index required — </strong>}
      {isQuota && <strong>⚠ Firebase quota exhausted — </strong>}
      {!isIndex && !isQuota && <strong>⚠ Could not load data — </strong>}
      {isIndex ? 'Create the suggested index in Firebase Console, wait until active, then refresh.' : ''}
      {isQuota ? 'Read quota is temporarily exhausted. Try again after reset.' : ''}
      {!isIndex && !isQuota ? msg : ''}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ marginLeft:'8px', fontSize:'11px', opacity:0.65, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
        {open ? 'hide' : 'details'}
      </button>
      {open && <div style={{ marginTop:'6px', fontSize:'11px', fontFamily:'monospace', opacity:0.75, wordBreak:'break-all' }}>{msg}</div>}
    </div>
  );
}

// ── Visual chips ──────────────────────────────────────────────────────────────
function NumberChip({ n, game }: { n: string; game: string }) {
  const c4 = game === 'cash4';
  return (
    <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'12px', padding:'2px 7px', borderRadius:'7px',
      background: c4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
      border: `1px solid ${c4 ? 'rgba(160,144,255,0.30)' : 'rgba(255,107,74,0.30)'}`,
      color: c4 ? '#a090ff' : '#ff8a6a' }}>{n}</span>
  );
}
function StateChip({ state }: { state: string }) {
  return <span style={{ padding:'2px 7px', borderRadius:'7px', fontSize:'11px', fontWeight:800,
    background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a',
    fontFamily:'system-ui,sans-serif' }}>{state}</span>;
}
function Badge({ label }: { label: string }) {
  const colors: Record<string, [string,string,string]> = {
    'Multi-Term':    ['rgba(255,204,80,0.14)','rgba(255,204,80,0.30)','#ffcc50'],
    'Multi-Dreamer': ['rgba(160,144,255,0.14)','rgba(160,144,255,0.28)','#a090ff'],
    'Fell Before':   ['rgba(96,224,154,0.14)','rgba(96,224,154,0.28)','#60e09a'],
    'Pinned':        ['rgba(255,107,74,0.14)','rgba(255,107,74,0.30)','#ff8a6a'],
    'Suggested':     ['rgba(255,204,80,0.10)','rgba(255,204,80,0.24)','#ffcc50'],
    'Recent Hit':    ['rgba(96,224,154,0.10)','rgba(96,224,154,0.22)','#60e09a'],
  };
  const [bg, border, color] = colors[label] ?? ['rgba(255,255,255,0.07)','rgba(255,255,255,0.14)','rgba(255,255,255,0.60)'];
  return <span style={{ padding:'2px 8px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
    background:bg, border:`1px solid ${border}`, color, fontFamily:'system-ui,sans-serif', letterSpacing:'0.04em' }}>{label}</span>;
}

const TIER_COLORS: Record<FocusTier, [string, string]> = {
  'Strong Focus':        ['rgba(96,224,154,0.14)','#60e09a'],
  'Moderate Focus':      ['rgba(255,204,80,0.12)','#ffcc50'],
  'Watchlist':           ['rgba(160,144,255,0.10)','#a090ff'],
  'Needs More Evidence': ['rgba(255,255,255,0.05)','rgba(255,255,255,0.40)'],
};

function StatTile({ label, val, color }: { label: string; val: number | string; color: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.10)',
      borderRadius:'16px', padding:'14px 16px' }}>
      <strong style={{ fontSize:'1.7rem', fontWeight:900, letterSpacing:'-0.05em', display:'block',
        lineHeight:1, color, fontFamily:'system-ui,sans-serif' }}>{val}</strong>
      <span style={{ color:'rgba(255,255,255,0.40)', fontSize:'10px', fontWeight:700,
        textTransform:'uppercase', letterSpacing:'0.09em', fontFamily:'system-ui,sans-serif' }}>{label}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DailyOpsPage() {
  const { user, loading: authLoading } = useAuth();

  const [windows,   setWindows]   = useState<any[]>([]);
  const [hits,      setHits]      = useState<any[]>([]);
  const [memory,    setMemory]    = useState<any[]>([]);
  const [pinned,    setPinned]    = useState<any[]>([]);
  const [dreamers,  setDreamers]  = useState<any[]>([]);
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [engineStatus, setEngineStatus]  = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [errors,    setErrors]    = useState<string[]>([]);
  const [quotaHit,  setQuotaHit]  = useState(false);

  // Refresh Now
  const [refreshing,    setRefreshing]    = useState(false);
  const [refreshResult, setRefreshResult] = useState('');
  const [refreshErr,    setRefreshErr]    = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      setLoading(true); setErrors([]); setQuotaHit(false);
      const uid = encodeURIComponent(user.uid);
      const errs: string[] = [];

      const safe = async (url: string, fallback: any = {}) => {
        try {
          const res = await fetch(url);
          const d   = await res.json();
          if (d.quota) setQuotaHit(true);
          return d;
        } catch (e) {
          errs.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
          return fallback;
        }
      };

      const [wd, hd, md, pd, dr, prof, eng] = await Promise.all([
        safe(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
        safe(`/api/dreams/hits?ownerUid=${uid}&limit=30`),
        safe(`/api/fell-before?ownerUid=${uid}&limit=100`),
        safe(`/api/pinned-plays?ownerUid=${uid}`),
        safe(`/api/dreamers?ownerUid=${uid}&limit=100`),
        safe(`/api/owner-profile?ownerUid=${uid}`),
        safe(`/api/engine/status`),
      ]);

      if (wd.ok) setWindows(wd.windows   ?? []);
      if (hd.ok) setHits(hd.hits         ?? []);
      if (md.ok) setMemory(md.rows        ?? []);
      if (pd.ok) setPinned(pd.plays       ?? []);
      if (dr.ok) setDreamers(dr.dreamers  ?? []);
      if (prof.ok && prof.profile?.displayName) setOwnerDisplayName(prof.profile.displayName);
      if (eng.is_current !== undefined)           setEngineStatus(eng);
      if (errs.length) setErrors(errs);
      setLoading(false);
    }
    if (!authLoading) void load();
  }, [user, authLoading]);

  // ── Intelligence pipeline on capped data ─────────────────────────────────
  const today       = new Date().toISOString().slice(0, 10);
  const grouped     = useMemo(() => buildGroupedWindows(windows, today),             [windows, today]);
  const fellIdx     = useMemo(() => buildFellIndex(memory),                          [memory]);
  const dreamerStream = useMemo(() => buildDreamerStream(grouped, ownerDisplayName), [grouped, ownerDisplayName]);
  const numSignals  = useMemo(() => buildNumberConvergence(grouped, fellIdx, pinned),[grouped, fellIdx, pinned]);
  const boxedSigs   = useMemo(() => buildBoxedSignals(grouped, fellIdx),             [grouped, fellIdx]);
  const fellProof   = useMemo(() => buildFellProof(grouped, fellIdx),                [grouped, fellIdx]);
  const stateFocus  = useMemo(() => buildStateFocus(grouped, fellIdx),               [grouped, fellIdx]);
  const focusRecs   = useMemo(() => buildFocusRecs(numSignals, boxedSigs, fellProof, hits), [numSignals, boxedSigs, fellProof, hits]);
  const stats       = useMemo(() => buildScopeStats(grouped, dreamers, [], numSignals, boxedSigs, stateFocus, pinned, hits), [grouped, dreamers, numSignals, boxedSigs, stateFocus, pinned, hits]);

  function dreamerLabel(id: string, name: string) {
    return id === 'owner-self' ? (ownerDisplayName || 'Owner / Self') : (name || id);
  }

  const activePinned    = pinned.filter((p: any) => p.status === 'pinned' || p.status === 'suggested');
  const topTier         = focusRecs[0]?.tier ?? '—';
  const recentHits      = [...hits].sort((a: any, b: any) => String(b.draw_date ?? '').localeCompare(String(a.draw_date ?? ''))).slice(0, 8);
  const staleWindows    = grouped.filter(g => {
    const end = g.activeEnd;
    const daysLeft = end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000) : 99;
    return daysLeft <= 1 && daysLeft >= 0;
  });

  // ── Refresh Now ───────────────────────────────────────────────────────────
  async function handleRefresh() {
    if (!user) return;
    setRefreshing(true); setRefreshResult(''); setRefreshErr('');
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) { setRefreshErr(data.error || 'Refresh failed.'); return; }
      setRefreshResult(
        `✓ ${data.windowsChecked ?? 0} windows checked · ${data.totalNewHits ?? 0} new hits` +
        (data.engineCallsMade ? ` · ${data.engineCallsMade} engine calls` : '') +
        (data.errors?.length ? ` · ⚠ ${data.errors.length} error(s)` : '')
      );
    } catch (err) {
      setRefreshErr(err instanceof Error ? err.message : 'Refresh failed.');
    } finally { setRefreshing(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      {/* ── Header ── */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.5rem,3vw,2.1rem)', fontWeight:900, letterSpacing:'-0.04em',
              fontFamily:'system-ui,sans-serif', color:'#ffffff' }}>Daily Ops</h1>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.55)', fontSize:'14px', lineHeight:1.65, maxWidth:'600px' }}>
              Operational checklist for Sigil &amp; Slumber — active windows, strong focus plays, recent hits, and system status.
            </p>
            <div style={{ display:'flex', gap:'8px', marginTop:'10px', flexWrap:'wrap' }}>
              <span style={{ padding:'3px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                background:'rgba(96,224,154,0.10)', border:'1px solid rgba(96,224,154,0.24)', color:'#60e09a',
                fontFamily:'system-ui,sans-serif' }}>✓ Quota-safe mode</span>
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
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            <Link href="/universal-scope" className="btn-secondary" style={{ fontSize:'12px' }}>Universal Scope</Link>
            <Link href="/forecast-board"  className="btn-secondary" style={{ fontSize:'12px' }}>Forecast Board</Link>
            <Link href="/windows"         className="btn-secondary" style={{ fontSize:'12px' }}>All Windows</Link>
          </div>
        </div>
      </section>

      {/* Quota / error banners */}
      {quotaHit && <ErrorBanner msg="Firebase quota exhausted. Some data may be incomplete." />}
      {errors.length > 0 && !quotaHit && (
        <ErrorBanner msg={errors[0]} />
      )}

      {/* ── 1. Today's Ops Summary ── */}
      {!loading && (
        <section style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))' }}>
          <StatTile label="Active Windows"   val={stats.activeWindows}        color="#ff8a6a" />
          <StatTile label="Active Dreamers"  val={stats.activeDreamers}       color="#a090ff" />
          <StatTile label="Recent Hits"      val={stats.recentHits}           color="#60e09a" />
          <StatTile label="Pinned / Suggest" val={stats.suggestedPinnedPlays} color="#ffcc50" />
          <StatTile label="Watch Items"      val={stats.watchItems}           color="#ff8a6a" />
          <StatTile label="Top Focus Tier"   val={topTier}                    color={topTier === 'Strong Focus' ? '#60e09a' : topTier === 'Moderate Focus' ? '#ffcc50' : 'rgba(255,255,255,0.55)'} />
          {staleWindows.length > 0 && <StatTile label="Expiring Soon" val={staleWindows.length} color="#ffcc50" />}
        </section>
      )}

      {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading Daily Ops…</p></section>}

      {/* ── Refresh Now ── */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <strong style={{ color:'#fff', fontFamily:'system-ui,sans-serif' }}>Refresh Dream Windows</strong>
            <div style={{ marginTop:'4px', fontSize:'13px', color:'rgba(255,255,255,0.50)' }}>
              Check all active windows against the latest Lottery Engine results.
            </div>
          </div>
          <button type="button" className="btn-primary" onClick={handleRefresh}
            disabled={refreshing || !user} style={{ fontSize:'13px' }}>
            {refreshing ? 'Refreshing…' : '⚡ Refresh Now'}
          </button>
        </div>
        {refreshResult && (
          <div style={{ marginTop:'10px', fontSize:'13px', color:'#60e09a', fontWeight:600 }}>{refreshResult}</div>
        )}
        {refreshErr && <div style={{ marginTop:'10px' }}><ErrorBanner msg={refreshErr} /></div>}
      </section>

      {!loading && (<>

        {/* ── 2. Action Checklist ── */}
        <section className="journal-card">
          <h2 style={{ margin:'0 0 14px', fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>
            Action Checklist
          </h2>
          <div style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
            {[
              { href:'/windows',              label:'🔄 Refresh active windows',             done: grouped.length > 0 },
              { href:'/hits',                 label:`📍 Review ${hits.length} recent hit${hits.length !== 1 ? 's' : ''}`, done: hits.length > 0 },
              { href:'/playlists',            label:'🗺 Review State Playlists',             done: stateFocus.length > 0 },
              { href:'/hot-numbers',          label:'🔥 Review Hot Families',               done: stats.hotBoxedFamilies > 0 },
              { href:'/pinned-plays',         label:`📌 Review ${activePinned.length} pinned/suggested play${activePinned.length !== 1 ? 's' : ''}`, done: activePinned.length > 0 },
              { href:'/universal-scope',      label:'🌐 Check Universal Scope',             done: false },
              { href:'/backtesting/replay',   label:'🔬 Run Replay Lab if evidence needed', done: false },
            ].map(({ href, label, done }) => (
              <Link key={href} href={href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px',
                  borderRadius:'14px', background: done ? 'rgba(96,224,154,0.07)' : 'rgba(255,255,255,0.06)',
                  border:`1px solid ${done ? 'rgba(96,224,154,0.20)' : 'rgba(255,255,255,0.10)'}`,
                  cursor:'pointer' }}>
                  <span style={{ fontSize:'13px', fontWeight:600, color:'#fff', flex:1 }}>{label}</span>
                  <span style={{ fontSize:'11px', color: done ? '#60e09a' : 'rgba(255,255,255,0.35)' }}>
                    {done ? '● ready' : '→'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 3. Active Windows Needing Attention ── */}
        {dreamerStream.length > 0 && (
          <section className="journal-card">
            <h2 style={{ margin:'0 0 14px', fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>
              Active Windows ({dreamerStream.length})
            </h2>
            <div style={{ display:'grid', gap:'8px' }}>
              {dreamerStream.slice(0, 10).map(g => {
                const daysLeft = g.activeEnd ? Math.ceil((new Date(g.activeEnd).getTime() - Date.now()) / 86_400_000) : null;
                const isStale  = daysLeft !== null && daysLeft <= 1;
                return (
                  <div key={g.dreamEntryId} style={{ padding:'11px 14px', borderRadius:'14px',
                    background: isStale ? 'rgba(255,204,80,0.07)' : 'rgba(255,255,255,0.06)',
                    border:`1px solid ${isStale ? 'rgba(255,204,80,0.22)' : 'rgba(255,255,255,0.09)'}`,
                    display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-start' }}>
                    <div style={{ minWidth:'90px' }}>
                      <div style={{ fontSize:'13px', fontWeight:800, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
                        {dreamerLabel(g.dreamerId, g.dreamerName)}
                      </div>
                      <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', fontFamily:'monospace' }}>
                        {g.activeStart} → {g.activeEnd}
                      </div>
                      {isStale && <span style={{ fontSize:'10px', color:'#ffcc50', fontWeight:700 }}>⚠ expiring</span>}
                    </div>
                    <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:'5px', alignItems:'center' }}>
                      {g.cash3.slice(0, 5).map((n: string) => <NumberChip key={n} n={n} game="cash3" />)}
                      {g.cash4.slice(0, 3).map((n: string) => <NumberChip key={n} n={n} game="cash4" />)}
                    </div>
                    {Object.keys(g.termMap).length > 0 && (
                      <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', alignSelf:'center' }}>
                        {Object.keys(g.termMap).slice(0, 4).join(', ')}
                      </div>
                    )}
                    {g.newHits > 0 && (
                      <span style={{ fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'999px',
                        background:'rgba(255,204,80,0.14)', border:'1px solid rgba(255,204,80,0.28)', color:'#ffcc50' }}>
                        {g.newHits} new hit{g.newHits !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
              {dreamerStream.length > 10 && (
                <Link href="/windows" style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600 }}>
                  View all {dreamerStream.length} windows →
                </Link>
              )}
            </div>
          </section>
        )}

        {/* No windows */}
        {grouped.length === 0 && (
          <section className="journal-card">
            <p style={{ margin:0, color:'rgba(255,255,255,0.55)', fontSize:'13px' }}>
              No active windows. <Link href="/dreams/new" style={{ color:'#a090ff', fontWeight:600 }}>Write a dream →</Link>
            </p>
          </section>
        )}

        {/* ── 4. Strong Focus Plays ── */}
        {focusRecs.length > 0 && (
          <section className="journal-card">
            <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'center', marginBottom:'14px' }}>
              <h2 style={{ margin:0, fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>
                Strong Focus Plays
              </h2>
              <Link href="/forecast-board" style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600 }}>
                Full Forecast Board →
              </Link>
            </div>
            <div style={{ display:'grid', gap:'8px' }}>
              {focusRecs.slice(0, 6).map(rec => {
                const [tierBg, tierColor] = TIER_COLORS[rec.tier];
                return (
                  <div key={rec.id} style={{ padding:'11px 14px', borderRadius:'14px',
                    background:tierBg, border:'1px solid rgba(255,255,255,0.09)',
                    borderLeft:`4px solid ${tierColor}`, display:'flex', gap:'12px',
                    flexWrap:'wrap', alignItems:'flex-start' }}>
                    <NumberChip n={rec.number} game={rec.gameType} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'4px' }}>
                        <span style={{ padding:'2px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                          color:tierColor, border:`1px solid ${tierColor}40`, fontFamily:'system-ui,sans-serif' }}>
                          {rec.tier}
                        </span>
                        {rec.evidenceBadges.slice(0, 3).map((b: string) => <Badge key={b} label={b} />)}
                      </div>
                      <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', fontStyle:'italic' }}>{rec.reason}</div>
                      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginTop:'4px' }}>
                        {rec.states.slice(0, 4).map((s: string) => <StateChip key={s} state={s} />)}
                      </div>
                    </div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', textAlign:'right' }}>Score {rec.score}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 5. Recent Hits ── */}
        {recentHits.length > 0 && (
          <section className="journal-card">
            <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'center', marginBottom:'14px' }}>
              <h2 style={{ margin:0, fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>
                Recent Hits
              </h2>
              <Link href="/hits" style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600 }}>
                All hits →
              </Link>
            </div>
            <div style={{ display:'grid', gap:'7px' }}>
              {recentHits.map((hit: any) => {
                const isStraight = hit.match_type === 'exact' || hit.hitType === 'straight';
                const dreamerN   = hit.dreamerName || (hit.dreamerId === 'owner-self' ? (ownerDisplayName || 'Owner / Self') : hit.dreamerId || '—');
                return (
                  <div key={hit.id || `${hit.candidate}-${hit.draw_date}`}
                    style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center', padding:'9px 12px',
                      borderRadius:'12px',
                      background: isStraight ? 'rgba(96,224,154,0.07)' : 'rgba(255,204,80,0.07)',
                      border:`1px solid ${isStraight ? 'rgba(96,224,154,0.18)' : 'rgba(255,204,80,0.18)'}` }}>
                    <span style={{ fontSize:'12px', fontWeight:800, color:'#fff', minWidth:'70px' }}>{dreamerN}</span>
                    <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.60)' }}>{hit.termLabel || '—'}</span>
                    <NumberChip n={hit.candidate || hit.number || '—'} game={hit.game_type || 'cash3'} />
                    {hit.state && <StateChip state={hit.state} />}
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', marginLeft:'auto' }}>
                      {hit.draw_date || '—'}
                    </span>
                    <span style={{ fontSize:'11px', fontWeight:700, color: isStraight ? '#60e09a' : '#ffcc50' }}>
                      {isStraight ? 'Straight' : 'Boxed'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 6. System Warnings ── */}
        {(() => {
          const warnings: string[] = [];
          if (grouped.length === 0) warnings.push('No active windows. Write a dream to start watching.');
          if (activePinned.length === 0) warnings.push('No pinned or suggested plays. Visit Hot Families to promote candidates.');
          if (staleWindows.length > 0) warnings.push(`${staleWindows.length} window${staleWindows.length !== 1 ? 's' : ''} expiring within 24 hours.`);
          if (!engineStatus) warnings.push('Engine status unknown. Check Railway deployment.');
          else if (!engineStatus.is_current) warnings.push('Engine data may be stale. Check Railway deployment.');
          warnings.push('Data is capped (windows:50, hits:30, fell-before:100) to protect Firebase quota.');
          warnings.push('Older hits may lack dreamerName until a new refresh runs.');
          return (
            <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.45)', display:'grid', gap:'5px' }}>
              <div style={{ fontWeight:700, color:'rgba(255,255,255,0.60)', marginBottom:'4px', fontFamily:'system-ui,sans-serif' }}>System Notes</div>
              {warnings.map(w => <div key={w}>· {w}</div>)}
            </section>
          );
        })()}

        {/* Quick links */}
        <section style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))' }}>
          {([
            ['/windows',            'Active Windows'],
            ['/hits',               'Hits Detector'],
            ['/pinned-plays',       'Pinned Plays'],
            ['/fell-before',        'As They Fell Before'],
            ['/hot-numbers',        'Hot Families'],
            ['/playlists',          'State Playlists'],
            ['/universal-scope',    'Universal Scope'],
            ['/backtesting/intake', 'Historical Intake'],
          ] as [string, string][]).map(([href, label]) => (
            <Link key={href} href={href} className="journal-card-flat"
              style={{ textDecoration:'none', color:'rgba(255,255,255,0.70)', fontSize:'12px', fontWeight:600, display:'block' }}>
              {label}
            </Link>
          ))}
        </section>

      </>)}
    </div>
  );
}
