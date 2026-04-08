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

export default function DailyOpsPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [latestDream, setLatestDream] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        setError('Could not load Daily Ops.');
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

  const latestDreamHits = useMemo(() => {
    if (!latestDream?.id) return [];
    return dreamHits.filter(
      (hit) => String(hit?.sourceDreamEntryId ?? '') === String(latestDream.id)
    );
  }, [dreamHits, latestDream]);

  const alerts = useMemo(() => {
    const items: string[] = [];

    if (!latestDream) {
      items.push('No latest dream is saved yet.');
      return items;
    }

    if (!forecast.unresolvedWindows.length) {
      items.push('No unresolved watch items remain from the latest dream.');
    } else {
      items.push(`${forecast.unresolvedWindows.length} unresolved watch item(s) remain live from the latest dream.`);
    }

    if (latestDreamHits.length) {
      items.push(`${latestDreamHits.length} hit event(s) have already been logged for the latest dream.`);
    } else {
      items.push('No hit events have been logged yet for the latest dream.');
    }

    if (forecast.recommendationStateGroups[0]) {
      items.push(`${forecast.recommendationStateGroups[0].state} is the strongest state to monitor next from historical memory.`);
    }

    return items;
  }, [latestDream, forecast.unresolvedWindows, latestDreamHits, forecast.recommendationStateGroups]);

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
              <h1>Daily Ops</h1>
              <p>
                Your command-center briefing for the latest dream, live unresolved watches, state recommendations, and operational alerts.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/forecast-board" className="btn-secondary">
                Forecast Board
              </Link>
              <Link href="/chat" className="btn-secondary">
                Intelligence Chat
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
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <div className="journal-label">Latest Dream Date</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{latestDream?.dreamDate ?? '—'}</div>
          </div>

          <div>
            <div className="journal-label">Latest Dream Terms</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.latestDreamTerms.length}</div>
          </div>

          <div>
            <div className="journal-label">Unresolved Live Watches</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{forecast.unresolvedWindows.length}</div>
          </div>

          <div>
            <div className="journal-label">Hit Events Logged</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{latestDreamHits.length}</div>
          </div>

          <div>
            <div className="journal-label">Top Next State</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>
              {forecast.recommendationStateGroups[0]?.state ?? '—'}
            </div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Daily Ops...</p>
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

        <section className="journal-card">
          <div className="page-header">
            <h1>Operational Alerts</h1>
            <p>These are the highest-priority signals from your latest dream cycle.</p>
          </div>

          <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
            {alerts.map((alert) => (
              <div key={alert} className="journal-card-flat">
                {alert}
              </div>
            ))}
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Latest Dream Snapshot</h1>
            <p>Terms and numbers currently driving your live watch cycle.</p>
          </div>

          {latestDream ? (
            <div className="journal-card-flat" style={{ marginTop: '12px' }}>
              <p style={{ margin: 0, color: 'var(--ink-light)', lineHeight: 1.7 }}>
                Terms: {forecast.latestDreamTerms.length ? forecast.latestDreamTerms.join(', ') : 'No parsed terms'}.
                {' '}Numbers: {forecast.latestDreamNumbers.length ? forecast.latestDreamNumbers.slice(0, 20).join(', ') : 'No parsed numbers'}.
              </p>
            </div>
          ) : (
            <p>No latest dream found.</p>
          )}
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Top State Watch Suggestions</h1>
            <p>The strongest historical state recommendations for unresolved items.</p>
          </div>

          {forecast.recommendationStateGroups.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {forecast.recommendationStateGroups.slice(0, 5).map((group) => (
                <div key={group.state} className="journal-card-flat">
                  <strong>{group.state}</strong>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Score: {group.score}
                  </div>
                  <div style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                    {group.rows.slice(0, 4).map((row) => `${row.number} (${row.term})`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No state watch suggestions are available yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
