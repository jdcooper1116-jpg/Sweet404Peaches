// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildGroupedTermDictionary, flattenDictionary } from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { buildEvidencePromotionModel } from '@/lib/intelligence/evidencePromotion';
import PageIntro from '@/components/ui/PageIntro';

export default function BacktestingEvidencePage() {
  const { user } = useAuth();

  const [mappingRows,       setMappingRows]       = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [termSearch, setTermSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [memRes, dreamRes] = await Promise.all([
          fetch(`/api/fell-before?ownerUid=${uid}`),
          fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
        ]);
        const [memData, dreamData] = await Promise.all([memRes.json(), dreamRes.json()]);
        if (memData.ok)   setMappingRows(memData.rows          ?? []);
        if (dreamData.ok) setBacktestSummaries(dreamData.dreams ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load Evidence Rules data.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  const flat            = useMemo(() => flattenDictionary(buildGroupedTermDictionary(mappingRows)), [mappingRows]);
  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);
  const promotionModel  = useMemo(() =>
    buildEvidencePromotionModel({ liveRows: flat, backtestSummaries, familyAnalytics }),
    [flat, backtestSummaries, familyAnalytics]
  );

  const filteredTerms  = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    return q ? promotionModel.termCandidates.filter(r => r.term.toLowerCase().includes(q)) : promotionModel.termCandidates;
  }, [promotionModel.termCandidates, termSearch]);

  const filteredCombos = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    return q ? promotionModel.comboCandidates.filter((r: any) =>
      r.term.toLowerCase().includes(q) || r.number.toLowerCase().includes(q) || r.state.toLowerCase().includes(q)
    ) : promotionModel.comboCandidates;
  }, [promotionModel.comboCandidates, termSearch]);

  // Backtest aggregate stats
  const btStats = useMemo(() =>
    backtestSummaries.reduce((acc: any, r: any) => {
      acc.count++;
      acc.hits     += Number(r.totalHits   ?? 0);
      acc.straight += Number(r.straightHits ?? 0);
      acc.boxed    += Number(r.boxedHits    ?? 0);
      return acc;
    }, { count: 0, hits: 0, straight: 0, boxed: 0 }),
    [backtestSummaries]
  );

  const bestStates = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of backtestSummaries) {
      if (b.bestState) map.set(b.bestState, (map.get(b.bestState) ?? 0) + Number(b.totalHits ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [backtestSummaries]);

  const bestTerms = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of backtestSummaries) {
      if (b.bestTerm) map.set(b.bestTerm, (map.get(b.bestTerm) ?? 0) + Number(b.totalHits ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [backtestSummaries]);

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>
        <PageIntro title="Evidence Tracker"
          description="Historical backtest performance + weighted promotion engine for Universal and Personal Dictionary learning."
          actions={[
            { href: '/backtesting/archive', label: 'Backtest Archive' },
            { href: '/forecast-board',      label: 'Forecast Board'  },
            { href: '/chat',                label: 'Intelligence Chat'},
          ]}
        />

        {/* Filter + stat tiles */}
        <section style={{ display:'grid',gap:'14px',gridTemplateColumns:'1.2fr repeat(4,minmax(160px,1fr))' }}>
          <div className="journal-card-flat">
            <label className="journal-label" htmlFor="termSearch">Filter Candidates</label>
            <input id="termSearch" className="journal-input" value={termSearch}
              onChange={e => setTermSearch(e.target.value)} placeholder="term, number, or state" />
          </div>
          {[
            ['Backtests',       btStats.count],
            ['Backtest Hits',   btStats.hits],
            ['Universal Ready', promotionModel.summary.universalReady],
            ['Personal Ready',  promotionModel.summary.personalReady],
          ].map(([label, val]) => (
            <div key={String(label)} className="stat-tile">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{val}</div>
            </div>
          ))}
        </section>

        {loading && <section className="journal-card"><p>Loading Evidence Tracker…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor:'rgba(255,85,85,0.28)',background:'rgba(255,85,85,0.10)',color:'#ff9090' }}>{error}</section>}

        {/* Historical performance */}
        <section style={{ display:'grid',gap:'20px',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))' }}>
          <section className="journal-card">
            <div className="page-header"><h1>Backtest Performance</h1><p>Engine-backed historical replay results.</p></div>
            <div style={{ display:'grid',gap:'8px',marginTop:'12px' }}>
              {[
                ['Completed Backtests', btStats.count],
                ['Total Hits',          btStats.hits],
                ['Straight Hits',       btStats.straight],
                ['Boxed Hits',          btStats.boxed],
              ].map(([label, val]) => (
                <div key={String(label)} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                  <span>{label}</span><strong>{val}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header"><h1>Best States</h1><p>States with most backtest hits.</p></div>
            {bestStates.length > 0 ? (
              <div style={{ display:'grid',gap:'6px',marginTop:'12px' }}>
                {bestStates.map(([state, hits], i) => (
                  <div key={state} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                    <span>#{i+1} <strong>{state}</strong></span>
                    <span style={{ color:'#6dbf8a',fontWeight:700 }}>{hits} hits</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color:'var(--ink-light)',margin:'10px 0 0',fontSize:'13px' }}>No backtest state data yet.</p>}
          </section>

          <section className="journal-card">
            <div className="page-header"><h1>Best Terms</h1><p>Terms with most backtest hits.</p></div>
            {bestTerms.length > 0 ? (
              <div style={{ display:'grid',gap:'6px',marginTop:'12px' }}>
                {bestTerms.map(([term, hits], i) => (
                  <div key={term} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                    <span>#{i+1} <strong>{term}</strong></span>
                    <span style={{ color:'#d4a95a',fontWeight:700 }}>{hits} hits</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color:'var(--ink-light)',margin:'10px 0 0',fontSize:'13px' }}>No backtest term data yet.</p>}
          </section>
        </section>

        {/* Promotion model */}
        <section className="journal-card">
          <div className="page-header"><h1>Promotion Logic</h1><p>How evidence is weighted for dictionary strengthening.</p></div>
          <div className="metric-row" style={{ marginTop:'12px' }}>
            {[
              'Universal Dictionary score = hits + state spread + straight/boxed weight + repeated backtest term support + family support.',
              'Personal Dictionary score = hit count + straight weight + state strength + repeated backtest state + recency + family support.',
              'Straight hits carry more evidentiary weight than boxed hits.',
              'Repeated best-term and best-state backtest signals increase live promotion strength.',
              'Family repetition adds extra support when boxed relatives keep appearing.',
            ].map(item => <div key={item} className="journal-card-flat surface-accent" style={{ fontSize:'13px' }}>{item}</div>)}
          </div>
        </section>

        <section style={{ display:'grid',gap:'20px',gridTemplateColumns:'1fr 1fr' }}>
          <section className="journal-card">
            <div className="page-header"><h1>Universal Dictionary Candidates</h1><p>Terms strongest for universal promotion.</p></div>
            <div className="metric-row" style={{ marginTop:'12px' }}>
              {filteredTerms.slice(0, 12).map((row: any) => (
                <div key={row.term} className="journal-card-flat" style={{ fontSize:'13px' }}>
                  <div style={{ display:'grid',gap:'6px',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))' }}>
                    <div><strong>Term:</strong> {row.term}</div>
                    <div><strong>Tier:</strong> {row.promotionTier}</div>
                    <div><strong>Score:</strong> {row.promotionScore}</div>
                    <div><strong>Hits:</strong> {row.totalHits}</div>
                    <div><strong>States:</strong> {row.stateCount}</div>
                  </div>
                </div>
              ))}
              {!filteredTerms.length && <p style={{ color:'var(--ink-light)',margin:0,fontSize:'13px' }}>No universal candidates yet.</p>}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header"><h1>Personal Dictionary Candidates</h1><p>State combos strongest for personal promotion.</p></div>
            <div className="metric-row" style={{ marginTop:'12px' }}>
              {filteredCombos.slice(0, 15).map((row: any, i: number) => (
                <div key={`${row.term}-${row.number}-${row.state}-${i}`} className="journal-card-flat" style={{ fontSize:'13px' }}>
                  <div style={{ display:'grid',gap:'6px',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))' }}>
                    <div><strong>Term:</strong> {row.term}</div>
                    <div><strong>Number:</strong> <span style={{ fontFamily:'monospace' }}>{row.number}</span></div>
                    <div><strong>State:</strong> {row.state}</div>
                    <div><strong>Tier:</strong> {row.promotionTier}</div>
                    <div><strong>Score:</strong> {row.promotionScore}</div>
                  </div>
                </div>
              ))}
              {!filteredCombos.length && <p style={{ color:'var(--ink-light)',margin:0,fontSize:'13px' }}>No personal candidates yet.</p>}
            </div>
          </section>
        </section>
    </div>
  );
}
