'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildGroupedWindows, buildFellIndex, buildDreamerStream,
  buildTermConvergence, buildNumberConvergence, buildBoxedSignals,
  buildFellProof, buildStateFocus, buildFocusRecs, buildScopeStats,
  type FocusTier,
} from '@/lib/intelligence/universalScope';

// ─── Visual helpers ───────────────────────────────────────────────────────────

function NumberChip({ n, game }: { n: string; game: string }) {
  const isC4 = game === 'cash4';
  return (
    <span style={{
      fontFamily: 'monospace', fontWeight: 700, fontSize: '13px',
      background:   isC4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
      border:       `1px solid ${isC4 ? 'rgba(160,144,255,0.32)' : 'rgba(255,107,74,0.32)'}`,
      color:        isC4 ? '#a090ff' : '#ff8a6a',
      borderRadius: '7px', padding: '3px 8px', letterSpacing: '0.05em',
    }}>{n}</span>
  );
}

function StateChip({ state }: { state: string }) {
  return (
    <span style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: 800, background: 'rgba(96,224,154,0.12)', border: '1px solid rgba(96,224,154,0.26)', color: '#60e09a', fontFamily: 'system-ui,sans-serif' }}>{state}</span>
  );
}

function Badge({ label }: { label: string }) {
  const colors: Record<string, [string, string, string]> = {
    'Multi-Term':     ['rgba(255,204,80,0.14)',  'rgba(255,204,80,0.30)',  '#ffcc50'],
    'Multi-Dreamer':  ['rgba(160,144,255,0.14)', 'rgba(160,144,255,0.28)', '#a090ff'],
    'Fell Before':    ['rgba(96,224,154,0.14)',  'rgba(96,224,154,0.28)',  '#60e09a'],
    'Pinned':         ['rgba(255,107,74,0.14)',  'rgba(255,107,74,0.30)',  '#ff8a6a'],
    'Suggested':      ['rgba(255,204,80,0.10)',  'rgba(255,204,80,0.24)',  '#ffcc50'],
    'Recent Hit':     ['rgba(96,224,154,0.10)',  'rgba(96,224,154,0.22)',  '#60e09a'],
    'Hot Boxed Family': ['rgba(255,107,74,0.12)','rgba(255,107,74,0.24)', '#ff8a6a'],
    'Multi-Window':   ['rgba(160,144,255,0.10)', 'rgba(160,144,255,0.22)', '#a090ff'],
    'Active Dream':   ['rgba(255,107,74,0.12)',  'rgba(255,107,74,0.24)',  '#ff8a6a'],
  };
  const [bg, border, color] = colors[label] ?? ['rgba(255,255,255,0.07)','rgba(255,255,255,0.14)','rgba(255,255,255,0.60)'];
  return (
    <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: bg, border: `1px solid ${border}`, color, fontFamily: 'system-ui,sans-serif', letterSpacing: '0.04em' }}>{label}</span>
  );
}

const TIER_COLORS: Record<FocusTier, [string, string]> = {
  'Strong Focus':         ['rgba(96,224,154,0.16)',  '#60e09a'],
  'Moderate Focus':       ['rgba(255,204,80,0.14)',  '#ffcc50'],
  'Watchlist':            ['rgba(160,144,255,0.12)', '#a090ff'],
  'Needs More Evidence':  ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.45)'],
};

