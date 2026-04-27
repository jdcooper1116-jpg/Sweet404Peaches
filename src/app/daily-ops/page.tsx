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
import { applyBacktestLearningBoost, buildEvidencePromotionModel } from '@/lib/intelligence/evidencePromotion';
import { buildDailyOpsAlerts, diagnoseLatestDream } from '@/lib/intelligence/analystEngine';
import PageIntro from '@/components/ui/PageIntro';

export default function DailyOpsPage() {
  const { user } = useAuth();

  // All data from server routes — no client Firestore
  const [mappingRows,       setMappingRows]       = useState<PersonalMappingRow[]>([]);
  const [activeWindows,     setActiveWindows]      = useState<any[]>([]);
  const [dreamHits,         setDreamHits]          = useState<any[]>([]);
  const [backtestSummaries, setBacktestSummaries]  = useState<any[]>([]);
  const [latestDream,       setLatestDream]        = useState<any | null>(null);
  const [loading,           setLoading]            = useState(true);
  const [error,             setError]              = useState('');

  // Refresh Now state
  const [refreshing,        setRefreshing]         = useState(false);
  const [refreshResult,     setRefreshResult]      = useState<string | null>(null);
  const [refreshError,      setRefreshError]       = useState('');

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

        if (memData.ok)    setMappingRows(memData.rows           ?? []);
        if (winData.ok)    setActiveWindows(winData.windows      ?? []);
        if (hitData.ok)    setDreamHits(hitData.hits             ?? []);
        if (dreamData.ok)  setBacktestSummaries(dreamData.dreams ?? []);
        if (latestData.ok) setLatestDream(latestData.entry       ?? null);
      } catch (err) {
        console.error(err);
        setError('Could not load Daily Ops.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Refresh Now — calls working server route
  async function handleRefresh() {
    if (!user) return;
    setRefreshing(true); setRefreshResult(null); setRefreshError('');
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed.');
      setRefreshResult(
        `Checked ${data.windowsChecked ?? 0} windows · ` +
        `${data.windowsWithNewHits ?? 0} with new hits · ` +
        `${data.totalNewHits ?? 0} new hits · ` +
        `${data.engineCallsMade ?? 0} engine calls` +
        (data.errors?.length ? ` · ${data.errors.length} error(s)` : '')
      );
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally { setRefreshing(false); }
  }

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
  const promotionModel = useMemo(() =>
    buildEvidencePromotionModel({ liveRows: flat, backtestSummaries, familyAnalytics }),
    [flat, backtestSummaries, familyAnalytics]
  );
  const alerts = useMemo(() =>
    buildDailyOpsAlerts({ latestDream, forecast, boosted, promotionModel }),
    [latestDream, forecast, boosted, promotionModel]
  );
  const diagnosis = useMemo(() =>
    diagnoseLatestDream({ latestDream, forecast, boosted, dreamHits }),
    [latestDream, forecast, boosted, dreamHits]
  );

  // Active windows (windows still in their window period)
  const today = new Date().toISOString().slice(0, 10);
  const liveWindows = useMemo(() =>
    activeWindows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= today),
    [activeWindows, today]
  );
  const recentHits = useMemo(() =>
    [...dreamHits]
      .sort((a, b) => String(b.draw_date ?? '').localeCompare(String(a.draw_date ?? '')))
      .slice(0, 10),
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
      <section className="panel-grid" style={{ padding: '32px' }}>
        <PageIntro
          title="Daily Ops"
          description="Command-center briefing: unresolved watches, boosted state recommendations, evidence promotions, and latest-dream diagnostics."
          actions={[
            { href: '/forecast-board',       label: 'Forecast Board' },
            { href: '/backtesting/evidence', label: 'Evidence Rules' },
            { href: '/chat',                 label: 'Intelligence Chat' },
          ]}
        />

        {/* Refresh Now */}
        <section className="journal-card">
          <div style={{ marginBottom: '12px' }}>
            <strong>Refresh Dream Windows</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--ink-light)', fontSize: '13px' }}>
              Check all active windows against the latest Lottery Engine results.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={handleRefresh}
              disabled={refreshing || !user}>
              {refreshing ? 'Refreshing windows…' : '⚡ Refresh Now'}
            </button>
            {refreshResult && (
              <span style={{ fontSize: '13px', color: '#6dbf8a', fontWeight: 600 }}>✓ {refreshResult}</span>
            )}
          </div>
          {refreshError && (
            <div className="journal-card-flat" style={{ marginTop: '10px', borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
              {refreshError}
            </div>
          )}
        </section>

        {/* Stat tiles */}
        <section style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {[
            ['Latest Dream',     latestDream?.dreamDate   ?? '—',              'Most recent live dream.'],
            ['Active Windows',   liveWindows.length,                            'Windows inside 7-day period.'],
            ['Unresolved',       forecast.unresolvedWindows.length,             'Watch items still open.'],
            ['Boosted States',   boosted.boostedStateGroups.length,             'States lifted by backtest learning.'],
            ['Universal Ready',  promotionModel.summary.universalReady,         'Terms ready for universal promotion.'],
            ['Personal Ready',   promotionModel.summary.personalReady,          'Combos strongest for personal promotion.'],
          ].map(([label, val, sub]) => (
            <div key={String(label)} className="stat-tile">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{val}</div>
              <div className="stat-subtext">{sub}</div>
            </div>
          ))}
        </section>

        {loading && <section className="journal-card"><p>Loading Daily Ops…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}>{error}</section>}

        <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: '1.15fr 0.85fr' }}>
          {/* Operational alerts */}
          <section className="journal-card">
            <div className="page-header"><h1>Operational Alerts</h1><p>Highest-priority signals.</p></div>
            <div className="metric-row" style={{ marginTop: '14px' }}>
              {alerts.length ? alerts.map((alert: string) => (
                <div key={alert} className="journal-card-flat surface-accent">{alert}</div>
              )) : <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No alerts right now.</p>}
            </div>
          </section>

          {/* Latest dream diagnosis */}
          <section className="journal-card">
            <div className="page-header"><h1>Latest Dream Diagnosis</h1><p>What the system sees in the current live cycle.</p></div>
            <div className="journal-card-flat surface-accent" style={{ marginTop: '14px' }}>
              <div className="metric-chip">Status: {diagnosis.status}</div>
              <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                {diagnosis.findings.map((item: string) => (
                  <div key={item} style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '13px' }}>{item}</div>
                ))}
              </div>
            </div>
          </section>
        </section>

        {/* Active windows */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Active Windows ({liveWindows.length})</h1>
            <p>Currently being watched against live lottery results.</p>
          </div>
          {liveWindows.length === 0 ? (
            <p style={{ color: 'var(--ink-light)', margin: '12px 0 0', fontSize: '13px' }}>
              No active windows. <Link href="/dreams/new" style={{ color: '#b0b8ff' }}>Add a dream →</Link>
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {liveWindows.slice(0, 12).map((w: any, i: number) => (
                <div key={w.id || i} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                    <div><div className="journal-label">Dreamer</div><div>{w.dreamerName || w.dreamerId || '—'}</div></div>
                    <div><div className="journal-label">Term</div><div>{w.termLabel || '—'}</div></div>
                    <div><div className="journal-label">Number</div><div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.number || '—'}</div></div>
                    <div><div className="journal-label">Game</div><div>{w.gameType || '—'}</div></div>
                    <div><div className="journal-label">Window</div><div>{w.activeStart || w.activeWindowStart || '—'} → {w.activeEnd || w.activeWindowEnd || '—'}</div></div>
                    <div>
                      <div className="journal-label">Last Checked</div>
                      <div style={{ fontSize: '11px' }}>
                        {w.lastCheckedAt ? String(w.lastCheckedAt).slice(0, 16).replace('T', ' ') + ' UTC' : 'Never'}
                      </div>
                    </div>
                    {(w.lastHitCount ?? 0) > 0 && (
                      <div>
                        <div className="journal-label">Hits</div>
                        <div style={{ color: '#6dbf8a', fontWeight: 700 }}>{w.lastHitCount}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {liveWindows.length > 12 && (
                <Link href="/windows" className="btn-secondary" style={{ width: 'fit-content', fontSize: '12px' }}>
                  View all {liveWindows.length} windows →
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Recent hits */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Recent Hits ({dreamHits.length})</h1>
            <p>Latest confirmed current dream hits.</p>
          </div>
          {recentHits.length === 0 ? (
            <p style={{ color: 'var(--ink-light)', margin: '12px 0 0', fontSize: '13px' }}>No hits yet. Run Refresh Now after adding dreams.</p>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {recentHits.map((hit: any) => (
                <div key={hit.id} className="journal-card-flat"
                  style={{ fontSize: '13px', borderLeft: `3px solid ${hit.match_type === 'exact' ? '#4a7c59' : '#a07c4a'}` }}>
                  <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                    <div><div className="journal-label">Term</div><div>{hit.termLabel || '—'}</div></div>
                    <div><div className="journal-label">Candidate</div><div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{hit.candidate || '—'}</div></div>
                    <div><div className="journal-label">Result</div><div style={{ fontFamily: 'monospace' }}>{hit.winning_number || '—'}</div></div>
                    <div><div className="journal-label">State</div><div>{hit.state || '—'}</div></div>
                    <div><div className="journal-label">Date</div><div>{hit.draw_date || '—'}</div></div>
                    <div>
                      <div className="journal-label">Type</div>
                      <div style={{ color: hit.match_type === 'exact' ? '#6dbf8a' : '#d4a95a', fontWeight: 700 }}>
                        {hit.match_type === 'exact' ? 'Straight' : 'Box'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {dreamHits.length > 10 && (
                <Link href="/hits" className="btn-secondary" style={{ width: 'fit-content', fontSize: '12px' }}>
                  View all {dreamHits.length} hits →
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Promotion signals */}
        <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <section className="journal-card">
            <div className="page-header"><h1>Top Boosted State</h1><p>Backtest-informed next recommendation.</p></div>
            {boosted.boostedStateGroups[0] ? (
              <div className="journal-card-flat surface-accent" style={{ marginTop: '14px' }}>
                <div className="stat-label">Strongest State</div>
                <div className="stat-value" style={{ fontSize: '1.8rem' }}>{boosted.boostedStateGroups[0].state}</div>
                <div className="stat-subtext">
                  Score: {boosted.boostedStateGroups[0].boostedScore} · Tier: {boosted.boostedStateGroups[0].topLearningTier}
                </div>
              </div>
            ) : <p style={{ color: 'var(--ink-light)', margin: '12px 0 0', fontSize: '13px' }}>No boosted state recommendations yet.</p>}
          </section>

          <section className="journal-card">
            <div className="page-header"><h1>Top Promotion Signals</h1><p>Best current learning candidates.</p></div>
            <div className="metric-row" style={{ marginTop: '14px' }}>
              {promotionModel.termCandidates.slice(0, 3).map((row: any) => (
                <div key={row.term} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  {row.term} — {row.promotionTier} ({row.promotionScore})
                </div>
              ))}
              {promotionModel.comboCandidates.slice(0, 3).map((row: any, i: number) => (
                <div key={`${row.term}-${row.number}-${row.state}-${i}`} className="journal-card-flat" style={{ fontSize: '13px' }}>
                  {row.term} → <span style={{ fontFamily: 'monospace' }}>{row.number}</span> in {row.state} — {row.promotionTier} ({row.promotionScore})
                </div>
              ))}
              {!promotionModel.termCandidates.length && !promotionModel.comboCandidates.length && (
                <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No promotion signals yet.</p>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
