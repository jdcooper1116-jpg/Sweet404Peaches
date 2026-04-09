// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  listSafeBacktestSummariesForDreams,
  getLatestDreamEntry,
  listActiveDreamWindows,
  listBacktestDreams,
  listDreamHits,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import { buildGroupedTermDictionary, flattenDictionary, type PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { applyBacktestLearningBoost, buildEvidencePromotionModel } from '@/lib/intelligence/evidencePromotion';
import { buildDailyOpsAlerts, diagnoseLatestDream } from '@/lib/intelligence/analystEngine';
import PageIntro from '@/components/ui/PageIntro';

export default function DailyOpsPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [latestDream, setLatestDream] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setActiveWindows([]);
        setDreamHits([]);
        setBacktestSummaries([]);
        setLatestDream(null);
        setLoading(false);
        return;
      }

      try {
        const [mappings, windows, hits, dreams, latest] = await Promise.all([
          listPersonalHitMappings(user.uid),
          listActiveDreamWindows(user.uid),
          listDreamHits(user.uid),
          listBacktestDreams(user.uid),
          getLatestDreamEntry(user.uid),
        ]);

        const summaries = await listSafeBacktestSummariesForDreams(
          user.uid,
          dreams
        );

        setMappingRows(mappings as PersonalMappingRow[]);
        setActiveWindows(windows);
        setDreamHits(hits);
        setBacktestSummaries(summaries.filter(Boolean));
        setLatestDream(latest);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const flat = useMemo(() => {
    const grouped = buildGroupedTermDictionary(mappingRows);
    return flattenDictionary(grouped);
  }, [mappingRows]);

  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);

  const forecast = useMemo(
    () =>
      buildLatestDreamForecast({
        latestDream,
        activeWindows,
        dreamHits,
        mappingRows,
      }),
    [latestDream, activeWindows, dreamHits, mappingRows]
  );

  const boosted = useMemo(
    () =>
      applyBacktestLearningBoost({
        recommendationRows: forecast.recommendationRows,
        backtestSummaries,
        familyAnalytics,
      }),
    [forecast.recommendationRows, backtestSummaries, familyAnalytics]
  );

  const promotionModel = useMemo(
    () =>
      buildEvidencePromotionModel({
        liveRows: flat,
        backtestSummaries,
        familyAnalytics,
      }),
    [flat, backtestSummaries, familyAnalytics]
  );

  const alerts = useMemo(
    () =>
      buildDailyOpsAlerts({
        latestDream,
        forecast,
        boosted,
        promotionModel,
      }),
    [latestDream, forecast, boosted, promotionModel]
  );

  const diagnosis = useMemo(
    () =>
      diagnoseLatestDream({
        latestDream,
        forecast,
        boosted,
        dreamHits,
      }),
    [latestDream, forecast, boosted, dreamHits]
  );

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />
      <section className="panel-grid" style={{ padding: '32px' }}>
        <PageIntro
          title="Daily Ops"
          description="Command-center briefing for unresolved live watches, boosted state recommendations, evidence promotions, and latest-dream diagnostics."
          actions={[
            { href: '/forecast-board', label: 'Forecast Board' },
            { href: '/backtesting/evidence', label: 'Evidence Rules' },
            { href: '/chat', label: 'Intelligence Chat' },
          ]}
        />

        <section
          style={{
            display: 'grid',
            gap: '14px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div className="stat-tile">
            <div className="stat-label">Latest Dream</div>
            <div className="stat-value">{latestDream?.dreamDate ?? '—'}</div>
            <div className="stat-subtext">Most recent live dream currently driving the forecast engine.</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Unresolved Watches</div>
            <div className="stat-value">{forecast.unresolvedWindows.length}</div>
            <div className="stat-subtext">Numbers still active inside the current dream window.</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Boosted States</div>
            <div className="stat-value">{boosted.boostedStateGroups.length}</div>
            <div className="stat-subtext">States lifted by backtest learning and family memory.</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Universal Ready</div>
            <div className="stat-value">{promotionModel.summary.universalReady}</div>
            <div className="stat-subtext">Terms ready for stronger Universal Dictionary promotion.</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Personal Ready</div>
            <div className="stat-value">{promotionModel.summary.personalReady}</div>
            <div className="stat-subtext">State-specific combos strongest for personal promotion.</div>
          </div>
        </section>

        {loading ? <section className="journal-card"><p>Loading Daily Ops...</p></section> : null}
        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}>
            {error}
          </section>
        ) : null}

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: '1.15fr 0.85fr',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Operational Alerts</h1>
              <p>Highest-priority system signals right now.</p>
            </div>
            <div className="metric-row" style={{ marginTop: '14px' }}>
              {alerts.map((alert) => (
                <div key={alert} className="journal-card-flat surface-accent">
                  {alert}
                </div>
              ))}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Latest Dream Diagnosis</h1>
              <p>What the system thinks is happening with the current live cycle.</p>
            </div>

            <div className="journal-card-flat surface-accent" style={{ marginTop: '14px' }}>
              <div className="metric-chip">Status: {diagnosis.status}</div>
              <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                {diagnosis.findings.map((item: string) => (
                  <div key={item} style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Top Boosted State</h1>
              <p>Backtest-informed next-state recommendation.</p>
            </div>

            {boosted.boostedStateGroups[0] ? (
              <div className="journal-card-flat surface-accent" style={{ marginTop: '14px' }}>
                <div className="stat-label">Strongest State</div>
                <div className="stat-value" style={{ fontSize: '1.8rem' }}>
                  {boosted.boostedStateGroups[0].state}
                </div>
                <div className="stat-subtext">
                  Boosted Score: {boosted.boostedStateGroups[0].boostedScore} • Learning Tier: {boosted.boostedStateGroups[0].topLearningTier}
                </div>
              </div>
            ) : <p>No boosted state recommendations yet.</p>}
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Top Promotion Signals</h1>
              <p>Best current learning candidates.</p>
            </div>

            <div className="metric-row" style={{ marginTop: '14px' }}>
              {promotionModel.termCandidates.slice(0, 3).map((row: any) => (
                <div key={row.term} className="journal-card-flat">
                  {row.term} — {row.promotionTier} ({row.promotionScore})
                </div>
              ))}
              {promotionModel.comboCandidates.slice(0, 3).map((row: any, index: number) => (
                <div key={`${row.term}-${row.number}-${row.state}-${index}`} className="journal-card-flat">
                  {row.term} → {row.number} in {row.state} — {row.promotionTier} ({row.promotionScore})
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
