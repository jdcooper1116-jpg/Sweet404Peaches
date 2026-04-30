// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildPerformanceInsights } from '@/lib/intelligence/analystEngine';

function getDreamEntryId(row: any) {
  return String(row?.dreamEntryId ?? row?.sourceDreamEntryId ?? row?.id ?? '');
}

export default function PerformancePage() {
  const { user } = useAuth();

  // All data from server routes — no client Firestore
  const [activeWindows,     setActiveWindows]      = useState<any[]>([]);
  const [dreamHits,         setDreamHits]          = useState<any[]>([]);
  const [mappingRows,       setMappingRows]         = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries]  = useState<any[]>([]);
  const [loading,           setLoading]            = useState(true);
  const [error,             setError]              = useState('');
  const [quotaError,        setQuotaError]         = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [winRes, hitRes, memRes, dreamRes] = await Promise.all([
          fetch(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
          fetch(`/api/dreams/hits?ownerUid=${uid}&limit=100`),
          fetch(`/api/fell-before?ownerUid=${uid}&limit=250`),
          fetch(`/api/backtest/list-dreams?ownerUid=${uid}`),
        ]);
        const [winData, hitData, memData, dreamData] = await Promise.all([
          winRes.json(), hitRes.json(), memRes.json(), dreamRes.json(),
        ]);

        if (winData.ok)   setActiveWindows(winData.windows       ?? []);
        if (hitData.ok)   setDreamHits(hitData.hits              ?? []);
        if (memData.ok)   setMappingRows(memData.rows            ?? []);
        if (dreamData.ok) setBacktestSummaries(dreamData.dreams  ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load Performance data.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Live metrics computed from real data
  const liveMetrics = useMemo(() => {
    const trackedIds = new Set(activeWindows.map(getDreamEntryId).filter(Boolean));
    const hitIds     = new Set(dreamHits.map(h => String(h?.dreamEntryId ?? h?.sourceDreamEntryId ?? '')).filter(Boolean));
    const straight   = dreamHits.filter(h => h.match_type === 'exact' || h.hitType === 'straight').length;
    const boxed      = dreamHits.filter(h => h.match_type === 'box'   || h.hitType === 'boxed').length;
    const trackedDreamCount = trackedIds.size;
    const hitDreamCount     = hitIds.size;
    return {
      trackedDreamCount,
      hitDreamCount,
      totalHitEvents: dreamHits.length,
      straight, boxed,
      hitRate:         trackedDreamCount ? Math.round((hitDreamCount / trackedDreamCount) * 100) : 0,
      dictionaryRows:  mappingRows.length,
    };
  }, [activeWindows, dreamHits, mappingRows]);

  // Intelligence insights — unchanged computation
  const insights = useMemo(() =>
    buildPerformanceInsights({ dreamHits, personalRows: mappingRows, backtestSummaries }),
    [dreamHits, mappingRows, backtestSummaries]
  );

  // By-dreamer hit breakdown
  const dreamerBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; hits: number; straight: number; boxed: number }>();
    for (const h of dreamHits) {
      const did  = String(h.dreamerId   || 'owner-self');
      const name = String(h.dreamerName || did);
      const prev = map.get(did);
      if (!prev) map.set(did, { name, hits: 0, straight: 0, boxed: 0 });
      const e = map.get(did)!;
      e.hits++;
      if (h.match_type === 'exact' || h.hitType === 'straight') e.straight++;
      else e.boxed++;
    }
    return Array.from(map.values()).sort((a, b) => b.hits - a.hits);
  }, [dreamHits]);

  // By-state hit breakdown
  const stateBreakdown = useMemo(() => {
    const map = new Map<string, { hits: number; straight: number }>();
    for (const h of dreamHits) {
      const st = String(h.state || '');
      if (!st) continue;
      const prev = map.get(st);
      if (!prev) map.set(st, { hits: 0, straight: 0 });
      const e = map.get(st)!;
      e.hits++;
      if (h.match_type === 'exact') e.straight++;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].hits - a[1].hits).slice(0, 10);
  }, [dreamHits]);

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="page-header">
              <h1>Performance</h1>
              <p>Real system analytics — live hit performance, backtest performance, timing, and strongest signals.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/daily-ops"          className="btn-secondary">Daily Ops</Link>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
            </div>
          </div>
        </section>

        {loading && <section className="journal-card"><p>Loading performance data…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>{error}</section>}

        {/* Live metrics */}
        <section className="journal-card">
          <div className="page-header"><h1>Live-Mode Metrics</h1><p>How the active dream engine is performing.</p></div>
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: '12px' }}>
            {[
              ['Tracked Live Dreams',  liveMetrics.trackedDreamCount],
              ['Dreams With Hits',     liveMetrics.hitDreamCount],
              ['Hit Rate',             liveMetrics.hitRate + '%'],
              ['Total Hit Events',     liveMetrics.totalHitEvents],
              ['Straight / Exact',     liveMetrics.straight],
              ['Boxed Hits',           liveMetrics.boxed],
              ['Dictionary Rows',      liveMetrics.dictionaryRows],
              ['Active Windows',       activeWindows.length],
            ].map(([label, val]) => (
              <div key={String(label)} className="journal-card-flat">
                <div className="journal-label">{label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {/* Timing */}
          <section className="journal-card">
            <div className="page-header"><h1>Timing Metrics</h1><p>How fast hits tend to arrive after dream date.</p></div>
            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {[
                ['Average Days to Hit', insights.avgDaysToHit  ?? '—'],
                ['Fastest Hit Day',     insights.fastestHitDay ?? '—'],
                ['Slowest Hit Day',     insights.slowestHitDay ?? '—'],
              ].map(([label, val]) => (
                <div key={String(label)} className="journal-card-flat" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>{label}</span>
                  <strong>{val}</strong>
                </div>
              ))}
            </div>
          </section>

          {/* Top signals */}
          <section className="journal-card">
            <div className="page-header"><h1>Top Signals</h1><p>Strongest current signals across live and research memory.</p></div>
            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              <div className="journal-card-flat" style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Top State</span>
                <strong>{insights.topState ? `${insights.topState.state} (${insights.topState.hits} hits)` : '—'}</strong>
              </div>
              <div className="journal-card-flat" style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Top Term</span>
                <strong>{insights.topTerm  ? `${insights.topTerm.term} (${insights.topTerm.hits} hits)` : '—'}</strong>
              </div>
              <div className="journal-card-flat" style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Top Game</span>
                <strong>{insights.topGame  ? `${insights.topGame.gameType} (${insights.topGame.hits} hits)` : '—'}</strong>
              </div>
            </div>
          </section>
        </section>

        {/* Backtest metrics */}
        <section className="journal-card">
          <div className="page-header"><h1>Backtest Metrics</h1><p>How the historical research lane is performing.</p></div>
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: '12px' }}>
            {[
              ['Completed Backtests',   insights.backtestTotals?.completed  ?? 0],
              ['Backtest Hits',         insights.backtestTotals?.totalHits  ?? 0],
              ['Straight Hits',         insights.backtestTotals?.straight   ?? 0],
              ['Boxed Hits',            insights.backtestTotals?.boxed      ?? 0],
            ].map(([label, val]) => (
              <div key={String(label)} className="journal-card-flat">
                <div className="journal-label">{label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>
        </section>

        {/* By-Dreamer Breakdown */}
        {dreamerBreakdown.length > 0 && (
          <section className="journal-card">
            <h2 style={{ margin:'0 0 14px', fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Hits by Dreamer</h2>
            <div style={{ display:'grid', gap:'6px' }}>
              {dreamerBreakdown.map((d: any) => (
                <div key={d.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderRadius:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', fontSize:'13px' }}>
                  <strong style={{ color:'#fff' }}>{d.name}</strong>
                  <div style={{ display:'flex', gap:'12px', color:'rgba(255,255,255,0.55)' }}>
                    <span>{d.hits} hits</span>
                    <span style={{ color:'#60e09a' }}>{d.straight} straight</span>
                    <span style={{ color:'#ffcc50' }}>{d.boxed} boxed</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* By-State Breakdown */}
        {stateBreakdown.length > 0 && (
          <section className="journal-card">
            <h2 style={{ margin:'0 0 14px', fontSize:'1.05rem', fontWeight:900, fontFamily:'system-ui,sans-serif', color:'#fff' }}>Hits by State</h2>
            <div style={{ display:'grid', gap:'6px' }}>
              {stateBreakdown.map(([state, data]: [string, any]) => (
                <div key={state} style={{ display:'flex', justifyContent:'space-between', padding:'9px 12px', borderRadius:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', fontSize:'13px' }}>
                  <strong style={{ color:'#a090ff' }}>{state}</strong>
                  <span style={{ color:'rgba(255,255,255,0.55)' }}>{data.hits} hit{data.hits!==1?'s':''} · {data.straight} straight</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* No Played/Won disclaimer */}
        <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7 }}>
          <strong style={{ color:'rgba(255,255,255,0.60)' }}>About this report:</strong> Live results are based on detected dream hits (engine-confirmed matches between active candidate numbers and real draw results), not manual played-number tracking. Played/Won outcome tracking is not yet available — current statuses are <em>suggested</em>, <em>pinned</em>, and <em>archived</em> only.
        </section>

    </div>
  );
}
