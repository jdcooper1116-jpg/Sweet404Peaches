'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildEvidenceSummary, buildTermEvidence, buildNumberEvidence,
  buildStateEvidence, buildSuggestionEvidence, buildBoxedFamilyEvidence,
} from '@/lib/intelligence/evidenceAnalysis';

function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50' : '#ff9090';
  return (
    <div style={{ padding:'12px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      <strong>{isIndex ? '⚠ Index required — ' : isQuota ? '⚠ Quota — ' : '⚠ '}</strong>
      {isIndex ? 'Create composite index in Firebase Console, then refresh.' : isQuota ? 'Wait for quota reset.' : msg}
      <button type="button" onClick={() => setOpen(o => !o)} style={{ marginLeft:'8px', fontSize:'10px', opacity:0.6, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
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
    background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>{state}</span>;
}
function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = { 'Strong Focus':'#60e09a', 'Moderate Focus':'#ffcc50', 'Watchlist':'#a090ff', 'Needs More Evidence':'rgba(255,255,255,0.45)' };
  const c = colors[tier] ?? 'rgba(255,255,255,0.45)';
  return <span style={{ padding:'2px 8px', borderRadius:'999px', fontSize:'10px', fontWeight:700, border:`1px solid ${c}40`, color:c, fontFamily:'system-ui,sans-serif' }}>{tier}</span>;
}
function StatTile({ label, val, color }: { label: string; val: number | string; color: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'14px', padding:'12px 14px' }}>
      <strong style={{ fontSize:'1.5rem', fontWeight:900, letterSpacing:'-0.04em', display:'block', lineHeight:1, color, fontFamily:'system-ui,sans-serif' }}>{val}</strong>
      <span style={{ color:'rgba(255,255,255,0.40)', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>{label}</span>
    </div>
  );
}
function SH({ title, sub }: { title: string; sub?: string }) {
  return <div style={{ marginBottom:'14px' }}>
    <h2 style={{ margin:0, fontSize:'1.0rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>{title}</h2>
    {sub && <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginTop:'3px' }}>{sub}</div>}
  </div>;
}

const ACTIVE_BADGE = <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(255,107,74,0.14)', border:'1px solid rgba(255,107,74,0.28)', color:'#ff8a6a' }}>Active</span>;
const FELL_BADGE   = <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a' }}>Fell Before</span>;
const PINNED_BADGE = <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(255,204,80,0.14)', border:'1px solid rgba(255,204,80,0.28)', color:'#ffcc50' }}>Pinned</span>;

export default function EvidenceTrackerPage() {
  const { user, loading: authLoading } = useAuth();

  const [fell,    setFell]    = useState<any[]>([]);
  const [hits,    setHits]    = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [pinned,  setPinned]  = useState<any[]>([]);
  const [dreamers,setDreamers]= useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors,  setErrors]  = useState<string[]>([]);

  const [filterDreamer, setFilterDreamer] = useState('');
  const [filterTerm,    setFilterTerm]    = useState('');
  const [filterState,   setFilterState]   = useState('');
  const [activeOnly,    setActiveOnly]    = useState(false);

  useEffect(() => {
    if (authLoading || !user) { if (!authLoading) setLoading(false); return; }
    const uid = encodeURIComponent(user.uid);
    const errs: string[] = [];
    const safe = async (url: string) => {
      try { const r = await fetch(url); return await r.json(); }
      catch (e) { errs.push(String(e)); return {}; }
    };
    Promise.all([
      safe(`/api/fell-before?ownerUid=${uid}&limit=250`),
      safe(`/api/dreams/hits?ownerUid=${uid}&limit=100`),
      safe(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
      safe(`/api/pinned-plays?ownerUid=${uid}`),
      safe(`/api/dreamers?ownerUid=${uid}&limit=100`),
    ]).then(([fd, hd, wd, pd, dr]) => {
      if (fd.ok) setFell(fd.rows       ?? []);
      if (hd.ok) setHits(hd.hits       ?? []);
      if (wd.ok) setWindows(wd.windows  ?? []);
      if (pd.ok) setPinned(pd.plays     ?? []);
      if (dr.ok) setDreamers(dr.dreamers ?? []);
      if (errs.length) setErrors(errs);
      setLoading(false);
    });
  }, [user, authLoading]); // eslint-disable-line

  const filteredFell = useMemo(() => fell.filter(r => {
    if (filterDreamer && r.dreamerId !== filterDreamer) return false;
    if (filterTerm    && !String(r.termLabel ?? '').toLowerCase().includes(filterTerm.toLowerCase())) return false;
    if (filterState   && r.state !== filterState) return false;
    return true;
  }), [fell, filterDreamer, filterTerm, filterState]);

  const summary    = useMemo(() => buildEvidenceSummary(filteredFell, hits), [filteredFell, hits]);
  const termBoard  = useMemo(() => buildTermEvidence(filteredFell), [filteredFell]);
  const numBoard   = useMemo(() => buildNumberEvidence(filteredFell, windows, pinned), [filteredFell, windows, pinned]);
  const stateBoard = useMemo(() => buildStateEvidence(filteredFell), [filteredFell]);
  const suggBoard  = useMemo(() => buildSuggestionEvidence(pinned, filteredFell, windows), [pinned, filteredFell, windows]);
  const boxedBoard = useMemo(() => buildBoxedFamilyEvidence(filteredFell, windows, pinned), [filteredFell, windows, pinned]);

  const activeNums = useMemo(() => new Set(windows.map((w: any) => `${w.number ?? ''}::${w.gameType ?? ''}`)), [windows]);
  const allStates  = useMemo(() => [...new Set(fell.map(r => r.state).filter(Boolean))].sort(), [fell]);

  const recentStream = useMemo(() =>
    [...hits.map((h: any) => ({...h, _src:'live-dream'})), ...fell.map((r: any) => ({...r, _src:'fell-before'}))]
      .sort((a: any, b: any) => String(b.drawDate ?? b.draw_date ?? b.lastHitDate ?? '').localeCompare(String(a.drawDate ?? a.draw_date ?? a.lastHitDate ?? '')))
      .slice(0, 16),
    [hits, fell]
  );

  const displayedNumBoard = useMemo(() =>
    activeOnly ? numBoard.filter(n => activeNums.has(`${n.number}::${n.gameType}`)) : numBoard,
    [numBoard, activeOnly, activeNums]
  );

  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.4rem,3vw,2rem)', fontWeight:900, letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>
              Evidence Tracker
            </h1>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.50)', fontSize:'13px' }}>
              What the system has proven — fell-before memory, detected hits, and state playlist support.
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <Link href="/fell-before"    className="btn-secondary" style={{ fontSize:'12px' }}>As They Fell Before</Link>
            <Link href="/playlists"      className="btn-secondary" style={{ fontSize:'12px' }}>State Playlists</Link>
            <Link href="/integrity"      className="btn-secondary" style={{ fontSize:'12px' }}>Integrity Console</Link>
          </div>
        </div>
      </section>

      {errors.length > 0 && <ErrorBanner msg={errors[0]} />}

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
        <label style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'13px', color:'rgba(255,255,255,0.65)', cursor:'pointer' }}>
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Active windows only
        </label>
      </section>

      {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading evidence…</p></section>}

      {!loading && (
        <section style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))' }}>
          <StatTile label="Fell-Before Rows"   val={summary.totalFellBeforeRows} color="#60e09a" />
          <StatTile label="Detected Hits"      val={summary.totalDetectedHits}   color="#ffcc50" />
          <StatTile label="Terms with Proof"   val={summary.termsWithProof}      color="#a090ff" />
          <StatTile label="Numbers with Proof" val={summary.numbersWithProof}    color="#ff8a6a" />
          <StatTile label="States with Proof"  val={summary.statesWithProof}     color="#60e09a" />
          <StatTile label="Straight Hits"      val={summary.straightCount}       color="#60e09a" />
          <StatTile label="Boxed Hits"         val={summary.boxedCount}          color="#ffcc50" />
        </section>
      )}

      {!loading && fell.length === 0 && (
        <section className="journal-card">
          <p style={{ margin:0, color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>
            No fell-before evidence yet. Run a refresh and use the{' '}
            <Link href="/integrity" style={{ color:'#a090ff' }}>Integrity Console</Link> to promote hits.
          </p>
        </section>
      )}

      {!loading && fell.length > 0 && (
        <>
          {termBoard.length > 0 && (
            <section className="journal-card">
              <SH title="Term Evidence Board" sub="Terms with confirmed fell-before support" />
              <div style={{ display:'grid', gap:'8px' }}>
                {termBoard.slice(0, 12).map(t => (
                  <div key={t.termLabel} style={{ padding:'10px 13px', borderRadius:'13px',
                    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)',
                    display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-start' }}>
                    <div style={{ minWidth:'90px' }}>
                      <div style={{ fontSize:'13px', fontWeight:800, color:'#fff', fontFamily:'system-ui,sans-serif' }}>{t.termLabel}</div>
                      <TierBadge tier={t.tier} />
                    </div>
                    <div style={{ flex:1, display:'grid', gap:'5px' }}>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {t.numbers.slice(0,6).map(n => <NumberChip key={n} n={n} game="cash3" />)}
                      </div>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {t.states.slice(0,6).map(s => <StateChip key={s} state={s} />)}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', fontSize:'11px', color:'rgba(255,255,255,0.45)', whiteSpace:'nowrap' }}>
                      <div>{t.hitCount} hits · {t.straightCount}S / {t.boxedCount}B</div>
                      {t.strongestState && <div style={{ color:'#60e09a' }}>Best: {t.strongestState}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {displayedNumBoard.length > 0 && (
            <section className="journal-card">
              <SH title="Number Evidence Board" sub="Numbers with confirmed fell-before support" />
              <div style={{ display:'grid', gap:'7px' }}>
                {displayedNumBoard.slice(0,12).map(n => (
                  <div key={`${n.number}-${n.gameType}`} style={{ padding:'9px 12px', borderRadius:'12px',
                    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)',
                    display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                    <NumberChip n={n.number} game={n.gameType} />
                    <div style={{ flex:1, display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                      {n.isActiveNow && ACTIVE_BADGE}
                      {n.isPinned    && PINNED_BADGE}
                      {n.hitCount > 0 && FELL_BADGE}
                      <TierBadge tier={n.tier} />
                      <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)' }}>{n.terms.slice(0,3).join(', ')}</span>
                    </div>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                      {n.states.slice(0,5).map(s => <StateChip key={s} state={s} />)}
                    </div>
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', whiteSpace:'nowrap' }}>
                      {n.hitCount} hits
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stateBoard.length > 0 && (
            <section className="journal-card">
              <SH title="State Evidence Board" sub="States with the most fell-before support" />
              <div style={{ display:'grid', gap:'7px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
                {stateBoard.slice(0,10).map(s => (
                  <div key={s.state} style={{ padding:'10px 13px', borderRadius:'13px',
                    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                      <span style={{ fontWeight:900, color:'#a090ff', fontFamily:'system-ui,sans-serif' }}>{s.state}</span>
                      <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)' }}>{s.hitCount} hits</span>
                    </div>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'5px' }}>
                      {s.numbers.slice(0,5).map(n => <NumberChip key={n} n={n} game="cash3" />)}
                    </div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)' }}>{s.terms.slice(0,3).join(', ')}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {suggBoard.length > 0 && (
            <section className="journal-card">
              <SH title="Suggestion Evidence" sub="Pinned/suggested plays joined with fell-before evidence" />
              <div style={{ display:'grid', gap:'7px' }}>
                {suggBoard.slice(0,10).map((s, i) => (
                  <div key={`${s.number}-${i}`} style={{ padding:'9px 12px', borderRadius:'12px',
                    background: s.tier === 'Strong Focus' ? 'rgba(96,224,154,0.07)' : 'rgba(255,255,255,0.05)',
                    border:'1px solid rgba(255,255,255,0.09)', display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
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
                    <span style={{ flex:1, fontSize:'12px', color:'rgba(255,255,255,0.55)', fontStyle:'italic' }}>{s.reason}</span>
                    <div style={{ display:'flex', gap:'4px' }}>
                      {s.fellBeforeStates.slice(0,4).map(st => <StateChip key={st} state={st} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {boxedBoard.filter(b => b.hitCount > 1).length > 0 && (
            <section className="journal-card">
              <SH title="Boxed Family Evidence" sub="Digit families with multiple fell-before hits" />
              <div style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
                {boxedBoard.filter(b => b.hitCount > 1).slice(0,8).map(b => (
                  <div key={`${b.boxedKey}-${b.gameType}`} style={{ padding:'11px 14px', borderRadius:'14px',
                    background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'7px', flexWrap:'wrap' }}>
                      <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'1.1rem',
                        color: b.gameType === 'cash4' ? '#a090ff' : '#ff8a6a' }}>{b.boxedKey}</span>
                      {b.isActiveNow && ACTIVE_BADGE}
                      {b.isPinnedOrSuggested && PINNED_BADGE}
                    </div>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'5px' }}>
                      {b.numbers.map(n => <NumberChip key={n} n={n} game={b.gameType} />)}
                    </div>
                    <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)' }}>
                      {b.terms.slice(0,4).join(', ')}
                      <span style={{ color:'#60e09a', marginLeft:'8px' }}>{b.hitCount} hits</span>
                    </div>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginTop:'5px' }}>
                      {b.states.slice(0,5).map(s => <StateChip key={s} state={s} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="journal-card">
            <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', alignItems:'center', marginBottom:'14px' }}>
              <SH title="Recent Proof Stream" />
              <Link href="/hits" style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600 }}>All hits →</Link>
            </div>
            <div style={{ display:'grid', gap:'6px' }}>
              {recentStream.slice(0,14).map((r: any, i: number) => {
                const num  = r.candidate ?? r.number ?? '—';
                const date = r.drawDate ?? r.draw_date ?? r.lastHitDate ?? '—';
                const gt   = r.gameType ?? r.game_type ?? 'cash3';
                const ht   = r.hitType ?? r.match_type ?? '';
                const isS  = ht === 'exact' || ht === 'straight';
                return (
                  <div key={i} style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', padding:'7px 10px',
                    borderRadius:'10px', background: isS ? 'rgba(96,224,154,0.06)' : 'rgba(255,204,80,0.06)',
                    border:`1px solid ${isS ? 'rgba(96,224,154,0.14)' : 'rgba(255,204,80,0.14)'}`}}>
                    <NumberChip n={num} game={gt} />
                    <StateChip state={r.state ?? '—'} />
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)' }}>{r.termLabel ?? ''}</span>
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', marginLeft:'auto' }}>{r.dreamerName ?? '—'}</span>
                    <span style={{ fontSize:'10px', fontWeight:700, color: isS ? '#60e09a' : '#ffcc50' }}>{isS ? 'Straight' : 'Boxed'}</span>
                    <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.30)', fontFamily:'monospace' }}>{date}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7 }}>
        · Data capped: fell-before 250, hits 100, windows 50 — quota safety.
        · Evidence reflects confirmed engine hits only — not manual played/won tracking.
        · Older records without dreamerName show '—'. Run repair-hit-memory to backfill.
      </section>
    </div>
  );
}
