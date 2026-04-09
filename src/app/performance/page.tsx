// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  listActiveDreamWindows,
  listBacktestDreams,
  listDreamHits,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';

function getDreamEntryId(row: any): string {
  return String(row?.dreamEntryId ?? row?.sourceDreamEntryId ?? row?.id ?? '');
}

export default function PerformancePage() {
  const { user } = useAuth();

  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setActiveWindows([]);
        setDreamHits([]);
        setMappingRows([]);
        setBacktestSummaries([]);
        setLoading(false);
        return;
      }

      try {
        const [windows, hits, mappings, dreams] = await Promise.all([
          listActiveDreamWindows(user.uid),
          listDreamHits(user.uid),
          listPersonalHitMappings(user.uid),
          listBacktestDreams(user.uid),
        ]);

        const summaries = await Promise.all(
          dreams.map((dream: any) => getBacktestSummaryForDream(user.uid, dream.id))
        );

        setActiveWindows(windows);
        setDreamHits(hits);
        setMappingRows(mappings as PersonalMappingRow[]);
        setBacktestSummaries(summaries.filter(Boolean));
      } catch (err) {
        console.error(err);
        setError('Could not load Performance.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const liveMetrics = useMemo(() => {
    const trackedDreamIds = new Set(activeWindows.map(getDreamEntryId).filter(Boolean));
    const hitDreamIds = new Set(
      dreamHits.map((hit) => String(hit?.sourceDreamEntryId ?? '')).filter(Boolean)
    );

    const straight = dreamHits.filter((hit) => hit.hitType === 'straight').length;
    const boxed = dreamHits.filter((hit) => hit.hitType === 'boxed').length;

    const trackedDreamCount = trackedDreamIds.size;
    const hitDreamCount = hitDreamIds.size;
    const hitRate = trackedDreamCount
      ? Math.round((hitDreamCount / trackedDreamCount) * 100)
      : 0;

    return {
      trackedDreamCount,
      hitDreamCount,
      totalHitEvents: dreamHits.length,
      straight,
      boxed,
      hitRate,
      dictionaryRows: mappingRows.length,
    };
  }, [activeWindows, dreamHits, mappingRows]);

  const backtestMetrics = useMemo(() => {
    return backtestSummaries.reduce(
      (acc, row: any) => {
        acc.completed += 1;
        acc.totalHits += Number(row.totalHits ?? 0);
        acc.straight += Number(row.straightHits ?? 0);
        acc.boxed += Number(row.boxedHits ?? 0);
        return acc;
      },
      { completed: 0, totalHits: 0, straight: 0, boxed: 0 }
    );
  }, [backtestSummaries]);

  const topStates = useMemo(() => {
    const map = new Map<string, { hits: number; straight: number; boxed: number }>();

    for (const row of mappingRows) {
      const state = String(row.state ?? 'Unknown');
      if (!map.has(state)) {
        map.set(state, { hits: 0, straight: 0, boxed: 0 });
      }

      const current = map.get(state)!;
      current.hits += Number(row.hitCount ?? 1);
      current.straight += Number(row.straightCount ?? 0);
      current.boxed += Number(row.boxedCount ?? 0);
    }

    return Array.from(map.entries())
      .map(([state, value]) => ({
        state,
        hits: value.hits,
        straight: value.straight,
        boxed: value.boxed,
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);
  }, [mappingRows]);

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
              <h1>Performance</h1>
              <p>
                A truth page for live-mode hit performance and historical backtest performance.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/daily-ops" className="btn-secondary">
                Daily Ops
              </Link>
              <Link href="/backtesting/archive" className="btn-secondary">
                Backtest Archive
              </Link>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Performance...</p>
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
            <h1>Live-Mode Metrics</h1>
            <p>What the active dream engine is producing right now.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            <div className="journal-card-flat">
              <div className="journal-label">Tracked Live Dreams</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.trackedDreamCount}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Dreams With Hits</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.hitDreamCount}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Hit Rate</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.hitRate}%</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Hit Events</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.totalHitEvents}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Straight Hits</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.straight}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Boxed Hits</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.boxed}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Dictionary Rows</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.dictionaryRows}</div>
            </div>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Backtest Metrics</h1>
            <p>How your historical research lane is performing overall.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            <div className="journal-card-flat">
              <div className="journal-label">Completed Backtests</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{backtestMetrics.completed}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Backtest Hits</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{backtestMetrics.totalHits}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Backtest Straight Hits</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{backtestMetrics.straight}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Backtest Boxed Hits</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{backtestMetrics.boxed}</div>
            </div>
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Top Performing States</h1>
            <p>States with the heaviest accumulated hit footprint in your personal dictionary.</p>
          </div>

          {topStates.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {topStates.map((row, index) => (
                <div key={row.state} className="journal-card-flat">
                  <strong>#{index + 1} {row.state}</strong>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Hits: {row.hits} • Straight: {row.straight} • Boxed: {row.boxed}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No state performance data yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}
