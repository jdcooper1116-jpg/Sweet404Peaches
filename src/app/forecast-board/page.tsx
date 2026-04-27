// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildGroupedTermDictionary, flattenDictionary } from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { applyBacktestLearningBoost } from '@/lib/intelligence/evidencePromotion';
import PageIntro from '@/components/ui/PageIntro';

export default function ForecastBoardPage() {
  const { user } = useAuth();

  // All data loaded from server routes — no client Firestore
  const [mappingRows,       setMappingRows]       = useState<PersonalMappingRow[]>([]);
  const [activeWindows,     setActiveWindows]      = useState<any[]>([]);
  const [dreamHits,         setDreamHits]          = useState<any[]>([]);
  const [backtestSummaries, setBacktestSummaries]  = useState<any[]>([]);
  const [latestDream,       setLatestDream]        = useState<any | null>(null);
  const [loading,           setLoading]            = useState(true);
  const [error,             setError]              = useState('');
  const [stateSearch,       setStateSearch]        = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [memRes, winRes, hitRes, dreamRes, latestRes] = await Promise.all([
          fetch(`/api/fell-before?ownerUid=${uid}`),
          fetch(`/api/dreams/windows?ownerUid=${uid}`),
          fetch(`/api/dreams/hits?ownerUid=${uid}`),
          fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
          fetch(`/api/dreams/latest?ownerUid=${uid}&n=1`),
        ]);

        const [memData, winData, hitData, dreamData, latestData] = await Promise.all([
          memRes.json(), winRes.json(), hitRes.json(), dreamRes.json(), latestRes.json(),
        ]);

        if (memData.ok)    setMappingRows(memData.rows            ?? []);
        if (winData.ok)    setActiveWindows(winData.windows       ?? []);
        if (hitData.ok)    setDreamHits(hitData.hits              ?? []);
        // list-dreams returns enriched dream objects that include summary fields
        // (totalHits, straightHits, boxedHits, bestState, bestTerm) — safe to use as backtestSummaries
        if (dreamData.ok)  setBacktestSummaries(dreamData.dreams  ?? []);
        if (latestData.ok) setLatestDream(latestData.entry        ?? null);
      } catch (err) {
        console.error(err);
        setError('Could not load Forecast Board.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Intelligence pipeline — unchanged, now fed from server routes
  const flat = useMemo(() => flattenDictionary(buildGroupedTermDictionary(mappingRows)), [mappingRows]);
  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);
  const forecast = useMemo(() =>
    buildLatestDreamForecast({ latestDream, activeWindows, dreamHits, mappingRows }),
    [latestDream, activeWindows, dreamHits, mappingRows]
  );
  const boosted = useMemo(() =>
    applyBacktestLearningBoost({ recommendationRows: forecast.recommendationRows, backtestSummaries, familyAnalytics }),
    [forecast.recommendationRows, backtestSummaries, familyAnalytics]
  );

  const filteredStateGroups = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    return q ? boosted.boostedStateGroups.filter((g: any) => g.state.toLowerCase().includes(q))
             : boosted.boostedStateGroups;
  }, [boosted.boostedStateGroups, stateSearch]);

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background:
        'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), ' +
        'radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), ' +
        'linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
    }}>
      <Sidebar />
      <section className="panel-grid" style={{ padding: '32px' }}>
        <PageIntro
          title="Forecast Board"
          description="Unresolved-only forecast with backtest-to-live learning boosts and evidence-weighted recommendation scores."
          actions={[
            { href: '/backtesting/evidence', label: 'Evidence Rules' },
            { href: '/chat',                 label: 'Intelligence Chat' },
            { href: '/daily-ops',            label: 'Daily Ops' },
          ]}
        />

        {/* Stats + filter */}
        <section style={{ display: 'grid', gap: '14px', gridTemplateColumns: '1.2fr repeat(4, minmax(160px, 1fr))' }}>
          <div className="journal-card-flat">
            <label className="journal-label" htmlFor="stateSearch">Filter by State</label>
            <input id="stateSearch" className="journal-input" value={stateSearch}
              onChange={e => setStateSearch(e.target.value)} placeholder="Illinois, GA…" />
          </div>
          {[
            ['Latest Dream',   latestDream?.dreamDate ?? '—'],
            ['Unresolved',     forecast.unresolvedWindows.length],
            ['Boosted Recs',   boosted.boostedRows.length],
            ['Boosted States', boosted.boostedStateGroups.length],
          ].map(([label, val]) => (
            <div key={String(label)} className="stat-tile">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{val}</div>
            </div>
          ))}
        </section>

        {loading && <section className="journal-card"><p>Loading Forecast Board…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}>{error}</section>}

        <section className="journal-card">
          <div className="page-header">
            <h1>Top Boosted State Recommendations</h1>
            <p>States boosted by repeated backtest best-state and best-term signals plus family memory.</p>
          </div>

          {filteredStateGroups.length ? (
            <div className="metric-row" style={{ marginTop: '14px' }}>
              {filteredStateGroups.slice(0, 10).map((group: any) => (
                <div key={group.state} className="journal-card-flat surface-accent" style={{ display: 'grid', gap: '14px' }}>
                  <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <div><div className="stat-label">State</div><div className="stat-value" style={{ fontSize: '1.55rem' }}>{group.state}</div></div>
                    <div><div className="stat-label">Boosted Score</div><div className="stat-value" style={{ fontSize: '1.55rem' }}>{group.boostedScore}</div></div>
                    <div><div className="stat-label">Learning Boost</div><div className="stat-value" style={{ fontSize: '1.55rem' }}>{group.totalLearningBoost}</div></div>
                    <div><div className="stat-label">Tier</div><div className="stat-value" style={{ fontSize: '1.35rem' }}>{group.topLearningTier}</div></div>
                  </div>
                  <hr className="soft-divider" />
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {group.rows.slice(0, 5).map((row: any, idx: number) => (
                      <div key={[
                          row.id,
                          row.dreamerId,
                          row.term,
                          row.number,
                          row.state,
                          row.gameType,
                          row.drawDate,
                          row.drawTime,
                          row.hitType,
                          idx,
                        ].filter(Boolean).join('-')}
                        className="journal-card-flat" style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', fontSize: '13px' }}>
                          <div><strong>Number:</strong> <span style={{ fontFamily: 'monospace' }}>{row.number}</span></div>
                          <div><strong>Term:</strong> {row.term}</div>
                          <div><strong>Game:</strong> {row.gameType}</div>
                          <div><strong>Base Score:</strong> {row.forecastScore}</div>
                          <div><strong>Boost:</strong> {row.learningBoost}</div>
                          <div><strong>Boosted:</strong> {row.boostedScore}</div>
                          <div><strong>Confidence:</strong> {row.confidenceTier}</div>
                          <div><strong>Tier:</strong> {row.learningTier}</div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
                          {Array.isArray(row.learningReasons) && row.learningReasons.length
                            ? 'Reasons: ' + row.learningReasons.join('; ')
                            : 'No extra boost'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: '12px' }}>No boosted state recommendations yet. Save current dreams and run a refresh.</p>
          )}
        </section>
      </section>
    </main>
  );
}
