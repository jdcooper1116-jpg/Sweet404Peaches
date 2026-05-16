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

// ─── Design tokens — rich modern palette ─────────────────────────────────────
const T = {
  // Aurora Glass tokens
  white:    'rgba(255,255,255,0.09)',
  cream:    'rgba(255,255,255,0.06)',
  cream2:   'rgba(255,255,255,0.04)',
  peach:    '#ff6b4a',
  peach2:   '#ff8a6a',
  clay:     '#e8553a',
  plum:     '#a090ff',
  gold:     '#ffcc50',
  green:    '#60e09a',
  red:      '#ff5555',
  ink:      '#ffffff',
  ink2:     'rgba(255,255,255,0.85)',
  taupe:    'rgba(255,255,255,0.65)',
  muted:    'rgba(255,255,255,0.40)',
  line:     'rgba(255,255,255,0.12)',
  shadow:   '0 24px 64px rgba(0,0,0,0.40)',
  shadowSm: '0 8px 28px rgba(0,0,0,0.28)',
  shadowCard: '0 2px 12px rgba(0,0,0,0.20)',
};

// ─── Shared inline style blocks ────────────────────────────────────────────────
const card: React.CSSProperties = {
  background:              'rgba(255,255,255,0.08)',
  border:                  '1px solid rgba(255,255,255,0.13)',
  borderRadius:            '22px',
  padding:                 '24px 26px',
  backdropFilter:          'blur(20px)',
  WebkitBackdropFilter:    'blur(20px)',
};

const statTile = (color = T.ink): { wrap: React.CSSProperties; num: React.CSSProperties; lbl: React.CSSProperties } => ({
  wrap: {
    background:   T.white,
    border:       `1px solid ${T.line}`,
    borderRadius: '18px',
    padding:      '16px 20px',
    boxShadow:    T.shadowCard,
  },
  num: {
    fontSize:      '2.4rem',
    letterSpacing: '-0.05em',
    fontWeight:    900,
    display:       'block',
    lineHeight:    1,
    marginBottom:  '6px',
    color,
    fontFamily:    'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  lbl: {
    color:          T.muted,
    fontSize:       '11px',
    fontWeight:     700,
    textTransform:  'uppercase' as const,
    letterSpacing:  '0.08em',
  },
});

const pill = (variant: 'default'|'green'|'plum' = 'default'): React.CSSProperties => ({
  display:      'inline-flex',
  alignItems:   'center',
  borderRadius: '999px',
  padding:      '5px 13px',
  fontSize:     '11px',
  fontWeight:   700,
  border:       '1px solid',
  letterSpacing:'0.02em',
  ...(variant === 'green' ? {
    background: 'rgba(31,107,64,0.10)', borderColor: 'rgba(31,107,64,0.28)', color: T.green,
  } : variant === 'plum' ? {
    background: 'rgba(61,26,44,0.08)', borderColor: 'rgba(61,26,44,0.22)', color: T.plum,
  } : {
    background: 'rgba(232,87,46,0.08)', borderColor: 'rgba(232,87,46,0.28)', color: T.peach,
  }),
});

const actionCard: React.CSSProperties = {
  display:        'grid',
  gap:            '6px',
  textDecoration: 'none',
  color:          'inherit',
  background:     T.white,
  border:         `1px solid ${T.line}`,
  borderRadius:   '20px',
  padding:        '16px 18px',
  minHeight:      '44px',
  boxShadow:      T.shadowCard,
};

