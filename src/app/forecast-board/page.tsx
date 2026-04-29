// @ts-nocheck
'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildGroupedTermDictionary, flattenDictionary } from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { applyBacktestLearningBoost } from '@/lib/intelligence/evidencePromotion';
import PageIntro from '@/components/ui/PageIntro';
import {
  buildGroupedWindows, buildFellIndex, buildNumberConvergence,
  buildBoxedSignals, buildFellProof, buildFocusRecs,
  type FocusRec,
} from '@/lib/intelligence/universalScope';

// ── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50'                : '#ff9090';
  return (
    <div style={{ padding:'14px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      {isIndex && <strong>⚠ Firestore index required</strong>}
      {isQuota && <strong>⚠ Firebase quota exhausted</strong>}
      {!isIndex && !isQuota && <strong>⚠ Could not load data</strong>}
      <br />
      {isIndex && 'Create the suggested Firebase index, wait until active, then refresh. '}
      {isQuota && 'Read quota is temporarily exhausted. Try again after reset or reduce testing. '}
      {!isIndex && !isQuota && msg}
      {(isIndex || isQuota) && (
        <span>
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{ marginLeft:'8px', fontSize:'11px', opacity:0.7, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
            {open ? 'hide details' : 'details'}
          </button>
          {open && <div style={{ marginTop:'6px', fontSize:'11px', opacity:0.75, wordBreak:'break-all', fontFamily:'monospace' }}>{msg}</div>}
        </span>
      )}
    </div>
  );
}

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
  const [quotaError,        setQuotaError]         = useState(false);
  const [pinned,            setPinned]             = useState<any[]>([]);
  const [stateSearch,       setStateSearch]        = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [memRes, winRes, hitRes, dreamRes, latestRes, pinRes] = await Promise.all([
          fetch(`/api/fell-before?ownerUid=${uid}&limit=100`),
          fetch(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
          fetch(`/api/dreams/hits?ownerUid=${uid}&limit=30`),
          fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
          fetch(`/api/dreams/latest?ownerUid=${uid}&n=1`),
          fetch(`/api/pinned-plays?ownerUid=${uid}`),
        ]);

        const [memData, winData, hitData, dreamData, latestData, pinData] = await Promise.all([
          memRes.json(), winRes.json(), hitRes.json(), dreamRes.json(), latestRes.json(), pinRes.json(),
        ]);

        if (memData.ok)    setMappingRows(memData.rows            ?? []);
        if (winData.ok)    setActiveWindows(winData.windows       ?? []);
        if (hitData.ok)    setDreamHits(hitData.hits              ?? []);
        if (dreamData.ok)  setBacktestSummaries(dreamData.dreams  ?? []);
        if (latestData.ok) setLatestDream(latestData.entry        ?? null);
        if (pinData.ok)    setPinned(pinData.plays                ?? []);
        if ([memData, winData, hitData].some((d: any) => d.quota)) setQuotaError(true);
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

  // Universal Scope convergence pipeline (active windows only)
  const today2       = new Date().toISOString().slice(0, 10);
  const grouped      = useMemo(() => buildGroupedWindows(activeWindows, today2),          [activeWindows, today2]);
  const fellIdx      = useMemo(() => buildFellIndex(mappingRows),                         [mappingRows]);
  const numSignals   = useMemo(() => buildNumberConvergence(grouped, fellIdx, pinned),    [grouped, fellIdx, pinned]);
  const boxedSignals = useMemo(() => buildBoxedSignals(grouped, fellIdx),                 [grouped, fellIdx]);
  const fellProof    = useMemo(() => buildFellProof(grouped, fellIdx),                    [grouped, fellIdx]);
  const focusRecs    = useMemo(() => buildFocusRecs(numSignals, boxedSignals, fellProof, dreamHits), [numSignals, boxedSignals, fellProof, dreamHits]);

  const filteredStateGroups = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    return q ? boosted.boostedStateGroups.filter((g: any) => g.state.toLowerCase().includes(q))
             : boosted.boostedStateGroups;
  }, [boosted.boostedStateGroups, stateSearch]);

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>
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
        {error && <ErrorBanner msg={error} />}

        {quotaError && (
          <div style={{ padding:'12px 16px',borderRadius:'14px',border:'1px solid rgba(255,204,80,0.28)',background:'rgba(255,204,80,0.08)',color:'#ffcc50',fontSize:'13px' }}>
            ⚠ Firebase quota limit reached. Some signals may be incomplete.
          </div>
        )}

        {/* Universal Scope Focus Recommendations */}
        {!loading && focusRecs.length > 0 && (
          <section className="journal-card">
            <div style={{ marginBottom:'14px' }}>
              <h2 style={{ margin:0, fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Today's Focus — Active Dream Convergence</h2>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginTop:'3px' }}>Evidence-based. Not guaranteed. Use confidence tiers as signal strength indicators.</div>
            </div>
            <div style={{ display:'grid', gap:'8px' }}>
              {(focusRecs as FocusRec[]).slice(0,8).map(rec => (
                <div key={rec.id} style={{
                  padding:'11px 14px', borderRadius:'14px', display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-start',
                  background: rec.tier==='Strong Focus' ? 'rgba(96,224,154,0.08)' : rec.tier==='Moderate Focus' ? 'rgba(255,204,80,0.07)' : 'rgba(255,255,255,0.05)',
                  borderLeft: `3px solid ${rec.tier==='Strong Focus' ? '#60e09a' : rec.tier==='Moderate Focus' ? '#ffcc50' : '#a090ff'}`,
                  border: '1px solid rgba(255,255,255,0.09)',
                }}>
                  <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'1.1rem', color: rec.gameType==='cash4' ? '#a090ff' : '#ff8a6a' }}>{rec.number}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'4px' }}>
                      <span style={{ padding:'2px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700, color: rec.tier==='Strong Focus' ? '#60e09a' : rec.tier==='Moderate Focus' ? '#ffcc50' : '#a090ff', border:'1px solid currentColor', opacity:0.85 }}>{rec.tier}</span>
                      {(rec.evidenceBadges??[]).slice(0,3).map((b:string) => (
                        <span key={b} style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'10px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.13)', color:'rgba(255,255,255,0.60)' }}>{b}</span>
                      ))}
                    </div>
                    <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', fontStyle:'italic' }}>{rec.reason}</div>
                  </div>
                  <div style={{ textAlign:'right', fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>
                    <div>Score {rec.score}</div>
                    {rec.states.slice(0,3).map((s:string) => <span key={s} style={{ padding:'1px 6px', borderRadius:'5px', fontSize:'10px', background:'rgba(96,224,154,0.10)', color:'#60e09a', marginLeft:'4px' }}>{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
                    {group.rows.slice(0, 5).map((row: any) => (
                      <div key={`${row.term}-${row.number}-${row.state}-${row.gameType}`}
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
    </div>
  );
}
