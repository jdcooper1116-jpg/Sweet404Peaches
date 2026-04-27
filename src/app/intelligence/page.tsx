// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { buildGroupedTermDictionary, flattenDictionary, type PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';

export default function IntelligenceHubPage() {
  const { user } = useAuth();

  // All data from server routes — no client Firestore
  const [mappingRows,       setMappingRows]       = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [activeWindows,     setActiveWindows]     = useState<any[]>([]);
  const [dreamHits,         setDreamHits]         = useState<any[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState('');
  const [termSearch,        setTermSearch]        = useState('');
  const [stateSearch,       setStateSearch]       = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [memRes, dreamRes, winRes, hitRes] = await Promise.all([
          fetch(`/api/fell-before?ownerUid=${uid}`),
          fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
          fetch(`/api/dreams/windows?ownerUid=${uid}`),
          fetch(`/api/dreams/hits?ownerUid=${uid}`),
        ]);
        const [memData, dreamData, winData, hitData] = await Promise.all([
          memRes.json(), dreamRes.json(), winRes.json(), hitRes.json(),
        ]);

        if (memData.ok)   setMappingRows(memData.rows          ?? []);
        if (dreamData.ok) setBacktestSummaries(dreamData.dreams ?? []);
        if (winData.ok)   setActiveWindows(winData.windows     ?? []);
        if (hitData.ok)   setDreamHits(hitData.hits            ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load Intelligence Hub.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Intelligence pipeline — unchanged
  const flat            = useMemo(() => flattenDictionary(buildGroupedTermDictionary(mappingRows)), [mappingRows]);
  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);

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
  const today         = new Date().toISOString().slice(0, 10);
  const liveWindows   = useMemo(() =>
    activeWindows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= today),
    [activeWindows, today]
  );
  const recentHits    = useMemo(() =>
    [...dreamHits].sort((a, b) => String(b.draw_date ?? '').localeCompare(String(a.draw_date ?? ''))).slice(0, 5),
    [dreamHits]
  );

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background:
        'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), ' +
        'radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), ' +
        'linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
    }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

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
              <div style={{ color: 'var(--ink-light)', fontSize: '11px', marginTop: '4px' }}>{desc}</div>
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

        {loading && <section className="journal-card"><p>Loading Intelligence Hub…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {/* Current watch status */}
        <section className="journal-card">
          <div className="page-header"><h1>Current Watch Status</h1><p>Active windows inside their 7-day period.</p></div>
          {liveWindows.length === 0 ? (
            <p style={{ color: 'var(--ink-light)', margin: '10px 0 0', fontSize: '13px' }}>
              No active windows. <Link href="/dreams/new" style={{ color: '#b0b8ff' }}>Add a dream →</Link>
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '6px', marginTop: '12px' }}>
              {liveWindows.slice(0, 8).map((w: any, i: number) => (
                <div key={w.id || i} className="journal-card-flat" style={{ fontSize: '12.5px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span><strong>{w.dreamerName || w.dreamerId || '—'}</strong></span>
                  <span>{w.termLabel || '—'} → <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.number || '—'}</span></span>
                  <span style={{ color: '#b0b8ff' }}>{w.gameType || '—'}</span>
                  <span style={{ color: 'var(--ink-light)' }}>{w.activeStart || w.activeWindowStart || '—'} → {w.activeEnd || w.activeWindowEnd || '—'}</span>
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
                  <span style={{ color: 'var(--ink-light)' }}>{h.draw_date || '—'}</span>
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
                  <div style={{ marginTop: '4px', color: 'var(--ink-light)' }}>
                    Hits: {r.hits} · States: {r.stateCount} · Straight: {r.straight} · Boxed: {r.boxed}
                  </div>
                </div>
              )) : <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No live term data yet.</p>}
            </div>
          </section>

          {/* Top live states */}
          <section className="journal-card">
            <div className="page-header"><h1>Top Live States</h1><p>Strongest states in personal dictionary.</p></div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {topStates.length ? topStates.map((r: any, i: number) => (
                <div key={r.state} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  <strong>#{i + 1} {r.state}</strong>
                  <div style={{ marginTop: '4px', color: 'var(--ink-light)' }}>
                    Hits: {r.hits} · Strength: {r.strength}
                  </div>
                </div>
              )) : <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No live state data yet.</p>}
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
                  <div style={{ marginTop: '4px', color: 'var(--ink-light)' }}>
                    Pattern: {f.patternTag} · Hits: {f.totalHits} · Strength: {f.totalStrength}
                  </div>
                  <div style={{ marginTop: '2px', color: 'var(--ink-light)', fontSize: '12px' }}>
                    Top State: {f.topStates[0]?.state ?? '—'} · Top Term: {f.topTerms[0]?.term ?? '—'}
                  </div>
                </div>
              ))}
              {familyAnalytics.families.length === 0 && (
                <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No family intelligence yet.</p>
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

      </section>
    </main>
  );
}
