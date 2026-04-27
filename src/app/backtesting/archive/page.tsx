'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function BacktestingArchivePage() {
  const { user } = useAuth();
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setRows([]); setLoading(false); return; }
      try {
        const res  = await fetch(`/api/backtest/list-dreams?ownerUid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to load archive.');
        setRows(Array.isArray(data.dreams) ? data.dreams : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load Backtest Archive.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user]);

  const totals = useMemo(() =>
    rows.reduce((acc, r) => {
      acc.dreams++;
      acc.hits     += r.totalHits     ?? 0;
      acc.straight += r.straightHits  ?? 0;
      acc.boxed    += r.boxedHits     ?? 0;
      return acc;
    }, { dreams: 0, hits: 0, straight: 0, boxed: 0 }),
  [rows]);

  const engineCount = rows.filter(r => r.replaySource === 'lottery-engine').length;
  const manualCount = rows.filter(r => r.replaySource && r.replaySource !== 'lottery-engine').length;

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background:
        'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), ' +
        'radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), ' +
        'linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
    }}>
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Backtest Archive</h1>
              <p>All saved historical dreams with replay status, hit summaries, and source attribution.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/intake" className="btn-secondary">Dream Intake</Link>
              <Link href="/backtesting/replay" className="btn-secondary">Replay Lab</Link>
            </div>
          </div>
        </section>

        {/* Totals */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {[
            ['Dreams', totals.dreams],
            ['Total Hits', totals.hits],
            ['Straight', totals.straight],
            ['Boxed', totals.boxed],
            ['⚡ Engine Replayed', engineCount],
            ['Manual Replayed', manualCount],
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div className="journal-label">{label}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </section>

        {loading && <section className="journal-card"><p>Loading archive…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}
        {!loading && !rows.length && <section className="journal-card"><p>No backtest dreams saved yet. Go to <Link href="/backtesting/intake" style={{ color: '#b0b8ff' }}>Historical Dream Intake</Link> to add one.</p></section>}

        {rows.map(row => {
          const isEngine  = row.replaySource === 'lottery-engine';
          const isManual  = row.replaySource && !isEngine;
          const isPending = !row.replaySource || row.status === 'intake-saved';

          return (
            <section key={row.id} className="journal-card" style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{row.dreamDate || 'No Date'}</h2>
                  <div style={{ marginTop: '6px', fontSize: '14px', color: 'var(--ink-light)' }}>
                    {row.activeWindowStart || '—'} → {row.activeWindowEnd || '—'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.4 }}>ID: {row.id}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                    background: isEngine ? 'rgba(74,124,89,0.2)' : isManual ? 'rgba(160,124,74,0.2)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isEngine ? 'rgba(74,124,89,0.5)' : isManual ? 'rgba(160,124,74,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    color: isEngine ? '#6dbf8a' : isManual ? '#d4a95a' : 'rgba(255,255,255,0.35)',
                  }}>
                    {isEngine ? '⚡ Engine' : isManual ? 'Manual' : 'Pending'}
                  </span>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                    background: row.status?.includes('complete') ? 'rgba(108,120,255,0.14)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(108,120,255,0.2)',
                    color: row.status?.includes('complete') ? '#b0b8ff' : 'rgba(255,255,255,0.35)',
                  }}>
                    {row.status || '—'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {[
                  ['Source', row.source],
                  ['Pick 3', `${row.cash3Numbers?.length ?? 0} cands`],
                  ['Pick 4', `${row.cash4Numbers?.length ?? 0} cands`],
                  ['Total Hits', row.totalHits ?? 0],
                  ['Straight', row.straightHits ?? 0],
                  ['Boxed', row.boxedHits ?? 0],
                  ['States', row.uniqueStatesCount ?? 0],
                  ['Best State', row.bestState || '—'],
                  ['Best Term', row.bestTerm || '—'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="journal-card-flat">
                    <div className="journal-label">{label}</div>
                    <div style={{
                      fontWeight: label === 'Total Hits' || label === 'Straight' || label === 'Boxed' ? 700 : 400,
                      color: label === 'Straight' ? '#6dbf8a' : label === 'Boxed' ? '#d4a95a' : 'inherit',
                    }}>{val}</div>
                  </div>
                ))}
              </div>

              {isPending && (
                <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                  No replay yet.{' '}
                  <Link href="/backtesting/replay" style={{ color: '#b0b8ff' }}>Open Replay Lab</Link>
                  {' '}→ select this dream → ⚡ Run via Engine.
                </p>
              )}
            </section>
          );
        })}
      </section>
    </main>
  );
}
