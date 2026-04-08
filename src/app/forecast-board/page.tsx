'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getLatestDreamEntry,
  listActiveDreamWindows,
  listDreamHits,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';

export default function ForecastBoardPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
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
        setLatestDream(null);
        setLoading(false);
        return;
      }

      try {
        const [mappings, windows, hits, latest] = await Promise.all([
          listPersonalHitMappings(user.uid),
          listActiveDreamWindows(user.uid),
          listDreamHits(user.uid),
          getLatestDreamEntry(user.uid),
        ]);

        setMappingRows(mappings as PersonalMappingRow[]);
        setActiveWindows(windows);
        setDreamHits(hits);
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

  const filteredRecommendations = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return forecast.recommendationRows;

    return forecast.recommendationRows.filter((row) =>
      row.state.toLowerCase().includes(q)
    );
  }, [forecast.recommendationRows, stateSearch]);

  const filteredStateGroups = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return forecast.recommendationStateGroups;

    return forecast.recommendationStateGroups.filter((group) =>
      group.state.toLowerCase().includes(q)
    );
  }, [forecast.recommendationStateGroups, stateSearch]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
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
                This board is unresolved-only. It focuses on live watch items from your latest dream that have not already hit.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/chat" className="btn-secondary">
                Intelligence Chat
              </Link>
              <Link href="/playlists" className="btn-secondary">
                State Playlist
              </Link>
              <Link href="/hits" className="btn-secondary">
                Hits Detector
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
            <label className="journal-label" htmlFor="stateSearch">
              Filter by State
            </label>
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
            <div className="journal-label">Latest Dream Terms</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.latestDreamTerms.length}</div>
          </div>

          <div>
            <div className="journal-label">Latest Dream Numbers</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.latestDreamNumbers.length}</div>
          </div>

          <div>
            <div className="journal-label">Unresolved Watch Items</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.unresolvedWindows.length}</div>
          </div>

          <div>
            <div className="journal-label">Ranked State Recommendations</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{filteredRecommendations.length}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Forecast Board...</p>
          </section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : null}

        {latestDream ? (
          <section className="journal-card-flat">
            <strong>Latest Dream Snapshot</strong>
            <p style={{ marginTop: '10px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
              Terms: {forecast.latestDreamTerms.length ? forecast.latestDreamTerms.join(', ') : 'No parsed terms'}.
              {' '}Numbers: {forecast.latestDreamNumbers.length ? forecast.latestDreamNumbers.slice(0, 20).join(', ') : 'No parsed numbers'}.
            </p>
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Unresolved Live Watch Items</h1>
            <p>These are the latest dream watch items that have not already been resolved as hits.</p>
          </div>

          {forecast.unresolvedWindows.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {forecast.unresolvedWindows.map((row, index) => (
                <div key={`${row.gameType}-${row.number}-${row.termLabel}-${index}`} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    }}
                  >
                    <div><strong>Term:</strong> {row.termLabel}</div>
                    <div><strong>Number:</strong> {row.number}</div>
                    <div><strong>Game:</strong> {row.gameType}</div>
                    <div><strong>Window:</strong> {row.activeStart} → {row.activeEnd}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No unresolved live watch items found for the latest dream.</p>
          )}
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Top State Recommendations</h1>
            <p>Historical state recommendations for unresolved watch items from the latest dream.</p>
          </div>

          {filteredStateGroups.length ? (
            <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
              {filteredStateGroups.map((group) => (
                <div key={group.state} className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <strong>{group.state}</strong>
                    <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                      Combined forecast score: {group.score}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    {group.rows.slice(0, 5).map((row) => (
                      <div
                        key={`${row.term}-${row.number}-${row.state}-${row.gameType}-${row.drawTime}`}
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
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          }}
                        >
                          <div><strong>Number:</strong> {row.number}</div>
                          <div><strong>Trigger Term:</strong> {row.term}</div>
                          <div><strong>Game:</strong> {row.gameType}</div>
                          <div><strong>Draw:</strong> {row.drawTime}</div>
                          <div><strong>Hit Type Bias:</strong> {row.latestHitType}</div>
                          <div><strong>State Strength:</strong> {row.stateStrengthScore}</div>
                          <div><strong>Forecast Score:</strong> {row.forecastScore}</div>
                          <div><strong>Last Hit:</strong> {row.lastHitDate || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No historical state recommendations are available yet for the latest unresolved dream items.</p>
          )}
        </section>
      </section>
    </main>
  );
}
