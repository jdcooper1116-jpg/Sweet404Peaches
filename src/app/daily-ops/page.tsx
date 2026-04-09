// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
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

        const summaries = await Promise.all(
          dreams.map((dream: any) => getBacktestSummaryForDream(user.uid, dream.id))
        );

        setMappingRows(mappings as PersonalMappingRow[]);
        setActiveWindows(windows);
        setDreamHits(hits);
        setBacktestSummaries(summaries.filter(Boolean));
        setLatestDream(latest);
      } catch (err) {
        console.error(err);
        setError('Could not load Daily Ops.');
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
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div className="page-header">
              <h1>Daily Ops</h1>
              <p>
                Command-center briefing for unresolved live watches, boosted state recommendations,
                evidence promotions, and latest-dream diagnostics.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/forecast-board" className="btn-secondary">Forecast Board</Link>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
              <Link href="/chat" className="btn-secondary">Intelligence Chat</Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div><div className="journal-label">Latest Dream Date</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{latestDream?.dreamDate ?? '—'}</div></div>
          <div><div className="journal-label">Unresolved Live Watches</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.unresolvedWindows.length}</div></div>
          <div><div className="journal-label">Boosted States</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{boosted.boostedStateGroups.length}</div></div>
          <div><div className="journal-label">Universal Ready</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{promotionModel.summary.universalReady}</div></div>
          <div><div className="journal-label">Personal Ready</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{promotionModel.summary.personalReady}</div></div>
        </section>

        {loading ? <section className="journal-card"><p>Loading Daily Ops...</p></section> : null}
        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Operational Alerts</h1>
            <p>Highest-priority system signals right now.</p>
          </div>
          <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
            {alerts.map((alert) => (
              <div key={alert} className="journal-card-flat">{alert}</div>
            ))}
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Latest Dream Diagnosis</h1>
            <p>What the system thinks is happening with the current live dream cycle.</p>
          </div>

          <div className="journal-card-flat" style={{ marginTop: '12px' }}>
            <strong>Status: {diagnosis.status}</strong>
            <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
              {diagnosis.findings.map((item: string) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
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
              <div className="journal-card-flat" style={{ marginTop: '12px' }}>
                <strong>{boosted.boostedStateGroups[0].state}</strong>
                <div style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
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

            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
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
