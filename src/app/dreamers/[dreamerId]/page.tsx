'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildGroupedWindows, buildFellIndex, buildFellProof,
  buildStateFocus, buildFocusRecs, buildNumberConvergence, buildBoxedSignals,
  type FocusTier,
} from '@/lib/intelligence/universalScope';
import {
  buildReplayLearningSummary,
} from '@/lib/intelligence/replayLearning';
import {
  annotateTermsWithFamilies,
  groupTermsBySymbolFamily,
  type SymbolFamilySignal,
} from '@/lib/intelligence/symbolFamilies';
import {
  displayDreamerName, type DisplayMode,
} from '@/lib/intelligence/communityDisplay';

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50'                : '#ff9090';
  return (
    <div style={{ padding:'13px 16px',borderRadius:'14px',border:`1px solid ${border}`,background:bg,color,fontSize:'13px',lineHeight:1.7 }}>
      {isIndex && <strong>⚠ Firestore index required — </strong>}
      {isQuota && <strong>⚠ Firebase quota exhausted — </strong>}
      {!isIndex && !isQuota && <strong>⚠ Could not load data — </strong>}
      {isIndex ? 'Create the index in Firebase Console, then refresh.' : ''}
      {isQuota ? 'Try again after quota reset.' : ''}
      {!isIndex && !isQuota ? msg : ''}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ marginLeft:'8px',fontSize:'10px',opacity:0.65,background:'none',border:'none',cursor:'pointer',color:'inherit',textDecoration:'underline' }}>
        {open ? 'hide' : 'details'}
      </button>
      {open && <div style={{ marginTop:'5px',fontSize:'10px',fontFamily:'monospace',opacity:0.7,wordBreak:'break-all' }}>{msg}</div>}
    </div>
  );
}

function NumberChip({ n, game }: { n: string; game: string }) {
  const c4 = game === 'cash4';
  return <span style={{ fontFamily:'monospace',fontWeight:700,fontSize:'12px',padding:'2px 7px',borderRadius:'7px',
    background: c4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
    border:`1px solid ${c4 ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}`,
    color: c4 ? '#a090ff' : '#ff8a6a' }}>{n}</span>;
}
function StateChip({ state }: { state: string }) {
  return <span style={{ padding:'2px 7px',borderRadius:'7px',fontSize:'11px',fontWeight:800,
    background:'rgba(96,224,154,0.12)',border:'1px solid rgba(96,224,154,0.26)',color:'#60e09a',
    fontFamily:'system-ui,sans-serif' }}>{state}</span>;
}
function Badge({ label, color = 'rgba(255,255,255,0.55)' }: { label: string; color?: string }) {
  return <span style={{ padding:'2px 8px',borderRadius:'999px',fontSize:'10px',fontWeight:700,
    background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color,
    fontFamily:'system-ui,sans-serif' }}>{label}</span>;
}
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom:'14px' }}>
      <h2 style={{ margin:0,fontSize:'1.0rem',fontWeight:900,letterSpacing:'-0.02em',fontFamily:'system-ui,sans-serif',color:'#fff' }}>{title}</h2>
      {sub && <div style={{ fontSize:'12px',color:'rgba(255,255,255,0.40)',marginTop:'3px' }}>{sub}</div>}
    </div>
  );
}
function StatTile({ label, val, color }: { label: string; val: number | string; color: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:'14px',padding:'12px 14px' }}>
      <strong style={{ fontSize:'1.5rem',fontWeight:900,letterSpacing:'-0.04em',display:'block',lineHeight:1,color,fontFamily:'system-ui,sans-serif' }}>{val}</strong>
      <span style={{ color:'rgba(255,255,255,0.40)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'system-ui,sans-serif' }}>{label}</span>
    </div>
  );
}

const TIER_COLORS: Record<FocusTier, string> = {
  'Strong Focus': '#60e09a', 'Moderate Focus': '#ffcc50',
  'Watchlist': '#a090ff',  'Needs More Evidence': 'rgba(255,255,255,0.45)',
};

