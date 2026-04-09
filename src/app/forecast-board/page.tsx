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
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildGroupedTermDictionary, flattenDictionary } from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { applyBacktestLearningBoost } from '@/lib/intelligence/evidencePromotion';

export default function ForecastBoardPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [latestDream, setLatestDream] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stateSearch, setStateSearch] = useState('');

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
        setError('Could not load Forecast Board.');
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

  const filteredStateGroups = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return boosted.boostedStateGroups;
    return boosted.boostedStateGroups.filter((group: any) =>
      group.state.toLowerCase().includes(q)
    );
  }, [boosted.boostedStateGroups, stateSearch]);

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
              <h1>Forecast Board</h1>
              <p>
                Unresolved-only forecast with backtest-to-live learning boosts and evidence-weighted recommendation scores.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/evidence" className="btn-secondary">
                Evidence Rules
              </Link>
              <Link href="/chat" className="btn-secondary">
                Intelligence Chat
              </Link>
              <Link href="/daily-ops" className="btn-secondary">
                Daily Ops
              </Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          <div>
            <label className="journal-label" htmlFor="stateSearch">Filter by State</label>
            <input
              id="stateSearch"
              className="journal-input"
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              placeholder="Ex: Illinois"
            />
          </div>

          <div className="journal-card-flat">
            <div className="journal-label">Latest Dream Date</div>
            <div style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
              {latestDream?.dreamDate ?? '—'}
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
          <div>
            <div className="journal-label">Unresolved Watches</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.unresolvedWindows.length}</div>
          </div>
          <div>
            <div className="journal-label">Boosted Recommendations</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{boosted.boostedRows.length}</div>
          </div>
          <div>
            <div className="journal-label">Boosted States</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{boosted.boostedStateGroups.length}</div>
          </div>
          <div>
            <div className="journal-label">Resolved Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.resolvedHitsForLatestDream.length}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card"><p>Loading Forecast Board...</p></section>
        ) : null}

        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Top Boosted State Recommendations</h1>
            <p>These states are boosted by repeated backtest best-state / best-term signals and family memory.</p>
          </div>

          {filteredStateGroups.length ? (
            <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
              {filteredStateGroups.slice(0, 10).map((group: any) => (
                <div key={group.state} className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <div><strong>State:</strong> {group.state}</div>
                    <div><strong>Boosted Score:</strong> {group.boostedScore}</div>
                    <div><strong>Total Learning Boost:</strong> {group.totalLearningBoost}</div>
                    <div><strong>Top Learning Tier:</strong> {group.topLearningTier}</div>
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    {group.rows.slice(0, 5).map((row: any) => (
                      <div
                        key={`${row.term}-${row.number}-${row.state}-${row.gameType}`}
                        style={{
                          border: '1px solid rgba(90, 52, 74, 0.12)',
                          borderRadius: '16px',
                          padding: '12px',
                          background: 'rgba(255,255,255,0.5)',
                          display: 'grid',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gap: '8px',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                          }}
                        >
                          <div><strong>Number:</strong> {row.number}</div>
                          <div><strong>Term:</strong> {row.term}</div>
                          <div><strong>Game:</strong> {row.gameType}</div>
                          <div><strong>Base Score:</strong> {row.forecastScore}</div>
                          <div><strong>Learning Boost:</strong> {row.learningBoost}</div>
                          <div><strong>Boosted Score:</strong> {row.boostedScore}</div>
                          <div><strong>Confidence:</strong> {row.confidenceTier}</div>
                          <div><strong>Learning Tier:</strong> {row.learningTier}</div>
                        </div>

                        <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                          Reasons: {Array.isArray(row.learningReasons) && row.learningReasons.length ? row.learningReasons.join('; ') : 'No extra boost'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No boosted state recommendations are available yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
