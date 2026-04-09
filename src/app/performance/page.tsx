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
import { buildPerformanceInsights } from '@/lib/intelligence/analystEngine';

function getDreamEntryId(row: any) {
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
      dreamHits.map((hit: any) => String(hit?.sourceDreamEntryId ?? '')).filter(Boolean)
    );

    const straight = dreamHits.filter((hit: any) => hit.hitType === 'straight').length;
    const boxed = dreamHits.filter((hit: any) => hit.hitType === 'boxed').length;

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

  const insights = useMemo(
    () =>
      buildPerformanceInsights({
        dreamHits,
        personalRows: mappingRows,
        backtestSummaries,
      }),
    [dreamHits, mappingRows, backtestSummaries]
  );

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
                Truth dashboard for live hit performance, backtest performance, timing, and strongest state/term/game signals.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/daily-ops" className="btn-secondary">Daily Ops</Link>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
            </div>
          </div>
        </section>

        {loading ? <section className="journal-card"><p>Loading Performance...</p></section> : null}
        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Live-Mode Metrics</h1>
            <p>How the active dream engine is performing.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            <div className="journal-card-flat"><div className="journal-label">Tracked Live Dreams</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.trackedDreamCount}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Dreams With Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.hitDreamCount}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Hit Rate</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.hitRate}%</div></div>
            <div className="journal-card-flat"><div className="journal-label">Hit Events</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.totalHitEvents}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Straight Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.straight}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Boxed Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{liveMetrics.boxed}</div></div>
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
              <h1>Timing Metrics</h1>
              <p>How fast hits tend to arrive.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              <div className="journal-card-flat">Average Days to Hit: {insights.avgDaysToHit}</div>
              <div className="journal-card-flat">Fastest Hit Day: {insights.fastestHitDay ?? '—'}</div>
              <div className="journal-card-flat">Slowest Hit Day: {insights.slowestHitDay ?? '—'}</div>
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Top Signals</h1>
              <p>Strongest current signals across live and research memory.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              <div className="journal-card-flat">
                Top State: {insights.topState ? `${insights.topState.state} (${insights.topState.hits} hits)` : '—'}
              </div>
              <div className="journal-card-flat">
                Top Term: {insights.topTerm ? `${insights.topTerm.term} (${insights.topTerm.hits} hits)` : '—'}
              </div>
              <div className="journal-card-flat">
                Top Game: {insights.topGame ? `${insights.topGame.gameType} (${insights.topGame.hits} hits)` : '—'}
              </div>
            </div>
          </section>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Backtest Metrics</h1>
            <p>How the research lane is performing overall.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            <div className="journal-card-flat"><div className="journal-label">Completed Backtests</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{insights.backtestTotals.completed}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Backtest Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{insights.backtestTotals.totalHits}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Backtest Straight Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{insights.backtestTotals.straight}</div></div>
            <div className="journal-card-flat"><div className="journal-label">Backtest Boxed Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{insights.backtestTotals.boxed}</div></div>
          </div>
        </section>
      </section>
    </main>
  );
}