export default function DreamerProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const dreamerId = String(params?.dreamerId ?? '');

  const [dreamer,   setDreamer]   = useState<any>(null);
  const [windows,   setWindows]   = useState<any[]>([]);
  const [windowsTotal, setWindowsTotal] = useState(0);
  const [memory,    setMemory]    = useState<any[]>([]);
  const [hits,      setHits]      = useState<any[]>([]);
  const [dictTerms, setDictTerms] = useState<any[]>([]);
  const [backtests, setBacktests] = useState<any[]>([]);
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [errors,    setErrors]    = useState<string[]>([]);
  const [mode]      = useState<DisplayMode>('owner'); // could add toggle later

  useEffect(() => {
    async function load() {
      if (!user || !dreamerId) { setLoading(false); return; }
      setLoading(true); setErrors([]);
      const uid = encodeURIComponent(user.uid);
      const errs: string[] = [];

      const safe = async (url: string) => {
        try { const res = await fetch(url); return await res.json(); }
        catch (e) { errs.push(String(e)); return {}; }
      };

      // All routes are capped — dreamer-scoped where possible
      const dreamerParam = dreamerId !== 'owner-self'
        ? `&dreamerId=${encodeURIComponent(dreamerId)}` : '';

      const [dr, wd, md, hd, td, bt, prof] = await Promise.all([
        // Dreamer profile: load from dreamer list and find ours
        safe(`/api/dreamers?ownerUid=${uid}&limit=100`),
        safe(`/api/dreams/window-groups?ownerUid=${uid}&limit=250${dreamerParam}`)  ,
        safe(`/api/fell-before?ownerUid=${uid}&limit=250${dreamerParam}`),
        safe(`/api/dreams/hits?ownerUid=${uid}&limit=100`),
        safe(`/api/dictionary/terms?ownerUid=${uid}&limit=200${dreamerParam}`),
        safe(`/api/backtest/list-dreams?ownerUid=${uid}`),
        safe(`/api/owner-profile?ownerUid=${uid}`),
      ]);

      // Resolve dreamer object
      if (dreamerId === 'owner-self') {
        const displayName = prof.profile?.displayName ?? 'Owner / Self';
        setDreamer({ id: 'owner-self', displayName, isOwner: true });
        setOwnerDisplayName(displayName);
      } else if (dr.ok) {
        const found = (dr.dreamers ?? []).find((d: any) => d.id === dreamerId);
        if (found) setDreamer(found);
        else errs.push(`Dreamer "${dreamerId}" not found in dreamer list.`);
        if (prof.ok && prof.profile?.displayName) setOwnerDisplayName(prof.profile.displayName);
      }

      if (wd.ok) {
        setWindows(wd.windows ?? []);
        setWindowsTotal(wd.totalActiveWindows ?? (wd.windows ?? []).length);
      }
      if (md.ok) setMemory(md.rows        ?? []);
      if (hd.ok) {
        // Filter hits to this dreamer
        const allHits = hd.hits ?? [];
        setHits(allHits.filter((h: any) =>
          (h.dreamerId ?? 'owner-self') === dreamerId
        ));
      }
      if (td.ok) setDictTerms(td.terms ?? []);
      if (bt.ok) {
        const all = bt.dreams ?? [];
        setBacktests(all.filter((b: any) =>
          (b.dreamerId ?? 'owner-self') === dreamerId
        ));
      }
      if (errs.length) setErrors(errs);
      setLoading(false);
    }
    if (!authLoading) void load();
  }, [user, authLoading, dreamerId]);

  const today      = new Date().toISOString().slice(0, 10);
  // Filter windows to this dreamer
  const myWindows  = useMemo(() =>
    windows.filter((w: any) => (w.dreamerId ?? 'owner-self') === dreamerId),
    [windows, dreamerId]
  );
  const grouped    = useMemo(() => buildGroupedWindows(myWindows, today), [myWindows, today]);
  const fellIdx    = useMemo(() => buildFellIndex(memory),                [memory]);
  const fellProof  = useMemo(() => buildFellProof(grouped, fellIdx),      [grouped, fellIdx]);
  const stateFocus = useMemo(() => buildStateFocus(grouped, fellIdx),     [grouped, fellIdx]);
  const numSigs    = useMemo(() => buildNumberConvergence(grouped, fellIdx, []), [grouped, fellIdx]);
  const boxedSigs  = useMemo(() => buildBoxedSignals(grouped, fellIdx),   [grouped, fellIdx]);
  const focusRecs  = useMemo(() => buildFocusRecs(numSigs, boxedSigs, fellProof, hits), [numSigs, boxedSigs, fellProof, hits]);
  const learning   = useMemo(() => buildReplayLearningSummary(backtests, memory), [backtests, memory]);

  // Symbol family convergence from active terms
  const activeTerms = useMemo(() => {
    const terms = new Set<string>();
    for (const g of grouped) Object.keys(g.termMap).forEach(t => terms.add(t));
    return Array.from(terms);
  }, [grouped]);
  const termAnnotated = useMemo(() => annotateTermsWithFamilies(activeTerms), [activeTerms]);
  const termSignalsForFamilies = useMemo(() =>
    Object.entries(grouped.reduce((acc: any, g) => {
      for (const [term, payload] of Object.entries(g.termMap ?? {})) {
        if (!acc[term]) acc[term] = { term, dreamerIds: [g.dreamerId], dreamerNames: [g.dreamerName], windowCount: 1, hasFellBefore: false, fellStates: [], fellHitCount: 0 };
        else acc[term].windowCount++;
      }
      return acc;
    }, {})).map(([, v]: [string, any]) => v),
    [grouped]
  );
  const symbolFamilySigs: SymbolFamilySignal[] = useMemo(() =>
    groupTermsBySymbolFamily(termSignalsForFamilies).filter(f => f.terms.length > 0),
    [termSignalsForFamilies]
  );

  const dreamerLabel = displayDreamerName(dreamerId, dreamer?.displayName ?? '', mode, undefined, ownerDisplayName);

  const matchStyle = useMemo(() => {
    const str = memory.reduce((s, r) => s + Number(r.straightCount ?? 0), 0);
    const box = memory.reduce((s, r) => s + Number(r.boxedCount    ?? 0), 0);
    const total = str + box;
    if (total === 0) return null;
    return { straight: str, boxed: box, total,
      tendency: str > box * 1.5 ? 'Straight-leaning' : box > str * 1.5 ? 'Boxed-leaning' : 'Mixed',
      pctStraight: Math.round((str / total) * 100),
      pctBoxed:    Math.round((box / total) * 100) };
  }, [memory]);

  if (!loading && !dreamer) {
    return (
      <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>
        <section className="journal-card">
          <h1 style={{ margin:0, color:'#fff', fontFamily:'system-ui,sans-serif' }}>Dreamer Not Found</h1>
          <p style={{ color:'rgba(255,255,255,0.55)', marginTop:'8px' }}>
            No dreamer found with ID "{dreamerId}".{' '}
            <Link href="/dreamers" style={{ color:'#a090ff' }}>Back to Dreamers →</Link>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      {/* ── 1. Dreamer Header ── */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
              <h1 style={{ margin:0, fontSize:'clamp(1.4rem,3vw,2rem)', fontWeight:900,
                letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>
                {loading ? '…' : dreamerLabel}
              </h1>
              {dreamer?.isOwner && (
                <span style={{ padding:'3px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                  background:'rgba(255,107,74,0.14)', border:'1px solid rgba(255,107,74,0.28)', color:'#ff8a6a',
                  fontFamily:'system-ui,sans-serif' }}>Owner / Self</span>
              )}
            </div>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.45)', fontSize:'13px' }}>
              Dreamer intelligence profile — active windows, evidence, and focus signals.
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <Link href="/dreamers"       className="btn-secondary" style={{ fontSize:'12px' }}>All Dreamers</Link>
            <Link href="/universal-scope" className="btn-secondary" style={{ fontSize:'12px' }}>Universal Scope</Link>
          </div>
        </div>
      </section>

      {errors.length > 0 && <ErrorBanner msg={errors[0]} />}

      {/* Stats */}
      {!loading && (
        <section style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))' }}>
          <StatTile label="Watch Items"  val={windowsTotal > 0 ? windowsTotal : grouped.reduce((s, g) => s + g.cash3.length + g.cash4.length, 0)}        color="#ff8a6a" />
          <StatTile label="Fell-Before Rows" val={memory.length}        color="#60e09a" />
          <StatTile label="Detected Hits"    val={hits.length}          color="#ffcc50" />
          <StatTile label="Dict Terms"       val={dictTerms.length}     color="#a090ff" />
          <StatTile label="Replay Records"   val={backtests.length}     color="#ff8a6a" />
        </section>
      )}

      {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading dreamer profile…</p></section>}

      {!loading && (<>

        {/* ── 3. Active Windows ── */}
        {grouped.length > 0 && (
          <section className="journal-card">
            <SectionHead title="Active Windows" sub="Current 7-day watch windows" />
            <div style={{ display:'grid', gap:'8px' }}>
              {grouped.slice(0, 8).map(g => (
                <div key={g.dreamEntryId} style={{ padding:'10px 13px', borderRadius:'13px',
                  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'8px', marginBottom:'6px' }}>
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', fontFamily:'monospace' }}>
                      {g.activeStart} → {g.activeEnd}
                    </span>
                    {g.newHits > 0 && (
                      <span style={{ fontSize:'10px', fontWeight:700, color:'#ffcc50' }}>{g.newHits} new hit{g.newHits !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                    {g.cash3.slice(0, 6).map(n => <NumberChip key={n} n={n} game="cash3" />)}
                    {g.cash4.slice(0, 4).map(n => <NumberChip key={n} n={n} game="cash4" />)}
                  </div>
                  {Object.keys(g.termMap).length > 0 && (
                    <div style={{ marginTop:'5px', fontSize:'11px', color:'rgba(255,255,255,0.40)' }}>
                      {Object.keys(g.termMap).slice(0, 5).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Personal Dictionary Slice ── */}
        {dictTerms.length > 0 && (
          <section className="journal-card">
            <SectionHead title="Dictionary Slice" sub={`Term-number mappings attributed to ${dreamerLabel}`} />
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
              {dictTerms.slice(0, 30).map((t: any, i: number) => (
                <div key={`${t.termLabel}-${t.number}-${i}`}
                  style={{ padding:'6px 10px', borderRadius:'10px',
                    background:'rgba(160,144,255,0.10)', border:'1px solid rgba(160,144,255,0.20)',
                    display:'flex', gap:'7px', alignItems:'center' }}>
                  <span style={{ fontSize:'12px', fontWeight:700, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
                    {t.termLabel ?? t.term ?? '—'}
                  </span>
                  <NumberChip n={t.number} game={t.gameType ?? 'cash3'} />
                </div>
              ))}
              {dictTerms.length > 30 && (
                <Link href={`/dictionary?dreamerId=${dreamerId}`}
                  style={{ fontSize:'11px', color:'#a090ff', textDecoration:'none', fontWeight:600,
                    padding:'6px 10px', borderRadius:'10px', border:'1px solid rgba(160,144,255,0.20)',
                    background:'rgba(160,144,255,0.07)' }}>
                  +{dictTerms.length - 30} more →
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ── 5. As They Fell Before ── */}
        {fellProof.length > 0 && (
          <section className="journal-card">
            <SectionHead title="As They Fell Before" sub="Confirmed hit evidence for this dreamer" />
            <div style={{ display:'grid', gap:'7px' }}>
              {fellProof.slice(0, 12).map(row => (
                <div key={`${row.term}-${row.number}-${row.gameType}`}
                  style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center', padding:'8px 11px',
                    borderRadius:'11px', background:'rgba(96,224,154,0.06)', border:'1px solid rgba(96,224,154,0.14)' }}>
                  <span style={{ fontWeight:800, fontSize:'12px', color:'#fff', minWidth:'60px',
                    fontFamily:'system-ui,sans-serif' }}>{row.term}</span>
                  <NumberChip n={row.number} game={row.gameType} />
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {row.states.slice(0, 5).map(s => <StateChip key={s} state={s} />)}
                  </div>
                  <span style={{ fontSize:'11px', color:'#60e09a', marginLeft:'auto' }}>
                    {row.hitCount} hit{row.hitCount !== 1 ? 's' : ''}
                    {row.lastHitDate ? ` · ${row.lastHitDate}` : ''}
                  </span>
                </div>
              ))}
              <Link href={`/fell-before?dreamerId=${dreamerId}`}
                style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600, marginTop:'4px' }}>
                View full memory →
              </Link>
            </div>
          </section>
        )}

        {/* ── 6 & 7. Strongest Terms + States ── */}
        {(learning.termReliability.length > 0 || learning.stateReliability.length > 0) && (
          <section style={{ display:'grid', gap:'14px', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))' }}>
            {learning.termReliability.length > 0 && (
              <div className="journal-card">
                <SectionHead title="Strongest Terms" sub="Most evidence across replays" />
                <div style={{ display:'grid', gap:'7px' }}>
                  {learning.termReliability.slice(0, 6).map(t => (
                    <div key={t.termLabel} style={{ display:'flex', justifyContent:'space-between',
                      alignItems:'center', padding:'8px 11px', borderRadius:'11px',
                      background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', gap:'8px' }}>
                      <span style={{ fontWeight:700, fontSize:'12px', color:'#fff', fontFamily:'system-ui,sans-serif' }}>
                        {t.termLabel}
                      </span>
                      <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
                        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)' }}>
                          {t.hitCount} hit{t.hitCount !== 1 ? 's' : ''} · {t.states.length} state{t.states.length !== 1 ? 's' : ''}
                        </span>
                        <span style={{ fontSize:'10px', color:TIER_COLORS[t.confidenceTier], fontWeight:700 }}>
                          {t.confidenceTier}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {learning.stateReliability.length > 0 && (
              <div className="journal-card">
                <SectionHead title="Strongest States" sub="States with most evidence" />
                <div style={{ display:'grid', gap:'7px' }}>
                  {learning.stateReliability.slice(0, 6).map(s => (
                    <div key={s.state} style={{ display:'flex', justifyContent:'space-between',
                      alignItems:'center', padding:'8px 11px', borderRadius:'11px',
                      background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', gap:'8px' }}>
                      <StateChip state={s.state} />
                      <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.45)' }}>
                        {s.hitCount} hit{s.hitCount !== 1 ? 's' : ''} · {s.topTerms.slice(0, 2).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── 8. Match Style ── */}
        {matchStyle && (
          <section className="journal-card">
            <SectionHead title="Match Style" sub="Straight vs boxed hit tendency" />
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ fontSize:'1.1rem', fontWeight:900, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
                {matchStyle.tendency}
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <Badge label={`${matchStyle.pctStraight}% straight`} color="#60e09a" />
                <Badge label={`${matchStyle.pctBoxed}% boxed`}      color="#ffcc50" />
              </div>
              <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.45)' }}>
                {matchStyle.straight} straight · {matchStyle.boxed} boxed · {matchStyle.total} total
              </span>
            </div>
          </section>
        )}

        {/* ── 9. Replay Evidence ── */}
        {backtests.length > 0 && (
          <section className="journal-card">
            <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'center', marginBottom:'14px' }}>
              <SectionHead title="Replay Evidence" sub={`${backtests.length} historical replay${backtests.length !== 1 ? 's' : ''}`} />
              <Link href="/backtesting/archive" style={{ color:'#a090ff', fontSize:'12px', textDecoration:'none', fontWeight:600 }}>
                View Archive →
              </Link>
            </div>
            <div style={{ display:'grid', gap:'7px' }}>
              {backtests.slice(0, 6).map((b: any) => (
                <div key={b.id ?? b.backtestDreamId}
                  style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center', padding:'8px 11px',
                    borderRadius:'11px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}>
                  <span style={{ fontFamily:'monospace', fontSize:'11px', color:'rgba(255,255,255,0.40)' }}>
                    {b.dreamDate ?? '—'}
                  </span>
                  {b.totalHits !== undefined && (
                    <span style={{ fontSize:'12px', fontWeight:700, color:'#ffcc50' }}>
                      {b.totalHits} hit{b.totalHits !== 1 ? 's' : ''}
                    </span>
                  )}
                  {b.bestState && <StateChip state={b.bestState} />}
                  {b.bestTerm && (
                    <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.50)' }}>{b.bestTerm}</span>
                  )}
                  {b.status && (
                    <span style={{ fontSize:'10px', fontWeight:700, color: b.status.includes('complete') ? '#60e09a' : 'rgba(255,255,255,0.40)', marginLeft:'auto' }}>
                      {b.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 10. Current Focus Signals ── */}
        {focusRecs.length > 0 && (
          <section className="journal-card">
            <SectionHead title="Current Focus" sub="Active signals for this dreamer" />
            <div style={{ display:'grid', gap:'8px' }}>
              {focusRecs.slice(0, 6).map(rec => (
                <div key={rec.id} style={{ padding:'10px 13px', borderRadius:'13px',
                  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)',
                  borderLeft:`4px solid ${TIER_COLORS[rec.tier]}`,
                  display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'flex-start' }}>
                  <NumberChip n={rec.number} game={rec.gameType} />
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:'10px', fontWeight:700, color:TIER_COLORS[rec.tier], fontFamily:'system-ui,sans-serif' }}>
                      {rec.tier}
                    </span>
                    <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', fontStyle:'italic', marginTop:'2px' }}>
                      {rec.reason}
                    </div>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginTop:'4px' }}>
                      {rec.states.slice(0, 4).map(s => <StateChip key={s} state={s} />)}
                    </div>
                  </div>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.30)' }}>Score {rec.score}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Symbol Family Convergence (if active terms exist) */}
        {symbolFamilySigs.filter(f => f.terms.length > 1).length > 0 && (
          <section className="journal-card">
            <SectionHead title="Symbol Family Themes" sub="Related symbols active in current windows" />
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {symbolFamilySigs.filter(f => f.terms.length > 1).slice(0, 6).map(f => (
                <div key={f.familyName} style={{ padding:'8px 12px', borderRadius:'12px',
                  background:`${f.familyColor}14`, border:`1px solid ${f.familyColor}30`,
                  display:'grid', gap:'3px' }}>
                  <span style={{ fontSize:'12px', fontWeight:800, color:f.familyColor,
                    fontFamily:'system-ui,sans-serif' }}>{f.familyName}</span>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)' }}>
                    {f.terms.slice(0, 4).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* No data notice */}
        {grouped.length === 0 && memory.length === 0 && dictTerms.length === 0 && (
          <section className="journal-card">
            <p style={{ margin:0, color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>
              No signals found for {dreamerLabel} yet. Write a dream for this dreamer and run a refresh to build their intelligence profile.
            </p>
            <div style={{ display:'flex', gap:'10px', marginTop:'12px', flexWrap:'wrap' }}>
              <Link href="/dreams/new" className="btn-primary"  style={{ fontSize:'13px' }}>Write a Dream</Link>
              <Link href="/dreamers"   className="btn-secondary" style={{ fontSize:'13px' }}>Back to Dreamers</Link>
            </div>
          </section>
        )}

      </>)}
    </div>
  );
}
