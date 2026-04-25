'use client';

import EngineStatusBadge from '@/components/ui/EngineStatusBadge';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Brain,
  CalendarRange,
  Flame,
  Target,
  Trophy,
  WandSparkles,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listDreamEntries,
  listPersonalHitMappings,
  listPinnedPlays,
} from '@/lib/firebase/firestore';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';
import {
  buildAutoPinSuggestions,
  buildDreamerReliabilityStats,
  buildDuplicateSignals,
  buildTermStrengthStats,
} from '@/lib/intelligence/scoring';
function RefreshNowButton({ ownerUid }: { ownerUid: string }) {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);

  async function run() {
    if (!ownerUid) return;
    setRunning(true);
    setResult(null);
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ownerUid }),
      });
      const data = await res.json();
      setResult(
        data.totalNewHits > 0
          ? `${data.totalNewHits} new hit${data.totalNewHits !== 1 ? 's' : ''} found`
          : `${data.windowsChecked} window${data.windowsChecked !== 1 ? 's' : ''} checked — no new hits`
      );
    } catch {
      setResult('Refresh failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <button
        onClick={run}
        disabled={running || !ownerUid}
        style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: running ? 'rgba(255,255,255,0.05)' : 'rgba(108,120,255,0.18)',
          border: '1px solid rgba(108,120,255,0.35)',
          color: running ? 'rgba(234,234,242,0.45)' : '#b0b8ff',
          cursor: running ? 'default' : 'pointer',
        }}
      >
        {running ? 'Refreshing…' : 'Refresh Now'}
      </button>
      {result && <span style={{ fontSize: 12, color: 'rgba(234,234,242,0.6)' }}>{result}</span>}
    </div>
  );
}
export default function DashboardPage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [pins, setPins] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setWindows([]);
        setMemory([]);
        setPins([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [dreamRows, windowRows, memoryRows, pinRows] = await Promise.all([
          listDreamEntries(user.uid),
          listActiveDreamWindows(user.uid),
          listPersonalHitMappings(user.uid),
          listPinnedPlays(user.uid),
        ]);

        setDreams(dreamRows);
        setWindows(windowRows);
        setMemory(memoryRows);
        setPins(pinRows);
      } catch (err) {
        console.error(err);
        setError('Could not load dashboard data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) void load();
  }, [user, loading]);

  const hotFamilies = useMemo(() => summarizeNumberFamilies(windows, memory), [windows, memory]);
  const termStrengthRows = useMemo(() => buildTermStrengthStats(memory), [memory]);
  const reliabilityRows = useMemo(() => buildDreamerReliabilityStats(pins), [pins]);
  const duplicateSignals = useMemo(() => buildDuplicateSignals(dreams, memory), [dreams, memory]);

  const autoPins = useMemo(() => {
    return buildAutoPinSuggestions({
      hotFamilies,
      filteredMemory: memory,
      selectedState: 'GA',
      dreamerScope: 'ALL',
      reliabilityRows,
    });
  }, [hotFamilies, memory, reliabilityRows]);

  const summary = useMemo(() => {
    const pinned = pins.filter(row => row.status === 'pinned').length;
    const played = pins.filter(row => row.status === 'played').length;
    const won = pins.filter(row => row.status === 'won').length;
    return { pinned, played, won };
  }, [pins]);

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
          <div className="page-header">
            <h1>Control Center</h1>
            <p>
              Your system overview for signals, pinned plays, outcomes, and next best actions.
            </p>
          </div>
        </section>
      <section className="journal-card-flat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <EngineStatusBadge />
          <RefreshNowButton ownerUid={user?.uid ?? ''} />
        </section>
        <section className="journal-card">
          <div className="page-header">
            <h1>System Navigation Hub</h1>
            <p>Fast access to the newest intelligence, research, and integrity tools.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            <a href="/daily-ops" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
              <strong>Daily Ops</strong>
              <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>Operational alerts, diagnosis, and top priorities.</div>
            </a>

            <a href="/forecast-board" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
              <strong>Forecast Board</strong>
              <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>Boosted live watch recommendations by state.</div>
            </a>

            <a href="/backtesting/evidence" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
              <strong>Evidence Rules</strong>
              <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>Universal and personal promotion scoring.</div>
            </a>

            <a href="/integrity" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
              <strong>Integrity Console</strong>
              <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>Audits, safe resets, and data health checks.</div>
            </a>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading control center...</p>
          </section>
        ) : error ? (
          <section className="journal-card" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div
                style={{
                  display: 'grid',
                  gap: '12px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                }}
              >
                <div><div className="journal-label">Dream Entries</div><div>{dreams.length}</div></div>
                <div><div className="journal-label">Active Windows</div><div>{windows.length}</div></div>
                <div><div className="journal-label">Proven Hit Records</div><div>{memory.length}</div></div>
                <div><div className="journal-label">Hot Families</div><div>{hotFamilies.length}</div></div>
                <div><div className="journal-label">Pinned</div><div>{summary.pinned}</div></div>
                <div><div className="journal-label">Played</div><div>{summary.played}</div></div>
                <div><div className="journal-label">Won</div><div>{summary.won}</div></div>
              </div>
            </section>

            <section className="journal-card">
              <div
                style={{
                  display: 'grid',
                  gap: '14px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                <Link href="/forecast-board" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                    <Target size={18} />
                    <strong>Forecast Board</strong>
                  </div>
                  <div style={{ color: 'var(--ink-light)' }}>Review strongest plays, boxed plays, straight plays, and watch-only families.</div>
                </Link>

                <Link href="/intelligence" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                    <Brain size={18} />
                    <strong>Intelligence Hub</strong>
                  </div>
                  <div style={{ color: 'var(--ink-light)' }}>See auto-pin suggestions, strongest terms, reliability, and duplicate alerts.</div>
                </Link>

                <Link href="/daily-ops" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                    <CalendarRange size={18} />
                    <strong>Daily Ops</strong>
                  </div>
                  <div style={{ color: 'var(--ink-light)' }}>Run daily results review, apply win suggestions, and export the play slip.</div>
                </Link>

                <Link href="/performance" className="journal-card-flat" style={{ textDecoration: 'none', color: 'inherit', minHeight: '120px', display: 'grid', alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                    <Trophy size={18} />
                    <strong>Performance</strong>
                  </div>
                  <div style={{ color: 'var(--ink-light)' }}>Track win rates by play type, state, and dreamer scope.</div>
                </Link>
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <WandSparkles size={18} />
                <strong>Top Auto-Pin Suggestions</strong>
              </div>

              {autoPins.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No auto-pin suggestions yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {autoPins.slice(0, 8).map((row, index) => (
                    <div key={row.key} className="journal-card-flat">
                      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <div><div className="journal-label">Rank</div><div>#{index + 1}</div></div>
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

            <section
              style={{
                display: 'grid',
                gap: '24px',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              }}
            >
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <Flame size={18} />
                  <strong>Strongest Hot Families</strong>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  {hotFamilies.slice(0, 8).map((row, index) => (
                    <div key={`${row.gameType}__${row.familyKey}`} className="journal-card-flat">
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                        #{index + 1} — Family {row.familyKey} ({row.gameType})
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                        Forms: {row.forms.join(', ')}
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                        Score: {row.score}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <BookMarked size={18} />
                  <strong>Strongest Terms</strong>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  {termStrengthRows.slice(0, 8).map(row => (
                    <div key={row.term} className="journal-card-flat">
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                        {row.term}
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                        Hits: {row.totalHits} • Strongest State: {row.strongestState}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </section>

            <section
              style={{
                display: 'grid',
                gap: '24px',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              }}
            >
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <Trophy size={18} />
                  <strong>Dreamer Reliability Snapshot</strong>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  {reliabilityRows.slice(0, 8).map(row => (
                    <div key={row.dreamerScope} className="journal-card-flat">
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                        {row.dreamerScope}
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                        Won: {row.won} • Win Rate: {(row.winRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                  <BarChart3 size={18} />
                  <strong>Cleanup Alerts</strong>
                </div>

                {duplicateSignals.length === 0 ? (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    No duplicate cleanup alerts right now.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {duplicateSignals.slice(0, 8).map((row, index) => (
                      <div key={`${row.kind}-${index}`} className="journal-card-flat">
                        <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                          {row.label}
                        </div>
                        <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                          {row.detail}
                        </div>
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
