'use client';

import EngineStatusBadge from '@/components/ui/EngineStatusBadge';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BookMarked, Brain, CalendarRange, Flame, Target, Trophy, WandSparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';
import { buildAutoPinSuggestions, buildDreamerReliabilityStats, buildDuplicateSignals, buildTermStrengthStats } from '@/lib/intelligence/scoring';

// ─── Refresh Now button (already server-side — unchanged) ─────────────────────

function RefreshNowButton({ ownerUid }: { ownerUid: string }) {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);

  async function run() {
    if (!ownerUid) return;
    setRunning(true); setResult(null);
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ ownerUid }),
      });
      const data = await res.json();
      setResult(
        data.totalNewHits > 0
          ? `${data.totalNewHits} new hit${data.totalNewHits !== 1 ? 's' : ''} found`
          : `${data.windowsChecked ?? 0} windows checked — no new hits`
      );
    } catch { setResult('Refresh failed'); }
    finally { setRunning(false); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <button onClick={run} disabled={running || !ownerUid} style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        background: running ? 'rgba(255,255,255,0.05)' : 'rgba(108,120,255,0.18)',
        border: '1px solid rgba(108,120,255,0.35)',
        color: running ? 'rgba(234,234,242,0.45)' : '#b0b8ff',
        cursor: running ? 'default' : 'pointer',
      }}>
        {running ? 'Refreshing…' : 'Refresh Now'}
      </button>
      {result && <span style={{ fontSize: 12, color: 'rgba(234,234,242,0.6)' }}>{result}</span>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();

  // All data loaded from server routes — no client Firestore
  const [dreams,      setDreams]      = useState<any[]>([]);
  const [windows,     setWindows]     = useState<any[]>([]);
  const [memory,      setMemory]      = useState<any[]>([]);
  const [pins,        setPins]        = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error,       setError]       = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setPageLoading(false); return; }
      setError('');
      try {
        const uid = encodeURIComponent(user.uid);
        const [dreamsRes, windowsRes, memoryRes, pinsRes] = await Promise.all([
          fetch(`/api/dreams/entries?ownerUid=${uid}`),
          fetch(`/api/dreams/windows?ownerUid=${uid}`),
          fetch(`/api/fell-before?ownerUid=${uid}`),
          fetch(`/api/pinned-plays?ownerUid=${uid}`),
        ]);

        const [dreamsData, windowsData, memoryData, pinsData] = await Promise.all([
          dreamsRes.json(), windowsRes.json(), memoryRes.json(), pinsRes.json(),
        ]);

        if (dreamsData.ok)  setDreams(dreamsData.entries   ?? []);
        if (windowsData.ok) setWindows(windowsData.windows ?? []);
        if (memoryData.ok)  setMemory(memoryData.rows       ?? []);
        if (pinsData.ok)    setPins(pinsData.plays           ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load dashboard data.');
      } finally { setPageLoading(false); }
    }
    if (!authLoading) void load();
  }, [user, authLoading]);

  // Intelligence computations — unchanged, just fed from server routes now
  const hotFamilies      = useMemo(() => summarizeNumberFamilies(windows, memory), [windows, memory]);
  const termStrengthRows = useMemo(() => buildTermStrengthStats(memory), [memory]);
  const reliabilityRows  = useMemo(() => buildDreamerReliabilityStats(pins), [pins]);
  const duplicateSignals = useMemo(() => buildDuplicateSignals(dreams, memory), [dreams, memory]);

  const autoPins = useMemo(() => buildAutoPinSuggestions({
    hotFamilies, filteredMemory: memory, selectedState: 'GA',
    dreamerScope: 'ALL', reliabilityRows,
  }), [hotFamilies, memory, reliabilityRows]);

  const summary = useMemo(() => ({
    pinned: pins.filter(r => r.status === 'pinned').length,
    played: pins.filter(r => r.status === 'played').length,
    won:    pins.filter(r => r.status === 'won').length,
  }), [pins]);

  // Active windows count (windows with activeEnd >= today)
  const today = new Date().toISOString().slice(0, 10);
  const activeWindowCount = useMemo(() =>
    windows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= today).length,
  [windows, today]);

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
          <div className="page-header">
            <h1>Control Center</h1>
            <p>System overview for signals, pinned plays, outcomes, and next best actions.</p>
          </div>
        </section>

        {/* Engine status + refresh */}
        <section className="journal-card-flat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <EngineStatusBadge />
          <RefreshNowButton ownerUid={user?.uid ?? ''} />
        </section>

        {/* Nav hub */}
        <section className="journal-card">
          <div className="page-header">
            <h1>System Navigation Hub</h1>
            <p>Fast access to intelligence, research, and integrity tools.</p>
          </div>
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '12px' }}>
            {[
              { href: '/daily-ops',            label: 'Daily Ops',          desc: 'Operational alerts, diagnosis, and top priorities.' },
              { href: '/forecast-board',       label: 'Forecast Board',     desc: 'Boosted live watch recommendations by state.' },
              { href: '/backtesting/evidence', label: 'Evidence Rules',     desc: 'Universal and personal promotion scoring.' },
              { href: '/integrity',            label: 'Integrity Console',  desc: 'Audits, safe resets, and data health checks.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} className="journal-card-flat"
                style={{ textDecoration: 'none', color: 'inherit', minHeight: '100px', display: 'grid', alignContent: 'start' }}>
                <strong>{label}</strong>
                <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '13px' }}>{desc}</div>
              </a>
            ))}
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card"><p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading control center…</p></section>
        ) : error ? (
          <section className="journal-card" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>
        ) : (
          <>
            {/* Stats strip */}
            <section className="journal-card-flat">
              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                {[
                  ['Dream Entries',   dreams.length],
                  ['Active Windows',  activeWindowCount],
                  ['Hit Records',     memory.length],
                  ['Hot Families',    hotFamilies.length],
                  ['Pinned',          summary.pinned],
                  ['Played',          summary.played],
                  ['Won',             summary.won],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <div className="journal-label">{label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{val}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick links */}
            <section className="journal-card">
              <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {[
                  { href: '/forecast-board', icon: Target,    label: 'Forecast Board',    desc: 'Strongest plays, boxed plays, straight plays.' },
                  { href: '/intelligence',   icon: Brain,     label: 'Intelligence Hub',  desc: 'Auto-pin suggestions, strongest terms, reliability.' },
                  { href: '/daily-ops',      icon: CalendarRange, label: 'Daily Ops',     desc: 'Daily results review, alerts, play slip.' },
                  { href: '/performance',    icon: Trophy,    label: 'Performance',       desc: 'Win rates by play type, state, and dreamer.' },
                ].map(({ href, icon: Icon, label, desc }) => (
                  <Link key={href} href={href} className="journal-card-flat"
                    style={{ textDecoration: 'none', color: 'inherit', minHeight: '110px', display: 'grid', alignContent: 'start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                      <Icon size={18} /><strong>{label}</strong>
                    </div>
                    <div style={{ color: 'var(--ink-light)', fontSize: '13px' }}>{desc}</div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Auto-pin suggestions */}
            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <WandSparkles size={18} /><strong>Top Auto-Pin Suggestions</strong>
              </div>
              {autoPins.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>No auto-pin suggestions yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {autoPins.slice(0, 8).map((row: any, i: number) => (
                    <div key={row.key} className="journal-card-flat">
                      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', fontSize: '13px' }}>
                        <div><div className="journal-label">Rank</div><div>#{i + 1}</div></div>
                        <div><div className="journal-label">Label</div><div>{row.label}</div></div>
                        <div><div className="journal-label">Type</div><div>{row.playType}</div></div>
                        <div><div className="journal-label">State</div><div>{row.state}</div></div>
                        <div><div className="journal-label">Score</div><div>{row.score}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Hot families + Strongest terms */}
            <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <Flame size={18} /><strong>Hot Families</strong>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {hotFamilies.slice(0, 6).map((row: any, i: number) => (
                    <div key={`${row.gameType}__${row.familyKey}`} className="journal-card-flat" style={{ fontSize: '13px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '4px' }}>
                        #{i + 1} — Family {row.familyKey} ({row.gameType})
                      </div>
                      <div style={{ color: 'var(--ink-light)' }}>Forms: {row.forms?.join(', ')} · Score: {row.score}</div>
                    </div>
                  ))}
                  {hotFamilies.length === 0 && <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No hot families yet.</p>}
                </div>
              </section>

              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <BookMarked size={18} /><strong>Strongest Terms</strong>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {termStrengthRows.slice(0, 6).map((row: any) => (
                    <div key={row.term} className="journal-card-flat" style={{ fontSize: '13px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '4px' }}>{row.term}</div>
                      <div style={{ color: 'var(--ink-light)' }}>Hits: {row.totalHits} · Best State: {row.strongestState}</div>
                    </div>
                  ))}
                  {termStrengthRows.length === 0 && <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No term data yet.</p>}
                </div>
              </section>
            </section>

            {/* Dreamer reliability + Cleanup alerts */}
            <section style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <Trophy size={18} /><strong>Dreamer Reliability</strong>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {reliabilityRows.slice(0, 6).map((row: any) => (
                    <div key={row.dreamerScope} className="journal-card-flat" style={{ fontSize: '13px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '4px' }}>{row.dreamerScope}</div>
                      <div style={{ color: 'var(--ink-light)' }}>Won: {row.won} · Win Rate: {(row.winRate * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                  {reliabilityRows.length === 0 && <p style={{ color: 'var(--ink-light)', margin: 0, fontSize: '13px' }}>No pinned play outcomes yet.</p>}
                </div>
              </section>

              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <BarChart3 size={18} /><strong>Cleanup Alerts</strong>
                </div>
                {duplicateSignals.length === 0 ? (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)', fontSize: '13px' }}>No duplicate cleanup alerts right now.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {duplicateSignals.slice(0, 6).map((row: any, i: number) => (
                      <div key={`${row.kind}-${i}`} className="journal-card-flat" style={{ fontSize: '13px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '4px' }}>{row.label}</div>
                        <div style={{ color: 'var(--ink-light)' }}>{row.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
