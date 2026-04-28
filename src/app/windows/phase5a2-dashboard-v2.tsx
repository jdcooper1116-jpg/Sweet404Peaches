'use client';

import EngineStatusBadge from '@/components/ui/EngineStatusBadge';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, BookMarked, Brain, CalendarRange,
  Flame, MoonStar, PenLine, Target, Trophy, WandSparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';
import {
  buildAutoPinSuggestions,
  buildDreamerReliabilityStats,
  buildDuplicateSignals,
  buildTermStrengthStats,
} from '@/lib/intelligence/scoring';

// ─── Design tokens (inline — no CSS class dependency) ─────────────────────────
const T = {
  cream:    '#fff8f2',
  cream2:   '#fff1e8',
  peach:    '#f28a6a',
  clay:     '#b87762',
  plum:     '#7b5a6f',
  ink:      '#2a2024',
  taupe:    '#6b5a60',
  muted:    '#9a8588',
  gold:     '#d8a45b',
  green:    '#3d7a52',
  line:     'rgba(120,90,85,0.15)',
  shadow:   '0 22px 60px rgba(82,39,28,0.14)',
  shadowSm: '0 6px 20px rgba(82,39,28,0.08)',
};

// ─── Shared inline style blocks ────────────────────────────────────────────────
const card: React.CSSProperties = {
  background:    'rgba(255,255,255,0.82)',
  border:        `1px solid ${T.line}`,
  borderRadius:  '28px',
  padding:       '22px 24px',
  boxShadow:     '0 14px 38px rgba(82,39,28,0.09)',
};

const statTile = (color = T.ink): { wrap: React.CSSProperties; num: React.CSSProperties; lbl: React.CSSProperties } => ({
  wrap: {
    background:   T.cream,
    border:       `1px solid ${T.line}`,
    borderRadius: '20px',
    padding:      '14px 18px',
    boxShadow:    T.shadowSm,
  },
  num: {
    fontSize:      '2rem',
    letterSpacing: '-0.06em',
    fontWeight:    800,
    display:       'block',
    lineHeight:    1,
    marginBottom:  '4px',
    color,
  },
  lbl: {
    color:          T.muted,
    fontSize:       '10px',
    fontWeight:     700,
    textTransform:  'uppercase' as const,
    letterSpacing:  '0.09em',
  },
});

const pill = (variant: 'default'|'green'|'plum' = 'default'): React.CSSProperties => ({
  display:       'inline-flex',
  alignItems:    'center',
  borderRadius:  '999px',
  padding:       '5px 12px',
  fontSize:      '11px',
  fontWeight:    700,
  border:        '1px solid',
  ...(variant === 'green' ? {
    background: 'rgba(207,232,214,0.55)', borderColor: 'rgba(61,122,82,0.25)', color: T.green,
  } : variant === 'plum' ? {
    background: 'rgba(123,90,111,0.10)', borderColor: 'rgba(123,90,111,0.25)', color: T.plum,
  } : {
    background: 'white', borderColor: 'rgba(242,138,106,0.25)', color: T.clay,
  }),
});

const actionCard: React.CSSProperties = {
  display:        'grid',
  gap:            '6px',
  textDecoration: 'none',
  color:          'inherit',
  background:     'white',
  border:         `1px solid ${T.line}`,
  borderRadius:   '22px',
  padding:        '16px 18px',
  minHeight:      '44px',
};

const sectionHead: React.CSSProperties = {
  display:       'flex',
  alignItems:    'center',
  gap:           '9px',
  marginBottom:  '14px',
  color:         T.plum,
  fontWeight:    700,
  fontSize:      '16px',
};

