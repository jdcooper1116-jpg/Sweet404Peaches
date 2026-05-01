'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';

function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50' : '#ff9090';
  return (
    <div style={{ padding:'12px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      <strong>{isIndex ? '⚠ ' : isQuota ? '⚠ Quota — ' : '⚠ '}</strong>
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
  return <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'11px', padding:'2px 6px', borderRadius:'6px',
    background: c4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
    border:`1px solid ${c4 ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}`,
    color: c4 ? '#a090ff' : '#ff8a6a' }}>{n}</span>;
}
function StateChip({ state }: { state: string }) {
  return <span style={{ padding:'2px 6px', borderRadius:'6px', fontSize:'10px', fontWeight:800,
    background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>{state}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const done = status.includes('complete');
  return <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700,
    background: done ? 'rgba(96,224,154,0.12)' : 'rgba(255,204,80,0.10)',
    border:`1px solid ${done ? 'rgba(96,224,154,0.26)' : 'rgba(255,204,80,0.22)'}`,
    color: done ? '#60e09a' : '#ffcc50' }}>{done ? 'Replayed' : status || 'Pending'}</span>;
}

export default function BacktestArchivePage() {
  const { user, loading: authLoading } = useAuth();

  const [dreams,   setDreams]   = useState<any[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Filters
  const [filterDreamer, setFilterDreamer] = useState('');
  const [filterTerm,    setFilterTerm]    = useState('');
  const [filterState,   setFilterState]   = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');

  // Expanded cards for evidence preview
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // fellBeforeConfirmed: maps backtestDreamId → true (has personalHitMappings) | false (checked, none) | null (not checked)
  const [fellBeforeConfirmed, setFellBeforeConfirmed] = useState<Record<string, boolean | null>>({});

  useEffect(() => {
    if (authLoading || !user) { if (!authLoading) setLoading(false); return; }
    const uid = encodeURIComponent(user.uid);
    Promise.all([
      fetch(`/api/backtest/list-dreams?ownerUid=${uid}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/dreamers?ownerUid=${uid}&limit=100`).then(r => r.json()).catch(() => ({})),
    ]).then(([dd, dr]) => {
      if (dd.ok) setDreams(dd.dreams ?? []);
      if (dr.ok) setDreamers(dr.dreamers ?? []);
      if (!dd.ok) setError(dd.error ?? 'Could not load archive.');
      setLoading(false);
    });
  }, [user, authLoading]); // eslint-disable-line

  async function loadDetail(dreamId: string, ownerUid: string) {
    if (expandedId === dreamId) { setExpandedId(null); setExpandedDetail(null); return; }
    setExpandedId(dreamId);
    setDetailLoading(true);
    try {
      const uid = encodeURIComponent(ownerUid);
      // Load dream detail and check real fell-before evidence simultaneously
      const [detailRes, fellRes] = await Promise.all([
        fetch(`/api/backtest/dream-detail?ownerUid=${uid}&backtestDreamId=${encodeURIComponent(dreamId)}`),
        fetch(`/api/fell-before?ownerUid=${uid}&backtestDreamId=${encodeURIComponent(dreamId)}&limit=5`),
      ]);
      const detail = await detailRes.json();
      const fell   = await fellRes.json().catch(() => ({ ok: false, count: 0 }));
      setExpandedDetail(detail.ok ? detail : null);
      // Only show Fell-Before Saved badge if personalHitMappings actually has rows
      setFellBeforeConfirmed(prev => ({ ...prev, [dreamId]: fell.ok && (fell.count ?? 0) > 0 }));
    } catch { setExpandedDetail(null); }
    finally { setDetailLoading(false); }
  }

  const allStates    = useMemo(() => {
    const s = new Set<string>();
    dreams.forEach(d => (d.uniqueStates ?? []).forEach((st: string) => s.add(st)));
    return [...s].sort();
  }, [dreams]);

  const allTerms     = useMemo(() => {
    const t = new Set<string>();
    dreams.forEach(d => (d.parsedTermMappings ?? []).forEach((m: any) => t.add(String(m.term ?? '').toLowerCase())));
    return [...t].sort();
  }, [dreams]);

  const filtered = useMemo(() => dreams.filter(d => {
    if (filterDreamer && (d.dreamerId ?? 'owner-self') !== filterDreamer) return false;
    if (filterTerm) {
      const terms = (d.parsedTermMappings ?? []).map((m: any) => String(m.term ?? '').toLowerCase());
      if (!terms.some((t: string) => t.includes(filterTerm.toLowerCase()))) return false;
    }
    if (filterState) {
      if (!(d.uniqueStates ?? []).includes(filterState)) return false;
    }
    if (filterStatus) {
      if (filterStatus === 'replayed' && !String(d.status ?? '').includes('complete')) return false;
      if (filterStatus === 'pending'  && String(d.status ?? '').includes('complete'))  return false;
    }
    return true;
  }), [dreams, filterDreamer, filterTerm, filterState, filterStatus]);

  const totalReplayed = dreams.filter(d => String(d.status ?? '').includes('complete')).length;
  const totalHits     = dreams.reduce((s, d) => s + Number(d.totalHits ?? 0), 0);
  const uniqueDreamers= new Set(dreams.map(d => d.dreamerId ?? 'owner-self')).size;

  const dreamerName = (id: string, storedName: string) => {
    if (storedName) return storedName;
    const found = dreamers.find((d: any) => d.id === id);
    return found?.displayName ?? id;
  };

  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.4rem,3vw,2rem)', fontWeight:900, letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>
              Backtest Archive
            </h1>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.50)', fontSize:'13px' }}>
              Historical dream test records with replay evidence and dreamer attribution.
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <Link href="/backtesting/intake"  className="btn-primary"   style={{ fontSize:'12px' }}>+ New Intake</Link>
            <Link href="/backtesting/replay"  className="btn-secondary" style={{ fontSize:'12px' }}>Replay Lab</Link>
            <Link href="/backtesting/evidence" className="btn-secondary" style={{ fontSize:'12px' }}>Evidence Tracker</Link>
          </div>
        </div>
      </section>

      {error && <ErrorBanner msg={error} />}

      {/* Archive Summary */}
      {!loading && (
        <section style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))' }}>
          {[
            { label:'Total Records',  val:dreams.length,   color:'#a090ff' },
            { label:'Replayed',       val:totalReplayed,   color:'#60e09a' },
            { label:'Pending Replay', val:dreams.length - totalReplayed, color:'#ffcc50' },
            { label:'Total Hits',     val:totalHits,       color:'#ff8a6a' },
            { label:'Dreamers',       val:uniqueDreamers,  color:'#a090ff' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'14px', padding:'12px 14px' }}>
              <strong style={{ fontSize:'1.5rem', fontWeight:900, letterSpacing:'-0.04em', display:'block', lineHeight:1, color, fontFamily:'system-ui,sans-serif' }}>{val}</strong>
              <span style={{ color:'rgba(255,255,255,0.40)', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>{label}</span>
            </div>
          ))}
        </section>
      )}

      {/* Filters */}
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
        <select className="journal-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="replayed">Replayed</option>
          <option value="pending">Pending Replay</option>
        </select>
      </section>

      {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading archive…</p></section>}

      {!loading && filtered.length === 0 && (
        <section className="journal-card">
          <p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>
            No records found.{' '}
            <Link href="/backtesting/intake" style={{ color:'#a090ff' }}>Start a historical dream intake →</Link>
          </p>
        </section>
      )}

      {/* Archive Cards */}
      {!loading && filtered.length > 0 && (
        <section style={{ display:'grid', gap:'12px' }}>
          {filtered.slice(0, 30).map(dream => {
            const did    = dream.id ?? dream.backtestDreamId ?? '';
            const dn     = dreamerName(dream.dreamerId ?? 'owner-self', dream.dreamerName ?? '');
            const terms  = (dream.parsedTermMappings ?? []).map((m: any) => String(m.term ?? '').toLowerCase()).filter(Boolean);
            const cash3  = (dream.parsedTermMappings ?? []).flatMap((m: any) => m.cash3Numbers ?? []).slice(0, 6);
            const cash4  = (dream.parsedTermMappings ?? []).flatMap((m: any) => m.cash4Numbers ?? []).slice(0, 4);
            const states = (dream.uniqueStates ?? []).slice(0, 6);
            const hits   = Number(dream.totalHits ?? 0);
            const isExpanded = expandedId === did;
            const replayed = String(dream.status ?? '').includes('complete');

            return (
              <div key={did} style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'20px', padding:'16px 18px', display:'grid', gap:'10px' }}>

                {/* Card header */}
                <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', alignItems:'flex-start' }}>
                  <div style={{ display:'flex', gap:'10px', alignItems:'flex-start', flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:'14px', fontWeight:800, color:'#fff', fontFamily:'system-ui,sans-serif' }}>{dn}</div>
                      <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', fontFamily:'monospace', marginTop:'2px' }}>
                        {dream.dreamDate ?? '—'} → {dream.activeWindowEnd ?? dream.activeWindowStart ?? '—'}
                      </div>
                    </div>
                    <StatusBadge status={dream.status ?? 'intake-saved'} />
                  </div>
                  <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                    {hits > 0 && (
                      <span style={{ fontSize:'12px', fontWeight:700, color:'#60e09a' }}>{hits} hit{hits !== 1 ? 's' : ''}</span>
                    )}
                    {dream.bestState && <StateChip state={dream.bestState} />}
                    <button type="button" onClick={() => user && loadDetail(did, user.uid)}
                      style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'8px', background:'rgba(160,144,255,0.14)', border:'1px solid rgba(160,144,255,0.26)', color:'#a090ff', cursor:'pointer' }}>
                      {isExpanded ? 'Close ↑' : 'Details ↓'}
                    </button>
                  </div>
                </div>

                {/* Terms */}
                {terms.length > 0 && (
                  <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', fontFamily:'system-ui,sans-serif', marginRight:'3px' }}>TERMS</span>
                    {terms.slice(0, 6).map((t: string) => (
                      <span key={t} style={{ padding:'2px 8px', borderRadius:'7px', fontSize:'11px', fontWeight:700, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.80)' }}>{t}</span>
                    ))}
                  </div>
                )}

                {/* Numbers */}
                {(cash3.length > 0 || cash4.length > 0) && (
                  <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', fontFamily:'system-ui,sans-serif', marginRight:'3px' }}>NUMBERS</span>
                    {cash3.map((n: string) => <NumberChip key={n} n={n} game="cash3" />)}
                    {cash4.map((n: string) => <NumberChip key={n} n={n} game="cash4" />)}
                  </div>
                )}

                {/* States */}
                {states.length > 0 && (
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', fontFamily:'system-ui,sans-serif', marginRight:'3px' }}>STATES</span>
                    {states.map((s: string) => <StateChip key={s} state={s} />)}
                  </div>
                )}

                {/* Evidence preview badges */}
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                  {dream.parsedTermMappings?.length > 0 && (
                    <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(160,144,255,0.12)', border:'1px solid rgba(160,144,255,0.24)', color:'#a090ff' }}>Dictionary Saved</span>
                  )}
                  {hits > 0 && (
                    <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.24)', color:'#60e09a' }}>Replay Evidence</span>
                  )}
                  {fellBeforeConfirmed[did] === true && (
                    <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(96,224,154,0.09)', border:'1px solid rgba(96,224,154,0.18)', color:'#60e09a' }}>Fell-Before Saved</span>
                  )}
                  {hits > 0 && fellBeforeConfirmed[did] !== true && (
                    <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(255,204,80,0.09)', border:'1px solid rgba(255,204,80,0.18)', color:'#ffcc50' }}>
                      {fellBeforeConfirmed[did] === false ? 'Memory Gap' : 'Replay Evidence'}
                    </span>
                  )}
                  {!replayed && (
                    <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:700, background:'rgba(255,204,80,0.10)', border:'1px solid rgba(255,204,80,0.22)', color:'#ffcc50' }}>Needs Replay</span>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop:'1px solid rgba(255,255,255,0.09)', paddingTop:'10px', marginTop:'2px' }}>
                    {detailLoading && <div style={{ color:'rgba(255,255,255,0.45)', fontSize:'12px' }}>Loading detail…</div>}
                    {!detailLoading && expandedDetail && (
                      <div style={{ display:'grid', gap:'8px' }}>
                        {(expandedDetail.hits ?? []).slice(0, 6).map((h: any, i: number) => {
                          const num  = h.number ?? h.candidate ?? '—';
                          const gt   = h.gameType ?? h.game_type ?? 'cash3';
                          const isS  = (h.hitType ?? h.match_type ?? '') === 'exact' || (h.hitType ?? '') === 'straight';
                          return (
                            <div key={i} style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', padding:'6px 9px', borderRadius:'9px',
                              background: isS ? 'rgba(96,224,154,0.07)' : 'rgba(255,204,80,0.06)',
                              border:`1px solid ${isS ? 'rgba(96,224,154,0.14)' : 'rgba(255,204,80,0.14)'}` }}>
                              <NumberChip n={num} game={gt} />
                              <StateChip state={h.state ?? '—'} />
                              <span style={{ fontSize:'10px', fontWeight:700, color: isS ? '#60e09a' : '#ffcc50' }}>{isS ? 'Straight' : 'Boxed'}</span>
                              <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)', fontFamily:'monospace' }}>{h.drawDate ?? h.draw_date ?? '—'}</span>
                              <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)' }}>{h.winningNumber ?? h.winning_number ?? ''}</span>
                            </div>
                          );
                        })}
                        {(expandedDetail.hits ?? []).length === 0 && (
                          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.45)' }}>No hit detail available. Run engine replay from the Replay Lab.</div>
                        )}
                        <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
                          <Link href={`/backtesting/replay`} className="btn-secondary" style={{ fontSize:'11px' }}>Open in Replay Lab →</Link>
                        </div>
                      </div>
                    )}
                    {!detailLoading && !expandedDetail && (
                      <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.45)' }}>Detail not available. Try the Replay Lab for this dream.</div>
                    )}
                    {!detailLoading && expandedId && fellBeforeConfirmed[expandedId] === false && (
                      <div style={{ marginTop:'8px', padding:'8px 12px', borderRadius:'11px', background:'rgba(255,204,80,0.07)', border:'1px solid rgba(255,204,80,0.18)', fontSize:'12px', color:'#ffcc50', lineHeight:1.6 }}>
                        ⚠ No fell-before memory for this replay. Use <a href='/integrity' style={{ color:'#a090ff' }}>Integrity Console</a> → repair-backtest-memory to promote hits.
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}
          {filtered.length > 30 && (
            <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', textAlign:'center' }}>
              Showing 30 of {filtered.length}. Use filters to narrow results.
            </div>
          )}
        </section>
      )}

      <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7 }}>
        · Backtesting evidence feeds both the Universal Dream Dictionary and each dreamer's As They Fell Before memory.
        · Click "Details" to load hit preview for a dream (fetches dream-detail route on demand).
        · Run engine replay in Replay Lab to generate evidence for pending records.
      </section>
    </div>
  );
}
