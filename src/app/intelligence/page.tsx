// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { buildGroupedTermDictionary, flattenDictionary, type PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import {
  buildGroupedWindows, buildFellIndex, buildTermConvergence,
  buildNumberConvergence, buildFocusRecs, buildBoxedSignals, buildFellProof,
} from '@/lib/intelligence/universalScope';

export default function IntelligenceHubPage() {
  const { user } = useAuth();

  // All data from server routes — no client Firestore
  const [mappingRows,       setMappingRows]       = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [activeWindows,     setActiveWindows]     = useState<any[]>([]);
  const [dreamHits,         setDreamHits]         = useState<any[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState('');
  const [quotaError,        setQuotaError]        = useState(false);
  const [pinned,            setPinned]            = useState<any[]>([]);
  const [termSearch,        setTermSearch]        = useState('');
  const [stateSearch,       setStateSearch]       = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [memRes, dreamRes, winRes, hitRes, pinRes] = await Promise.all([
          fetch(`/api/fell-before?ownerUid=${uid}&limit=100`),
          fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
          fetch(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
          fetch(`/api/dreams/hits?ownerUid=${uid}&limit=30`),
          fetch(`/api/pinned-plays?ownerUid=${uid}`),
        ]);
        const [memData, dreamData, winData, hitData, pinData] = await Promise.all([
          memRes.json(), dreamRes.json(), winRes.json(), hitRes.json(), pinRes.json(),
        ]);

        if (memData.ok)   setMappingRows(memData.rows          ?? []);
        if (dreamData.ok) setBacktestSummaries(dreamData.dreams ?? []);
        if (winData.ok)   setActiveWindows(winData.windows     ?? []);
        if (hitData.ok)   setDreamHits(hitData.hits            ?? []);
        if (pinData.ok)   setPinned(pinData.plays              ?? []);
        if ([memData, dreamData, winData, hitData].some((d: any) => d.quota)) setQuotaError(true);
      } catch (err) {
        console.error(err);
        setError('Could not load Intelligence Hub.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Intelligence pipeline — fell-before memory based
  const flat            = useMemo(() => flattenDictionary(buildGroupedTermDictionary(mappingRows)), [mappingRows]);
  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);

  // Universal Scope pipeline — active window convergence
  const today         = new Date().toISOString().slice(0, 10);
  const grouped       = useMemo(() => buildGroupedWindows(activeWindows, today),       [activeWindows, today]);
  const fellIdx       = useMemo(() => buildFellIndex(mappingRows),                     [mappingRows]);
  const termSignals   = useMemo(() => buildTermConvergence(grouped, fellIdx),          [grouped, fellIdx]);
  const numSignals    = useMemo(() => buildNumberConvergence(grouped, fellIdx, pinned),[grouped, fellIdx, pinned]);
  const boxedSignals  = useMemo(() => buildBoxedSignals(grouped, fellIdx),             [grouped, fellIdx]);
  const fellProof     = useMemo(() => buildFellProof(grouped, fellIdx),                [grouped, fellIdx]);
  const focusRecs     = useMemo(() => buildFocusRecs(numSignals, boxedSignals, fellProof, dreamHits), [numSignals, boxedSignals, fellProof, dreamHits]);

  const filteredRecords = useMemo(() => {
    return flat.filter((r: any) => {
      const tOk = termSearch.trim()  ? r.term.toLowerCase().includes(termSearch.trim().toLowerCase())  : true;
      const sOk = stateSearch.trim() ? r.state.toLowerCase().includes(stateSearch.trim().toLowerCase()) : true;
      return tOk && sOk;
    });
  }, [flat, termSearch, stateSearch]);

  const topTerms = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      if (!map.has(r.term)) map.set(r.term, { hits: 0, states: new Set(), straight: 0, boxed: 0 });
      const c = map.get(r.term);
      c.hits += r.hitCount; c.states.add(r.state);
      c.straight += r.straightCount; c.boxed += r.boxedCount;
    }
    return Array.from(map.entries())
      .map(([term, v]: any) => ({ term, hits: v.hits, stateCount: v.states.size, straight: v.straight, boxed: v.boxed }))
      .sort((a: any, b: any) => b.hits - a.hits)
      .slice(0, 12);
  }, [filteredRecords]);

  const topStates = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      if (!map.has(r.state)) map.set(r.state, { hits: 0, strength: 0 });
      const c = map.get(r.state);
      c.hits += r.hitCount; c.strength += r.stateStrengthScore;
    }
    return Array.from(map.entries())
      .map(([state, v]: any) => ({ state, hits: v.hits, strength: v.strength }))
      .sort((a: any, b: any) => b.strength - a.strength)
      .slice(0, 12);
  }, [filteredRecords]);

  const archiveTotals = useMemo(() =>
    backtestSummaries.reduce((acc: any, r: any) => {
      acc.completed++;
      acc.totalHits += Number(r.totalHits   ?? 0);
      acc.straight  += Number(r.straightHits ?? 0);
      acc.boxed     += Number(r.boxedHits    ?? 0);
      return acc;
    }, { completed: 0, totalHits: 0, straight: 0, boxed: 0 }),
    [backtestSummaries]
  );

  // Today's active windows
  const activeToday   = new Date().toISOString().slice(0, 10);
  const liveWindows   = useMemo(() =>
    activeWindows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= activeToday),
    [activeWindows, activeToday]
  );
  const recentHits    = useMemo(() =>
    [...dreamHits].sort((a, b) => String(b.draw_date ?? '').localeCompare(String(a.draw_date ?? ''))).slice(0, 5),
    [dreamHits]
  );

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Intelligence Hub</h1>
              <p>Deep pattern analysis across live dictionary memory, family intelligence, current watches, and historical backtesting.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/hot-numbers"  className="btn-secondary">Hot Families</Link>
              <Link href="/chat"         className="btn-secondary">Intelligence Chat</Link>
              <Link href="/backtesting/archive" className="btn-secondary">Backtest Archive</Link>
            </div>
          </div>
        </section>

        {/* Quick nav to intelligence layers */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { href: '/forecast-board', label: 'Forecast Board',   desc: 'Boosted state recommendations' },
            { href: '/daily-ops',      label: 'Daily Ops',        desc: 'Today\'s operational watchlist' },
            { href: '/hot-numbers',    label: 'Hot Families',     desc: 'Digit family clusters' },
            { href: '/playlists',      label: 'State Playlists',  desc: 'Per-state candidate playlists' },
            { href: '/performance',    label: 'Performance',      desc: 'System analytics' },
          ].map(({ href, label, desc }) => (
            <Link key={href} href={href} className="journal-card-flat"
              style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong style={{ fontSize: '13px' }}>{label}</strong>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '4px' }}>{desc}</div>
            </Link>
          ))}
        </section>

        {/* Filters */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="termSearch">Filter by Term</label>
            <input id="termSearch" className="journal-input" value={termSearch}
              onChange={e => setTermSearch(e.target.value)} placeholder="e.g. dancing" />
          </div>
          <div>
            <label className="journal-label" htmlFor="stateSearch">Filter by State</label>
            <input id="stateSearch" className="journal-input" value={stateSearch}
              onChange={e => setStateSearch(e.target.value)} placeholder="e.g. Georgia" />
          </div>
        </section>

        {/* System-wide stats */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            ['Live Memory Rows',    filteredRecords.length],
            ['Active Windows',      liveWindows.length],
            ['Current Dream Hits',  dreamHits.length],
            ['Families Detected',   familyAnalytics.families.length],
            ['Backtests Completed', archiveTotals.completed],
            ['Backtest Hits',       archiveTotals.totalHits],
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div className="journal-label">{label}</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </section>

        {quotaError && (
          <div style={{ padding:'12px 16px',borderRadius:'14px',border:'1px solid rgba(255,204,80,0.28)',background:'rgba(255,204,80,0.08)',color:'#ffcc50',fontSize:'13px' }}>
            ⚠ Firebase quota limit reached. Some signals may be incomplete.
          </div>
        )}
        {loading && <section className="journal-card"><p style={{ margin:0, color:'rgba(255,255,255,0.55)' }}>Loading Intelligence Hub…</p></section>}
        {error && !quotaError && <section className="journal-card-flat" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>{error}</section>}

        {/* Focus Recommendations from Universal Scope */}
        {!loading && focusRecs.length > 0 && (
          <section className="journal-card">
            <div style={{ display:'flex',justifyContent:'space-between',gap:'16px',flexWrap:'wrap',alignItems:'center',marginBottom:'14px' }}>
              <div>
                <h2 style={{ margin:0, fontSize:'1.05rem', fontWeight:900, letterSpacing:'-0.03em', fontFamily:'system-ui,sans-serif', color:'#ffffff' }}>Today's Focus Recommendations</h2>
                <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginTop:'3px' }}>Evidence-based signals from active windows, convergence, and fell-before proof</div>
              </div>
              <a href="/universal-scope" style={{ color:'#a090ff', fontSize:'12px', fontWeight:600, textDecoration:'none' }}>Open Universal Scope →</a>
            </div>
            <div style={{ display:'grid', gap:'8px' }}>
              {focusRecs.slice(0,6).map((rec: any) => (
                <div key={rec.id} style={{
                  padding:'12px 14px', borderRadius:'14px',
                  background: rec.tier === 'Strong Focus' ? 'rgba(96,224,154,0.08)' : rec.tier === 'Moderate Focus' ? 'rgba(255,204,80,0.07)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${rec.tier === 'Strong Focus' ? 'rgba(96,224,154,0.20)' : rec.tier === 'Moderate Focus' ? 'rgba(255,204,80,0.18)' : 'rgba(255,255,255,0.09)'}`,
                  display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-start',
                }}>
                  <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'1.1rem', color: rec.gameType === 'cash4' ? '#a090ff' : '#ff8a6a' }}>{rec.number}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'4px' }}>
                      <span style={{ padding:'2px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700, color: rec.tier === 'Strong Focus' ? '#60e09a' : rec.tier === 'Moderate Focus' ? '#ffcc50' : '#a090ff', border:`1px solid currentColor`, opacity:0.8 }}>{rec.tier}</span>
                      {(rec.evidenceBadges ?? []).slice(0,3).map((b: string) => (
                        <span key={b} style={{ padding:'2px 8px', borderRadius:'999px', fontSize:'10px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', color:'rgba(255,255,255,0.60)' }}>{b}</span>
                      ))}
                    </div>
                    <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', fontStyle:'italic' }}>{rec.reason}</div>
                  </div>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', fontFamily:'system-ui,sans-serif' }}>Score {rec.score}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Current watch status */}
        <section className="journal-card">
          <div className="page-header"><h1>Current Watch Status</h1><p>Active windows inside their 7-day period.</p></div>
          {liveWindows.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.55)', margin: '10px 0 0', fontSize: '13px' }}>
              No active windows. <Link href="/dreams/new" style={{ color: '#b0b8ff' }}>Add a dream →</Link>
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '6px', marginTop: '12px' }}>
              {liveWindows.slice(0, 8).map((w: any, i: number) => (
                <div key={w.id || i} className="journal-card-flat" style={{ fontSize: '12.5px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span><strong>{w.dreamerName || w.dreamerId || '—'}</strong></span>
                  <span>{w.termLabel || '—'} → <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.number || '—'}</span></span>
                  <span style={{ color: '#b0b8ff' }}>{w.gameType || '—'}</span>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{w.activeStart || w.activeWindowStart || '—'} → {w.activeEnd || w.activeWindowEnd || '—'}</span>
                  {(w.lastHitCount ?? 0) > 0 && <span style={{ color: '#6dbf8a', fontWeight: 700 }}>{w.lastHitCount} hits</span>}
                </div>
              ))}
              {liveWindows.length > 8 && (
                <Link href="/windows" className="btn-secondary" style={{ width: 'fit-content', fontSize: '12px', marginTop: '4px' }}>
                  View all {liveWindows.length} windows →
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Recent hits */}
        {recentHits.length > 0 && (
          <section className="journal-card">
            <div className="page-header"><h1>Recent Hits</h1><p>Latest confirmed current dream hits.</p></div>
            <div style={{ display: 'grid', gap: '6px', marginTop: '12px' }}>
              {recentHits.map((h: any) => (
                <div key={h.id} className="journal-card-flat" style={{ fontSize: '12.5px', display: 'flex', gap: '16px', flexWrap: 'wrap',
                  borderLeft: `3px solid ${h.match_type === 'exact' ? '#4a7c59' : '#a07c4a'}` }}>
                  <span><strong>{h.termLabel || '—'}</strong></span>
                  <span><span style={{ fontFamily: 'monospace' }}>{h.candidate || '—'}</span> → <span style={{ fontFamily: 'monospace' }}>{h.winning_number || '—'}</span></span>
                  <span style={{ color: '#b0b8ff' }}>{h.state || '—'}</span>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{h.draw_date || '—'}</span>
                  <span style={{ color: h.match_type === 'exact' ? '#6dbf8a' : '#d4a95a', fontWeight: 700 }}>
                    {h.match_type === 'exact' ? 'Straight' : 'Box'}
                  </span>
                </div>
              ))}
              <Link href="/hits" className="btn-secondary" style={{ width: 'fit-content', fontSize: '12px', marginTop: '4px' }}>
                View all hits →
              </Link>
            </div>
          </section>
        )}

        <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {/* Top live terms */}
          <section className="journal-card">
            <div className="page-header"><h1>Top Live Terms</h1><p>Most active terms in personal dictionary.</p></div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {topTerms.length ? topTerms.map((r: any, i: number) => (
                <div key={r.term} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  <strong>#{i + 1} {r.term}</strong>
                  <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.55)' }}>
                    Hits: {r.hits} · States: {r.stateCount} · Straight: {r.straight} · Boxed: {r.boxed}
                  </div>
                </div>
              )) : <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: '13px' }}>No live term data yet.</p>}
            </div>
          </section>

          {/* Top live states */}
          <section className="journal-card">
            <div className="page-header"><h1>Top Live States</h1><p>Strongest states in personal dictionary.</p></div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {topStates.length ? topStates.map((r: any, i: number) => (
                <div key={r.state} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  <strong>#{i + 1} {r.state}</strong>
                  <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.55)' }}>
                    Hits: {r.hits} · Strength: {r.strength}
                  </div>
                </div>
              )) : <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: '13px' }}>No live state data yet.</p>}
            </div>
          </section>
        </section>

        <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {/* Top families */}
          <section className="journal-card">
            <div className="page-header"><h1>Top Families</h1><p>Family clusters ranked by strength and support.</p></div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {familyAnalytics.families.slice(0, 8).map((f: any, i: number) => (
                <div key={f.familyKey} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  <strong>#{i + 1} <span style={{ fontFamily: 'monospace' }}>{f.familyKey}</span></strong>
                  <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.55)' }}>
                    Pattern: {f.patternTag} · Hits: {f.totalHits} · Strength: {f.totalStrength}
                  </div>
                  <div style={{ marginTop: '2px', color: 'rgba(255,255,255,0.55)', fontSize: '12px' }}>
                    Top State: {f.topStates[0]?.state ?? '—'} · Top Term: {f.topTerms[0]?.term ?? '—'}
                  </div>
                </div>
              ))}
              {familyAnalytics.families.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: '13px' }}>No family intelligence yet.</p>
              )}
            </div>
          </section>

          {/* Pattern groups */}
          <section className="journal-card">
            <div className="page-header"><h1>Pattern Groups</h1><p>Special family categories worth tracking.</p></div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {[
                ['Doubles',       familyAnalytics.doubles.length],
                ['Triples',       familyAnalytics.triples.length],
                ['Double-Doubles',familyAnalytics.doubleDoubles.length],
                ['All-Different', familyAnalytics.allDifferent.length],
              ].map(([label, val]) => (
                <div key={String(label)} className="journal-card-flat" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>{label}</span><strong>{val}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>

    </div>
  );
}