// ─── Refresh Now — logic unchanged ────────────────────────────────────────────
function RefreshNowButton({ ownerUid }: { ownerUid: string }) {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);

  async function run() {
    if (!ownerUid) return;
    setRunning(true); setResult(null);
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid }),
      });
      const data = await res.json();
      setResult(
        data.totalNewHits > 0
          ? `${data.totalNewHits} new hit${data.totalNewHits !== 1 ? 's' : ''} found`
          : `${data.windowsChecked ?? 0} windows checked — no new hits`
      );
    } catch { setResult('Refresh failed'); }
    finally   { setRunning(false); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <button onClick={run} disabled={running || !ownerUid}
        style={{
          minHeight: '44px', padding: '10px 20px', borderRadius: '14px',
          background: running ? 'rgba(107,90,96,0.07)' : 'rgba(242,138,106,0.14)',
          border: `1px solid rgba(184,119,98,0.28)`,
          color: running ? T.muted : T.plum, fontWeight: 700, fontSize: '14px', cursor: running ? 'default' : 'pointer',
        }}>
        {running ? 'Refreshing…' : '⚡ Refresh Windows'}
      </button>
      {result && <span style={{ fontSize: '13px', color: T.taupe, fontStyle: 'italic' }}>{result}</span>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();

  // ── Data — all server routes, no client Firestore ─────────────────────────
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
      } catch (err) { console.error(err); setError('Could not load dashboard data.'); }
      finally { setPageLoading(false); }
    }
    if (!authLoading) void load();
  }, [user, authLoading]);

  // ── Intelligence — unchanged ───────────────────────────────────────────────
  const hotFamilies      = useMemo(() => summarizeNumberFamilies(windows, memory), [windows, memory]);
  const termStrengthRows = useMemo(() => buildTermStrengthStats(memory), [memory]);
  const reliabilityRows  = useMemo(() => buildDreamerReliabilityStats(pins), [pins]);
  const duplicateSignals = useMemo(() => buildDuplicateSignals(dreams, memory), [dreams, memory]);
  const autoPins         = useMemo(() => buildAutoPinSuggestions({
    hotFamilies, filteredMemory: memory, selectedState: 'GA', dreamerScope: 'ALL', reliabilityRows,
  }), [hotFamilies, memory, reliabilityRows]);
  const summary = useMemo(() => ({
    pinned: pins.filter(r => r.status === 'pinned').length,
    played: pins.filter(r => r.status === 'played').length,
    won:    pins.filter(r => r.status === 'won').length,
  }), [pins]);

  const today            = new Date().toISOString().slice(0, 10);
  const activeWindowCount = useMemo(() =>
    windows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= today).length,
  [windows, today]);
  const latestDream = dreams[0] ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '28px', minWidth: 0 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        border:        '1px solid rgba(255,255,255,0.90)',
        background:    'linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(255,241,232,0.90) 100%)',
        borderRadius:  '36px',
        padding:       'clamp(24px, 4vw, 36px)',
        boxShadow:     T.shadow,
        overflow:      'hidden',
        position:      'relative',
      }}>
        {/* Peach watermark */}
        <div aria-hidden="true" style={{
          position: 'absolute', right: '-20px', top: '-50px',
          fontSize: '200px', opacity: 0.055, lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
        }}>🍑</div>

        <div style={{
          display:             'grid',
          gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 0.75fr)',
          gap:                 '28px',
          alignItems:          'end',
        }}
          className="peach-hero-grid"
        >
          {/* Left — identity + CTAs */}
          <div>
            {/* Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <span style={pill('green')}>Engine-backed</span>
              <span style={pill()}>
                {activeWindowCount} window{activeWindowCount !== 1 ? 's' : ''} active
              </span>
              <span style={pill('plum')}>Duplicate protected</span>
            </div>

            {/* Heading */}
            <h1 style={{
              fontSize:      'clamp(2.6rem, 5vw, 5rem)',
              lineHeight:    0.9,
              letterSpacing: '-0.07em',
              fontWeight:    800,
              fontStyle:     'italic',
              color:         T.ink,
              margin:        '0 0 14px',
              fontFamily:    'var(--font-display, Georgia, serif)',
            }}>
              Ledger Dashboard
            </h1>

            <p style={{ color: T.taupe, fontSize: '15px', lineHeight: 1.65, margin: '0 0 22px', maxWidth: '50ch' }}>
              Active dream windows, verified hits, and engine-backed intelligence —
              all in one place. Your dream data works even while you sleep.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreams/new" style={{
                display:        'inline-flex', alignItems: 'center', gap: '8px',
                minHeight:      '46px', padding: '11px 24px', borderRadius: '15px',
                background:     `linear-gradient(135deg, ${T.peach}, ${T.clay})`,
                color:          'white', fontWeight: 700, fontSize: '15px',
                textDecoration: 'none', boxShadow: '0 8px 22px rgba(242,138,106,0.32)',
              }}>
                <PenLine size={16} /> Write a Dream
              </Link>
              <Link href="/daily-ops" style={{
                display:        'inline-flex', alignItems: 'center',
                minHeight:      '46px', padding: '11px 20px', borderRadius: '15px',
                background:     'rgba(255,255,255,0.75)',
                border:         `1px solid ${T.line}`,
                color:          T.plum, fontWeight: 600, fontSize: '14px',
                textDecoration: 'none',
              }}>
                Daily Ops
              </Link>
            </div>

            {/* Engine status + refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '20px' }}>
              <EngineStatusBadge />
              <RefreshNowButton ownerUid={user?.uid ?? ''} />
            </div>
          </div>

          {/* Right — stats panel */}
          <div style={{
            background:    'rgba(255,255,255,0.90)',
            border:        '1px solid rgba(255,255,255,0.95)',
            borderRadius:  '26px',
            padding:       '20px 22px',
            boxShadow:     '0 12px 34px rgba(82,39,28,0.09)',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: T.muted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              System Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {([
                ['Active Windows', activeWindowCount, T.peach ],
                ['Hit Records',    memory.length,     T.green ],
                ['Dream Entries',  dreams.length,     T.plum  ],
                ['Hot Families',   hotFamilies.length,T.gold  ],
              ] as [string, number, string][]).map(([label, val, color]) => {
                const s = statTile(color);
                return (
                  <div key={label} style={s.wrap}>
                    <strong style={s.num}>{val}</strong>
                    <span style={s.lbl}>{label}</span>
                  </div>
                );
              })}
            </div>

            {latestDream && (
              <div style={{
                marginTop: '12px', padding: '10px 12px', borderRadius: '14px',
                background: T.cream, border: `1px solid ${T.line}`, fontSize: '12px',
              }}>
                <span style={{ color: T.muted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Latest Dream</span>
                <div style={{ color: T.ink, fontWeight: 600, marginTop: '3px', fontSize: '13px' }}>
                  {latestDream.dreamerName || 'Owner'} · {latestDream.dreamDate}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: collapse hero grid to single column */}
        <style>{`
          @media (max-width: 767px) {
            .peach-hero-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      {/* ── Play outcome KPIs ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        {([
          ['Pinned',     summary.pinned, T.clay  ],
          ['Played',     summary.played, T.plum  ],
          ['Won',        summary.won,    T.green ],
          ['Backtests',  dreams.length,  T.gold  ],
        ] as [string, number, string][]).map(([label, val, color]) => {
          const s = statTile(color);
          return (
            <div key={label} style={s.wrap}>
              <strong style={s.num}>{val}</strong>
              <span style={s.lbl}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Loading / error ───────────────────────────────────────────────── */}
      {pageLoading && (
        <div style={{ ...card, color: T.taupe, fontStyle: 'italic', fontSize: '14px' }}>
          Loading intelligence data…
        </div>
      )}
      {!pageLoading && error && (
        <div style={{ padding: '16px 20px', borderRadius: '16px', border: '1px solid #e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
          {error}
        </div>
      )}

      {!pageLoading && !error && (
        <>
          {/* ── Intelligence Navigation ──────────────────────────────────── */}
          <section style={card}>
            <div style={sectionHead}>
              <Brain size={18} />
              Intelligence Navigation
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              {([
                { href: '/forecast-board', Icon: Target,        label: 'Forecast Board',    desc: 'Strongest plays, boosted by backtest learning.' },
                { href: '/intelligence',   Icon: Brain,         label: 'Intelligence Hub',  desc: 'Auto-pin suggestions, strongest terms, reliability.' },
                { href: '/daily-ops',      Icon: CalendarRange, label: 'Daily Ops',         desc: 'Operational alerts, expiring windows, refresh status.' },
                { href: '/performance',    Icon: Trophy,        label: 'Performance',       desc: 'Win rates by play type, state, and dreamer.' },
                { href: '/hot-numbers',    Icon: Flame,         label: 'Hot Families',      desc: 'Digit family clusters and boxed pattern heat.' },
                { href: '/chat',           Icon: WandSparkles,  label: 'Intelligence Chat', desc: 'Ask about converging numbers and system status.' },
              ]).map(({ href, Icon, label, desc }) => (
                <Link key={href} href={href} style={actionCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '30px', height: '30px', borderRadius: '10px', flexShrink: 0,
                      background: 'rgba(242,138,106,0.10)', display: 'grid', placeItems: 'center', color: T.clay,
                    }}>
                      <Icon size={14} strokeWidth={1.8} />
                    </span>
                    <strong style={{ fontSize: '13px', color: T.plum, letterSpacing: '-0.01em' }}>{label}</strong>
                  </div>
                  <div style={{ color: T.taupe, fontSize: '12px', lineHeight: 1.5, paddingLeft: '40px' }}>{desc}</div>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Dream Ledger Quick Links ─────────────────────────────────── */}
          <section>
            <div style={sectionHead}><MoonStar size={18} />Dream Ledger</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {([
                ['/dreams',      'Dream Journal'       ],
                ['/windows',     'Active Windows'      ],
                ['/hits',        'Hits Detector'       ],
                ['/fell-before', 'As They Fell Before' ],
                ['/dictionary',  'Universal Dictionary'],
                ['/dreamers',    'Dreamers'            ],
              ] as [string, string][]).map(([href, label]) => (
                <Link key={href} href={href} style={{
                  ...actionCard,
                  borderRadius: '18px', padding: '13px 15px',
                  textDecoration: 'none',
                }}>
                  <strong style={{ fontSize: '13px', color: T.ink }}>{label}</strong>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Auto-Pin Suggestions ─────────────────────────────────────── */}
          {autoPins.length > 0 && (
            <section style={card}>
              <div style={sectionHead}><WandSparkles size={18} />Top Auto-Pin Suggestions</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {autoPins.slice(0, 6).map((row: any, i: number) => (
                  <div key={row.key} style={{
                    background: T.cream2, border: `1px solid ${T.line}`,
                    borderRadius: '18px', padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ ...pill(), fontSize: '10px', padding: '3px 9px' }}>#{i + 1}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: T.muted, textTransform: 'uppercase' }}>{row.playType}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: T.ink, fontSize: '15px', letterSpacing: '-0.02em' }}>{row.label}</div>
                    <div style={{ color: T.taupe, fontSize: '12px', marginTop: '4px' }}>{row.state} · Score {row.score}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Hot Families + Strongest Terms ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
            <section style={card}>
              <div style={sectionHead}><Flame size={18} />Hot Families</div>
              {hotFamilies.length === 0
                ? <p style={{ color: T.muted, margin: 0, fontStyle: 'italic', fontSize: '14px' }}>No hot families yet.</p>
                : <div style={{ display: 'grid', gap: '8px' }}>
                    {hotFamilies.slice(0, 6).map((row: any, i: number) => (
                      <div key={`${row.gameType}__${row.familyKey}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px', borderRadius: '13px',
                        background: i === 0 ? 'rgba(242,138,106,0.08)' : T.cream,
                        border: `1px solid ${T.line}`,
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, color: T.plum, fontSize: '14px' }}>{row.familyKey}</span>
                          <span style={{ color: T.muted, fontSize: '11px', marginLeft: '8px' }}>{row.gameType}</span>
                        </div>
                        <span style={{ ...pill(), fontSize: '10px', padding: '3px 9px' }}>{row.score}</span>
                      </div>
                    ))}
                    <Link href="/hot-numbers" style={{ color: T.plum, fontSize: '13px', marginTop: '6px', display: 'inline-block', textDecoration: 'none', fontWeight: 600 }}>
                      All Hot Families →
                    </Link>
                  </div>
              }
            </section>

            <section style={card}>
              <div style={sectionHead}><BookMarked size={18} />Strongest Terms</div>
              {termStrengthRows.length === 0
                ? <p style={{ color: T.muted, margin: 0, fontStyle: 'italic', fontSize: '14px' }}>No term data yet.</p>
                : <div style={{ display: 'grid', gap: '8px' }}>
                    {termStrengthRows.slice(0, 6).map((row: any, i: number) => (
                      <div key={row.term} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px', borderRadius: '13px',
                        background: i === 0 ? 'rgba(61,122,82,0.06)' : T.cream,
                        border: `1px solid ${T.line}`,
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, color: T.plum, fontSize: '14px' }}>{row.term}</span>
                          <span style={{ color: T.muted, fontSize: '11px', marginLeft: '8px' }}>{row.strongestState || '—'}</span>
                        </div>
                        <span style={{ ...pill('green'), fontSize: '10px', padding: '3px 9px' }}>{row.totalHits} hits</span>
                      </div>
                    ))}
                    <Link href="/fell-before" style={{ color: T.plum, fontSize: '13px', marginTop: '6px', display: 'inline-block', textDecoration: 'none', fontWeight: 600 }}>
                      As They Fell Before →
                    </Link>
                  </div>
              }
            </section>
          </div>

          {/* ── Dreamer Reliability + Cleanup Alerts ─────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
            <section style={card}>
              <div style={sectionHead}><Trophy size={18} />Dreamer Reliability</div>
              {reliabilityRows.length === 0
                ? <p style={{ color: T.muted, margin: 0, fontStyle: 'italic', fontSize: '14px' }}>No pinned play outcomes yet.</p>
                : <div style={{ display: 'grid', gap: '8px' }}>
                    {reliabilityRows.slice(0, 5).map((row: any) => (
                      <div key={row.dreamerScope} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px', borderRadius: '13px', background: T.cream, border: `1px solid ${T.line}`,
                      }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: T.ink }}>{row.dreamerScope}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: T.muted }}>Won {row.won}</span>
                          <span style={{ ...pill(), fontSize: '10px', padding: '3px 8px' }}>{(row.winRate * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </section>

            <section style={card}>
              <div style={sectionHead}><BarChart3 size={18} />Cleanup Alerts</div>
              {duplicateSignals.length === 0
                ? <p style={{ color: T.muted, margin: 0, fontStyle: 'italic', fontSize: '14px' }}>No duplicate alerts right now.</p>
                : <div style={{ display: 'grid', gap: '8px' }}>
                    {duplicateSignals.slice(0, 5).map((row: any, i: number) => (
                      <div key={`${row.kind}-${i}`} style={{
                        padding: '9px 12px', borderRadius: '13px',
                        background: 'rgba(181,91,80,0.05)', border: '1px solid rgba(181,91,80,0.14)',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: T.ink }}>{row.label}</div>
                        <div style={{ color: T.muted, fontSize: '12px', marginTop: '3px' }}>{row.detail}</div>
                      </div>
                    ))}
                    <Link href="/cleanup" style={{ color: T.plum, fontSize: '13px', marginTop: '6px', display: 'inline-block', textDecoration: 'none', fontWeight: 600 }}>
                      Cleanup Tools →
                    </Link>
                  </div>
              }
            </section>
          </div>
        </>
      )}
    </div>
  );
}