function StatTile({ label, val, color }: { label: string; val: number | string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '14px 16px' }}>
      <strong style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.05em', display: 'block', lineHeight: 1, color, fontFamily: 'system-ui,sans-serif' }}>{val}</strong>
      <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>{label}</span>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'system-ui,sans-serif', color: '#ffffff' }}>{title}</h2>
      {sub && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)', marginTop: '3px' }}>{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50'                : '#ff9090';
  return (
    <div style={{ padding:'14px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      {isIndex && <strong>⚠ Firestore index required</strong>}
      {isQuota && <strong>⚠ Firebase quota exhausted</strong>}
      {!isIndex && !isQuota && <strong>⚠ Could not load data</strong>}
      <br />
      {isIndex && 'Create the suggested Firebase index, wait until active, then refresh. '}
      {isQuota && 'Read quota is temporarily exhausted. Try again after reset or reduce testing. '}
      {!isIndex && !isQuota && msg}
      {(isIndex || isQuota) && (
        <span>
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{ marginLeft:'8px', fontSize:'11px', opacity:0.7, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
            {open ? 'hide details' : 'details'}
          </button>
          {open && <div style={{ marginTop:'6px', fontSize:'11px', opacity:0.75, wordBreak:'break-all', fontFamily:'monospace' }}>{msg}</div>}
        </span>
      )}
    </div>
  );
}

export default function UniversalScopePage() {
  const { user, loading: authLoading } = useAuth();

  const [dreamers,  setDreamers]  = useState<any[]>([]);
  const [windows,   setWindows]   = useState<any[]>([]);
  const [memory,    setMemory]    = useState<any[]>([]);
  const [hits,      setHits]      = useState<any[]>([]);
  const [pinned,    setPinned]    = useState<any[]>([]);
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [quotaError,  setQuotaError]  = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [communityMode, setCommunityMode] = useState(false);

  // ── Load — quota-safe, same limits as previous pass ──────────────────────────
  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      setLoading(true); setError(''); setQuotaError(false);
      try {
        const uid   = encodeURIComponent(user.uid);
        const hLim  = expanded ? '&limit=100' : '&limit=30';
        const fbLim = expanded ? '&limit=200' : '&limit=100';

        const [dr, wr, mr, hr, pr, prof] = await Promise.all([
          fetch(`/api/dreamers?ownerUid=${uid}`),
          fetch(`/api/dreams/windows?ownerUid=${uid}&limit=50`),
          fetch(`/api/fell-before?ownerUid=${uid}${fbLim}`),
          fetch(`/api/dreams/hits?ownerUid=${uid}${hLim}`),
          fetch(`/api/pinned-plays?ownerUid=${uid}`),
          fetch(`/api/owner-profile?ownerUid=${uid}`),
        ]);
        const [dd, wd, md, hd, pd, profileData] = await Promise.all([
          dr.json(), wr.json(), mr.json(), hr.json(), pr.json(), prof.json(),
        ]);

        if (dd.ok) setDreamers(dd.dreamers ?? []);
        if (wd.ok) setWindows(wd.windows   ?? []);
        if (md.ok) setMemory(md.rows        ?? []);
        if (hd.ok) setHits(hd.hits          ?? []);
        if (pd.ok) setPinned(pd.plays        ?? []);
        if (profileData.ok && profileData.profile?.displayName)
          setOwnerDisplayName(profileData.profile.displayName);

        const anyQuota = [dd, wd, md, hd, pd].some((d: any) => d.quota);
        if (anyQuota) setQuotaError(true);
      } catch (err) {
        console.error(err);
        setError('Could not load Universal Scope data.');
      } finally { setLoading(false); }
    }
    if (!authLoading) void load();
  }, [user, authLoading, expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Intelligence computation — all client-side on capped data ────────────────
  const today = new Date().toISOString().slice(0, 10);

  const grouped      = useMemo(() => buildGroupedWindows(windows, today),                              [windows, today]);
  const fellIdx      = useMemo(() => buildFellIndex(memory),                                           [memory]);
  const dreamerStream= useMemo(() => buildDreamerStream(grouped, ownerDisplayName),                   [grouped, ownerDisplayName]);
  const termSignals  = useMemo(() => buildTermConvergence(grouped, fellIdx),                           [grouped, fellIdx]);
  const numSignals   = useMemo(() => buildNumberConvergence(grouped, fellIdx, pinned),                 [grouped, fellIdx, pinned]);
  const boxedSignals = useMemo(() => buildBoxedSignals(grouped, fellIdx),                              [grouped, fellIdx]);
  const fellProof    = useMemo(() => buildFellProof(grouped, fellIdx),                                 [grouped, fellIdx]);
  const stateFocus   = useMemo(() => buildStateFocus(grouped, fellIdx),                                [grouped, fellIdx]);
  const focusRecs    = useMemo(() => buildFocusRecs(numSignals, boxedSignals, fellProof, hits),        [numSignals, boxedSignals, fellProof, hits]);
  const stats        = useMemo(() => buildScopeStats(grouped, dreamers, termSignals, numSignals, boxedSignals, stateFocus, pinned, hits), [grouped, dreamers, termSignals, numSignals, boxedSignals, stateFocus, pinned, hits]);

  // Community mode: map dreamer names to Dreamer A, B, C…
  const communityMap = useMemo(() => {
    const labels = ['A','B','C','D','E','F','G','H'];
    const ids = [...new Set(grouped.map(g => g.dreamerId))];
    return new Map(ids.map((id, i) => [id, `Dreamer ${labels[i] ?? (i + 1).toString()}`]));
  }, [grouped]);

  function dreamerLabel(id: string, name: string): string {
    if (communityMode) return communityMap.get(id) ?? 'Dreamer ?';
    return id === 'owner-self' ? (ownerDisplayName || 'Owner / Self') : (name || id);
  }

  const hasData = grouped.length > 0 || memory.length > 0 || hits.length > 0 || pinned.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* ── 1. Header ── */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 900, letterSpacing: '-0.04em', fontFamily: 'system-ui,sans-serif', color: '#ffffff' }}>
              Universal Scope
            </h1>
            <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: '14px', lineHeight: 1.65, maxWidth: '600px' }}>
              Collective dream intelligence across active windows, converging symbols, proven falls, and state-supported plays.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
              <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(96,224,154,0.10)', border: '1px solid rgba(96,224,154,0.24)', color: '#60e09a', fontFamily: 'system-ui,sans-serif' }}>
                ✓ Quota-safe mode
              </span>
              <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.50)', fontFamily: 'system-ui,sans-serif' }}>
                Capped reads
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button type="button" className="btn-secondary" onClick={() => setCommunityMode(v => !v)} style={{ fontSize: '12px' }}>
              {communityMode ? '👥 Community Mode' : '👤 Full Names'}
            </button>
            <Link href="/hot-numbers"  className="btn-secondary" style={{ fontSize: '12px' }}>Hot Families</Link>
            <Link href="/playlists"    className="btn-secondary" style={{ fontSize: '12px' }}>State Playlists</Link>
            <Link href="/fell-before"  className="btn-secondary" style={{ fontSize: '12px' }}>Fell Before</Link>
          </div>
        </div>
      </section>

      {/* Quota / error banners */}
      {quotaError && (
        <div style={{ padding: '12px 16px', borderRadius: '14px', border: '1px solid rgba(255,204,80,0.28)', background: 'rgba(255,204,80,0.08)', color: '#ffcc50', fontSize: '13px' }}>
          ⚠ <strong>Firebase quota limit reached.</strong> Some signals may be incomplete. Wait and refresh, or use the "Load expanded" button below.
        </div>
      )}
      {error && !quotaError && (
        <div style={{ padding: '12px 16px', borderRadius: '14px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090', fontSize: '13px' }}>{error}</div>
      )}

      {loading && <section className="journal-card"><p style={{ margin: 0, color: 'rgba(255,255,255,0.55)' }}>Loading Universal Scope…</p></section>}

      {/* ── 2. Mission Control Summary ── */}
      {!loading && (
        <section style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <StatTile label="Active Dreamers"   val={stats.activeDreamers}       color="#ff8a6a" />
          <StatTile label="Active Windows"    val={stats.activeWindows}        color="#a090ff" />
          <StatTile label="Watch Items"       val={stats.watchItems}           color="#60e09a" />
          <StatTile label="Repeated Terms"    val={stats.repeatedTerms}        color="#ffcc50" />
          <StatTile label="Repeated Numbers"  val={stats.repeatedNumbers}      color="#ff8a6a" />
          <StatTile label="Hot Families"      val={stats.hotBoxedFamilies}     color="#a090ff" />
          <StatTile label="State Plays"       val={stats.stateSupportedPlays}  color="#60e09a" />
          <StatTile label="Pinned / Suggest." val={stats.suggestedPinnedPlays} color="#ffcc50" />
          <StatTile label="Recent Hits"       val={stats.recentHits}           color="#ff8a6a" />
        </section>
      )}

      {/* Expand / load more */}
      {!loading && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" style={{ fontSize: '12px' }}
            onClick={() => setExpanded(v => !v)}>
            {expanded ? '↩ Show summary limits' : '↓ Load expanded intelligence'}
          </button>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.32)' }}>
            {expanded ? 'Showing expanded data' : 'Default: capped reads to protect Firebase quota'}
          </span>
        </div>
      )}

      {/* ── System warnings ── */}
      {!loading && !hasData && (
        <section className="journal-card">
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
            No active signals yet. Write a dream, run a refresh, and return here to see the collective intelligence layer.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
            <Link href="/dreams/new"   className="btn-primary"   style={{ fontSize: '13px' }}>Write a Dream</Link>
            <Link href="/dreamers"     className="btn-secondary" style={{ fontSize: '13px' }}>Manage Dreamers</Link>
          </div>
        </section>
      )}

      {!loading && hasData && (<>

        {/* ── 3. Active Dreamer Stream ── */}
        {dreamerStream.length > 0 && (
          <section className="journal-card">
            <SectionHead title="Active Dreamer Stream" sub="Who has dreams active right now" />
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {dreamerStream.map(g => (
                <div key={g.dreamEntryId} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', fontFamily: 'system-ui,sans-serif' }}>
                      {dreamerLabel(g.dreamerId, g.dreamerName)}
                    </strong>
                    {g.newHits > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', background: 'rgba(255,204,80,0.14)', border: '1px solid rgba(255,204,80,0.28)', color: '#ffcc50' }}>
                        {g.newHits} new hit{g.newHits !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginBottom: '8px', fontFamily: 'monospace' }}>
                    {g.activeStart} → {g.activeEnd}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {g.cash3.slice(0, 6).map(n => <NumberChip key={n} n={n} game="cash3" />)}
                    {g.cash4.slice(0, 4).map(n => <NumberChip key={n} n={n} game="cash4" />)}
                  </div>
                  {Object.keys(g.termMap).length > 0 && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>
                      Terms: {Object.keys(g.termMap).slice(0, 5).join(', ')}{Object.keys(g.termMap).length > 5 ? ` +${Object.keys(g.termMap).length - 5}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Cross-Dreamer Term Convergence ── */}
        {termSignals.filter(t => t.dreamerIds.length > 1 || t.windowCount > 1).length > 0 && (
          <section className="journal-card">
            <SectionHead title="Term Convergence" sub="Symbols appearing across multiple dreamers or windows" />
            <div style={{ display: 'grid', gap: '8px' }}>
              {termSignals.filter(t => t.dreamerIds.length > 1 || t.windowCount > 1).slice(0, 12).map(sig => (
                <div key={sig.term} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '14px', padding: '12px 14px', display: 'grid', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <strong style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '-0.02em', fontFamily: 'system-ui,sans-serif', color: '#ffffff' }}>{sig.term}</strong>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {sig.dreamerIds.length > 1 && <Badge label="Multi-Dreamer" />}
                      {sig.hasFellBefore       && <Badge label="Fell Before"   />}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {sig.numbers.slice(0, 8).map(({ num, gt }) => <NumberChip key={`${num}-${gt}`} n={num} game={gt} />)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>
                    {sig.dreamerIds.map(id => dreamerLabel(id, sig.dreamerNames[sig.dreamerIds.indexOf(id)] ?? '')).join(' · ')}
                    {sig.hasFellBefore && sig.fellStates.length > 0 && (
                      <span style={{ marginLeft: '8px' }}>
                        {sig.fellStates.slice(0, 5).map(s => <StateChip key={s} state={s} />)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 5. Exact Number Convergence ── */}
        {numSignals.filter(n => n.terms.length > 1 || n.dreamerIds.length > 1 || n.hasFellBefore).length > 0 && (
          <section className="journal-card">
            <SectionHead title="Number Convergence" sub="Exact numbers appearing across multiple terms, dreamers, or with fell-before proof" />
            <div style={{ display: 'grid', gap: '8px' }}>
              {numSignals.filter(n => n.terms.length > 1 || n.dreamerIds.length > 1 || n.hasFellBefore).slice(0, 12).map(sig => (
                <div key={`${sig.number}-${sig.gameType}`} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${sig.isPinned ? 'rgba(255,107,74,0.28)' : 'rgba(255,255,255,0.09)'}`, borderRadius: '14px', padding: '12px 14px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <NumberChip n={sig.number} game={sig.gameType} />
                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {sig.terms.length > 1  && <Badge label="Multi-Term"     />}
                      {sig.dreamerIds.length > 1 && <Badge label="Multi-Dreamer" />}
                      {sig.hasFellBefore     && <Badge label="Fell Before"   />}
                      {sig.isPinned          && <Badge label="Pinned"         />}
                      {sig.isSuggested && !sig.isPinned && <Badge label="Suggested" />}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
                      Terms: <strong style={{ color: '#fff' }}>{sig.terms.slice(0, 4).join(', ')}</strong>
                      {sig.terms.length > 4 && ` +${sig.terms.length - 4}`}
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {sig.dreamerIds.map((id, i) => (
                        <span key={id} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px', background: 'rgba(160,144,255,0.10)', border: '1px solid rgba(160,144,255,0.20)', color: '#a090ff' }}>
                          {dreamerLabel(id, sig.dreamerNames[i] ?? '')}
                        </span>
                      ))}
                      {sig.hasFellBefore && sig.fellStates.slice(0, 5).map(s => <StateChip key={s} state={s} />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 6. Boxed Family Convergence ── */}
        {boxedSignals.filter(b => b.terms.length > 1 || b.hasFellBefore).length > 0 && (
          <section className="journal-card">
            <SectionHead title="Boxed Family Convergence" sub="Digit-family convergence across active terms and dreamers" />
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {boxedSignals.filter(b => b.terms.length > 1 || b.hasFellBefore).slice(0, 8).map(sig => (
                <div key={`${sig.boxedKey}-${sig.gameType}`} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '13px 15px', display: 'grid', gap: '7px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.3rem', color: sig.gameType === 'cash3' ? '#ff8a6a' : '#a090ff', letterSpacing: '0.08em' }}>{sig.boxedKey}</span>
                    <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: sig.gameType === 'cash3' ? 'rgba(255,107,74,0.14)' : 'rgba(160,144,255,0.14)', color: sig.gameType === 'cash3' ? '#ff8a6a' : '#a090ff', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'system-ui,sans-serif' }}>{sig.gameType}</span>
                    {sig.terms.length > 1  && <Badge label="Multi-Term"   />}
                    {sig.hasFellBefore     && <Badge label="Fell Before"  />}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {sig.numbers.map(n => <NumberChip key={n} n={n} game={sig.gameType} />)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>
                    {sig.terms.slice(0, 4).join(', ')}
                    {sig.hasFellBefore && sig.fellStates.length > 0 && (
                      <span style={{ marginLeft: '6px' }}>
                        {sig.fellStates.slice(0, 4).map(s => <StateChip key={s} state={s} />)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 7. Fell-Before Proof Layer ── */}
        {fellProof.length > 0 && (
          <section className="journal-card">
            <SectionHead title="As They Fell Before — Proof Layer" sub="Active term-number pairs with confirmed state evidence" />
            <div style={{ display: 'grid', gap: '7px' }}>
              {fellProof.slice(0, 14).map(row => (
                <div key={`${row.term}-${row.number}-${row.gameType}`} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '9px 12px', borderRadius: '12px', background: 'rgba(96,224,154,0.06)', border: '1px solid rgba(96,224,154,0.14)' }}>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: '#ffffff', fontFamily: 'system-ui,sans-serif', minWidth: '60px' }}>{row.term}</span>
                  <NumberChip n={row.number} game={row.gameType} />
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {row.states.map(s => <StateChip key={s} state={s} />)}
                  </div>
                  <span style={{ fontSize: '11px', color: '#60e09a', marginLeft: 'auto' }}>
                    {row.hitCount} hit{row.hitCount !== 1 ? 's' : ''}
                    {row.lastHitDate && ` · ${row.lastHitDate}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 8. State Focus Board ── */}
        {stateFocus.length > 0 && (
          <section className="journal-card">
            <SectionHead title="State Focus Board" sub="Top states with active evidence" />
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {stateFocus.slice(0, 8).map(entry => (
                <div key={entry.state} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '13px 15px' }}>
                  <div style={{ fontWeight: 900, fontSize: '1rem', color: '#a090ff', fontFamily: 'system-ui,sans-serif', marginBottom: '9px' }}>{entry.state}</div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {entry.plays.slice(0, 4).map(play => (
                      <div key={`${play.number}-${play.gameType}`} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <NumberChip n={play.number} game={play.gameType} />
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.50)' }}>
                          {play.terms.slice(0, 2).join(', ')}
                          {play.hitCount > 0 && <span style={{ color: '#60e09a' }}> · {play.hitCount}×</span>}
                        </span>
                      </div>
                    ))}
                    {entry.plays.length > 4 && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>+{entry.plays.length - 4} more</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 9. Pinned / Suggested Watchlist ── */}
        {pinned.filter(p => p.status === 'suggested' || p.status === 'pinned').length > 0 && (
          <section className="journal-card">
            <SectionHead title="Pinned & Suggested Watchlist" sub="What the system has already promoted" />
            <div style={{ display: 'grid', gap: '7px' }}>
              {pinned.filter(p => p.status === 'suggested' || p.status === 'pinned').slice(0, 10).map((play: any) => {
                const num    = String(play.number   || '');
                const terms  = [...new Set([play.sourceTerm, ...(play.sourceTerms ?? [])].filter(Boolean))];
                const isPinned = play.status === 'pinned';
                return (
                  <div key={play.id || num} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '9px 12px', borderRadius: '12px', background: isPinned ? 'rgba(255,107,74,0.07)' : 'rgba(255,204,80,0.06)', border: `1px solid ${isPinned ? 'rgba(255,107,74,0.22)' : 'rgba(255,204,80,0.18)'}` }}>
                    {num && <NumberChip n={num} game={play.gameType ?? 'cash3'} />}
                    <Badge label={isPinned ? 'Pinned' : 'Suggested'} />
                    {terms.length > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>{terms.slice(0, 3).join(', ')}</span>}
                    {play.state && <StateChip state={play.state} />}
                    {play.reason && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)', flex: 1 }}>{play.reason}</span>}
                  </div>
                );
              })}
              <Link href="/pinned-plays" style={{ color: '#a090ff', fontSize: '12px', textDecoration: 'none', fontWeight: 600, marginTop: '4px' }}>
                View all Pinned Plays →
              </Link>
            </div>
          </section>
        )}

        {/* ── 10. Today's Focus Recommendations ── */}
        {focusRecs.length > 0 && (
          <section className="journal-card">
            <SectionHead title="Today's Focus Recommendations" sub="Ranked by convergence, evidence, and dreamer support. No guarantees — evidence-based focus only." />
            <div style={{ display: 'grid', gap: '10px' }}>
              {focusRecs.slice(0, 10).map((rec, i) => {
                const [tierBg, tierColor] = TIER_COLORS[rec.tier];
                return (
                  <div key={rec.id} style={{ background: tierBg, border: '1px solid rgba(255,255,255,0.10)', borderLeft: `4px solid ${tierColor}`, borderRadius: '16px', padding: '14px 16px', display: 'grid', gap: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'system-ui,sans-serif', fontWeight: 900, fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>#{i + 1}</span>
                        <NumberChip n={rec.number} game={rec.gameType} />
                        <span style={{ padding: '4px 11px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: tierBg, border: `1px solid ${tierColor}40`, color: tierColor, fontFamily: 'system-ui,sans-serif' }}>
                          {rec.tier}
                        </span>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)', fontFamily: 'system-ui,sans-serif' }}>
                          Score: <strong style={{ color: 'rgba(255,255,255,0.70)' }}>{rec.score}</strong>
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {rec.evidenceBadges.map(b => <Badge key={b} label={b} />)}
                    </div>

                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, fontStyle: 'italic' }}>
                      {rec.reason}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {rec.dreamerNames.map((dn, di) => (
                        <span key={dn} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px', background: 'rgba(160,144,255,0.10)', border: '1px solid rgba(160,144,255,0.20)', color: '#a090ff' }}>
                          {dreamerLabel(grouped.find(g => (g.dreamerName === dn || g.dreamerName === rec.dreamerNames[di]))?.dreamerId ?? '', dn)}
                        </span>
                      ))}
                      {rec.states.slice(0, 5).map(s => <StateChip key={s} state={s} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── System Warnings / Gaps ── */}
        {(() => {
          const warnings: string[] = [];
          if (grouped.length === 0)     warnings.push('No active dream windows. Write a dream to generate signals.');
          if (termSignals.filter(t => t.dreamerIds.length > 1).length === 0 && grouped.length > 0)
            warnings.push('No cross-dreamer term convergence yet. Add more dreamers or dreams.');
          if (fellProof.length === 0 && grouped.length > 0)
            warnings.push('No fell-before proof for active terms yet. Run a refresh to find matches.');
          if (pinned.length === 0)       warnings.push('No pinned or suggested plays yet. Visit Hot Families or State Playlists to promote candidates.');
          warnings.push('Data is capped for quota safety. Click "Load expanded" above for more signals.');
          warnings.push('Older hits may lack dreamerName until a new refresh runs.');
          if (warnings.length === 0) return null;
          return (
            <section className="journal-card-flat" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', display: 'grid', gap: '5px' }}>
              <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.60)', marginBottom: '4px', fontFamily: 'system-ui,sans-serif' }}>System Notes</div>
              {warnings.map(w => <div key={w}>· {w}</div>)}
            </section>
          );
        })()}

      </>)}

      {/* Quick links */}
      <section style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {([
          ['/hot-numbers',    'Hot Families'],
          ['/playlists',      'State Playlists'],
          ['/pinned-plays',   'Pinned Plays'],
          ['/fell-before',    'As They Fell Before'],
          ['/dictionary',     'Universal Dictionary'],
          ['/intelligence',   'Intelligence Hub'],
          ['/forecast-board', 'Forecast Board'],
        ] as [string, string][]).map(([href, label]) => (
          <Link key={href} href={href} className="journal-card-flat"
            style={{ textDecoration: 'none', color: 'rgba(255,255,255,0.70)', fontSize: '12px', fontWeight: 600, display: 'block' }}>
            {label}
          </Link>
        ))}
      </section>

    </div>
  );
}