const sectionHead: React.CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  gap:          '9px',
  marginBottom: '16px',
  color:        T.plum,
  fontWeight:   800,
  fontSize:     '15px',
  letterSpacing:'-0.01em',
  fontFamily:   'system-ui, -apple-system, "Segoe UI", sans-serif',
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
  const [windowsCapped, setWindowsCapped] = useState(false);
  const [windowsTotal,  setWindowsTotal]  = useState(0);
  const [memory,      setMemory]      = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error,       setError]       = useState('');
  const [quotaError,  setQuotaError]  = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) { setPageLoading(false); return; }
      setError('');
      try {
        const uid = encodeURIComponent(user.uid);
        const [dreamsRes, windowsRes, memoryRes] = await Promise.all([
          fetch(`/api/dreams/entries?ownerUid=${uid}`),
          fetch(`/api/dreams/window-groups?ownerUid=${uid}&limit=50`),
          fetch(`/api/fell-before?ownerUid=${uid}`),
        ]);
        const [dreamsData, windowsData, memoryData] = await Promise.all([
          dreamsRes.json(), windowsRes.json(), memoryRes.json(),
        ]);
        if (dreamsData.ok)  setDreams(dreamsData.entries   ?? []);
        if (windowsData.ok) setWindows(windowsData.windows ?? []);
          setWindowsCapped(windowsData.capped ?? false);
          setWindowsTotal(windowsData.totalActiveWindows ?? 0);
        if (memoryData.ok)  setMemory(memoryData.rows       ?? []);
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        const isQuota = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
        if (isQuota) setQuotaError(true);
        setError(isQuota ? 'Firebase quota exhausted. Data may be incomplete. Try again later.' : 'Could not load dashboard data.');
      }
      finally { setPageLoading(false); }
    }
    if (!authLoading) void load();
  }, [user, authLoading]);

  // ── Intelligence — unchanged ───────────────────────────────────────────────
  const hotFamilies      = useMemo(() => summarizeNumberFamilies(windows, memory), [windows, memory]);
  const termStrengthRows = useMemo(() => buildTermStrengthStats(memory), [memory]);
  const reliabilityRows: any[] = [];
  const duplicateSignals = useMemo(() => buildDuplicateSignals(dreams, memory), [dreams, memory]);
  const autoPins         = useMemo(() => buildAutoPinSuggestions({
    hotFamilies, filteredMemory: memory, selectedState: 'GA', dreamerScope: 'ALL', reliabilityRows,
  }), [hotFamilies, memory, reliabilityRows]);

  const today = new Date().toISOString().slice(0, 10);

  // Group raw window rows by dreamEntryId (same logic as Active Windows page)
  const groupedWindows = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of windows) {
      // Each element of `windows` is a flat active_dream_window row (one number per row).
      // Key by dreamEntryId so all rows from the same dream become one group.
      const key = row.dreamEntryId || row.id || row.dreamId || Math.random().toString();
      if (!map.has(key)) {
        map.set(key, {
          ...row,
          cash3Numbers: [],
          cash4Numbers: [],
          totalWatchItems: 0,   // count incremented below — row.totalWatchItems is undefined on flat rows
        });
      }
      const g = map.get(key)!;
      const gt  = String(row.gameType ?? '');
      const num = String(row.number   ?? '').trim();
      if (num) {
        if (gt === 'cash4') { if (!g.cash4Numbers.includes(num)) g.cash4Numbers.push(num); }
        else                { if (!g.cash3Numbers.includes(num)) g.cash3Numbers.push(num); }
      }
      g.totalWatchItems++;   // one flat row = one watch item
      // Keep latest activeEnd so the group survives the active filter
      if ((row.activeEnd ?? '') > (g.activeEnd ?? '')) {
        g.activeEnd   = row.activeEnd;
        g.activeStart = row.activeStart;
      }
      // Accumulate newHitsSinceLastCheck across all windows in the group
      g.newHitsSinceLastCheck = (g.newHitsSinceLastCheck ?? 0) + (Number(row.newHitsSinceLastCheck) || 0);
    }
    return Array.from(map.values());
  }, [windows]);

  const activeGroups     = useMemo(() => groupedWindows.filter(g => (g.activeEnd ?? '') >= today), [groupedWindows, today]);
  const activeWindowCount = activeGroups.length;
  const watchItems       = useMemo(() => activeGroups.reduce((s, g) => s + (g.totalWatchItems || 0), 0), [activeGroups]);
  const cash3Count       = useMemo(() => new Set(activeGroups.flatMap(g => g.cash3Numbers ?? [])).size, [activeGroups]);
  const cash4Count       = useMemo(() => new Set(activeGroups.flatMap(g => g.cash4Numbers ?? [])).size, [activeGroups]);
  const newHitsCount     = useMemo(() => activeGroups.reduce((s, g) => s + (g.newHitsSinceLastCheck || 0), 0), [activeGroups]);

  const latestDream = dreams[0] ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '28px', minWidth: 0 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        background:              'radial-gradient(ellipse 80% 60% at 0% 50%, rgba(160,80,255,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(255,107,74,0.14) 0%, transparent 55%), rgba(255,255,255,0.07)',
        border:                  '1px solid rgba(255,255,255,0.14)',
        borderRadius:            '28px',
        padding:                 'clamp(24px, 4vw, 40px)',
        backdropFilter:          'blur(24px)',
        WebkitBackdropFilter:    'blur(24px)',
        boxShadow:               '0 24px 64px rgba(0,0,0,0.30)',
        overflow:      'hidden',
        position:      'relative',
      }}>
        {/* Peach watermark */}
        <div aria-hidden="true" style={{
          position: 'absolute', right: '-20px', top: '-50px',
          fontSize: '160px', opacity: 0.04, lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
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
                {windowsTotal > 0 ? windowsTotal : watchItems} watch item{(windowsTotal > 0 ? windowsTotal : watchItems) !== 1 ? 's' : ''} · {activeGroups.length} dream group{activeGroups.length !== 1 ? 's' : ''} active
              </span>
              <span style={pill('plum')}>Duplicate protected</span>
            </div>

            {/* Heading — system-ui bold, no antique font */}
            <h1 style={{
              fontSize:      'clamp(2.8rem, 5.5vw, 5.2rem)',
              lineHeight:    0.88,
              letterSpacing: '-0.05em',
              fontWeight:    900,
              fontStyle:     'normal',
              color:         T.ink,
              margin:        '0 0 16px',
              fontFamily:    'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}>
              Ledger Dashboard
            </h1>

            <p style={{ color: T.taupe, fontSize: '15px', lineHeight: 1.6, margin: '0 0 24px', maxWidth: '48ch', fontWeight: 450 }}>
              Active dream windows, verified hits, and engine-backed intelligence —
              all in one place. Your dream data works even while you sleep.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreams/new" style={{
                display:        'inline-flex', alignItems: 'center', gap: '8px',
                minHeight:      '46px', padding: '12px 26px', borderRadius: '14px',
                background:     T.peach,
                color:          'white', fontWeight: 800, fontSize: '15px',
                textDecoration: 'none',
                boxShadow:      `0 6px 20px rgba(232,87,46,0.35)`,
                letterSpacing:  '-0.01em',
                fontFamily:     'system-ui, -apple-system, "Segoe UI", sans-serif',
              }}>
                <PenLine size={16} /> Write a Dream
              </Link>
              <Link href="/daily-ops" style={{
                display:        'inline-flex', alignItems: 'center',
                minHeight:      '46px', padding: '12px 22px', borderRadius: '14px',
                background:     T.white,
                border:         `1.5px solid ${T.line}`,
                color:          T.plum, fontWeight: 700, fontSize: '14px',
                textDecoration: 'none',
                fontFamily:     'system-ui, -apple-system, "Segoe UI", sans-serif',
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
            background:              'rgba(255,255,255,0.10)',
            border:                  '1px solid rgba(255,255,255,0.16)',
            borderRadius:            '22px',
            padding:                 '22px 24px',
            backdropFilter:          'blur(16px)',
            WebkitBackdropFilter:    'blur(16px)',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: T.muted, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              System Status
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {([
                ['Active Dreams',  dreams.length,      T.plum  ],
                ['Active Dream Groups', activeGroups.length,  T.peach ],
                ['Watch Items', windowsTotal > 0 ? windowsTotal : watchItems, T.green ],
                ['Memory Rows',    memory.length,      T.gold  ],
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
                marginTop: '14px', padding: '11px 14px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', fontSize: '12px',
              }}>
                <span style={{ color: T.muted, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', fontFamily: 'system-ui, sans-serif' }}>Latest Dream</span>
                <div style={{ color: T.ink, fontWeight: 700, marginTop: '4px', fontSize: '13px', fontFamily: 'system-ui, sans-serif' }}>
                  {latestDream.dreamerName || 'Dream Entry'} · {latestDream.dreamDate}
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

      {/* ── Operational KPIs ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        {([
          ['Active Dreams',   dreams.length,      T.plum  ],
          ['Active Dream Groups',  activeGroups.length,  T.peach ],
          ['Watch Items', windowsTotal > 0 ? windowsTotal : watchItems, T.green ],
          ['Cash 3 Numbers',  cash3Count,         T.gold  ],
          ['Cash 4 Numbers',  cash4Count,         '#50b8ff' ],
          ['New Hits',        newHitsCount,       T.green ],
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
                    <strong style={{ fontSize: '13px', color: T.plum, letterSpacing: '-0.01em', fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 700 }}>{label}</strong>
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
                  <strong style={{ fontSize: '13px', color: T.ink, fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 700, letterSpacing: '-0.01em' }}>{label}</strong>
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
                        background: i === 0 ? 'rgba(242,138,106,0.08)' : 'rgba(255,255,255,0.05)',
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
                        background: i === 0 ? 'rgba(61,122,82,0.06)' : 'rgba(255,255,255,0.05)',
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

          {/* ── Active Windows Summary + Cleanup Alerts ───────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
            <section style={card}>
              <div style={sectionHead}><CalendarRange size={18} />Active Windows</div>
              {activeGroups.length === 0
                ? <p style={{ color: T.muted, margin: 0, fontStyle: 'italic', fontSize: '14px' }}>No active dream windows right now.</p>
                : <div style={{ display: 'grid', gap: '8px' }}>
                    {activeGroups.slice(0, 5).map((g: any) => (
                      <div key={g.dreamEntryId || g.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px', borderRadius: '13px',
                        background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.line}`,
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: T.ink }}>{g.dreamerName || 'Dream'}</span>
                          <div style={{ fontSize: '11px', color: T.muted, marginTop: '2px' }}>{g.activeStart} → {g.activeEnd}</div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '11px', color: T.muted }}>
                          <div>C3: {(g.cash3Numbers ?? []).length} · C4: {(g.cash4Numbers ?? []).length}</div>
                          {(g.newHitsSinceLastCheck > 0) && (
                            <span style={{ color: T.gold, fontWeight: 700 }}>{g.newHitsSinceLastCheck} new hit{g.newHitsSinceLastCheck !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    <Link href="/windows" style={{ color: T.plum, fontSize: '13px', marginTop: '6px', display: 'inline-block', textDecoration: 'none', fontWeight: 600 }}>
                      All Active Windows →
                    </Link>
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
                        background: 'rgba(255,85,85,0.08)', border: '1px solid rgba(255,85,85,0.18)',
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
