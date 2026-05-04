'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildPowerRepeats, buildBoxedRepeats, buildStateHotspots,
  buildDayWindows, buildFellSummary, populateGroupEvents,
  type PowerRepeat, type BoxedRepeat, type StateHotspot, type FellSummary,
  type FellBeforeRow, type DedupedRow,
} from '@/lib/intelligence/fellBeforeAnalysis';
import { BookMarked } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type MappingRow = {
  id: string;
  termLabel?:          string;
  number?:             string;
  state?:              string;
  gameType?:           string;
  drawTime?:           string;
  drawDate?:           string;
  hitType?:            string;
  hitCount?:           number;
  straightCount?:      number;
  boxedCount?:         number;
  stateStrengthScore?: number;
  lastHitDate?:        string;
  dreamerId?:          string;
  dreamerName?:        string;
};

type DreamerOption = { id: string; displayName: string };

type StateRecord = {
  state: string; gameType: string; drawTime: string;
  hitCount: number; straightCount: number; boxedCount: number;
  stateStrengthScore: number; lastHitDate: string; latestHitType: string;
};
type NumberGroup = { number: string; gameType: string; states: StateRecord[]; totalHits: number };
type TermGroup   = { term: string; letter: string; numbers: NumberGroup[]; totalHits: number };

// ─── Dictionary builder — logic unchanged ─────────────────────────────────────

function normalizeTermLabel(term: string) {
  const c = term.trim();
  if (c === 'direct-cash3' || c === 'direct-cash4') return 'Unmapped Direct Numbers';
  return c;
}
function termLetter(term: string) {
  const ch = term.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
}
function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildDictionary(rows: MappingRow[]): TermGroup[] {
  const termMap = new Map<string, TermGroup>();

  for (const row of rows) {
    const rawTerm = String(row.termLabel ?? '').trim();
    if (!rawTerm) continue;
    const term    = normalizeTermLabel(rawTerm);
    const termKey = term.toLowerCase();

    if (!termMap.has(termKey)) {
      termMap.set(termKey, { term, letter: termLetter(term), numbers: [], totalHits: 0 });
    }
    const tg     = termMap.get(termKey)!;
    const numVal = String(row.number ?? '').trim();
    if (!numVal) continue;

    const rowGameType = String(row.gameType ?? 'unknown').trim() || 'unknown';
    const numKey      = numVal + '::' + rowGameType;
    let ng = tg.numbers.find(n => n.number + '::' + n.gameType === numKey);
    if (!ng) {
      ng = { number: numVal, gameType: rowGameType, states: [], totalHits: 0 };
      tg.numbers.push(ng);
    }

    const state    = String(row.state    ?? 'Unknown').trim() || 'Unknown';
    const gameType = rowGameType;
    const drawTime = String(row.drawTime ?? 'unknown').trim() || 'unknown';
    const srKey    = `${state}__${gameType}__${drawTime}`;
    let sr = ng.states.find(s => `${s.state}__${s.gameType}__${s.drawTime}` === srKey);

    const hitCount           = Number(row.hitCount ?? 1);
    const straightCount      = row.straightCount !== undefined ? Number(row.straightCount) : row.hitType === 'straight' ? hitCount : 0;
    const boxedCount         = row.boxedCount     !== undefined ? Number(row.boxedCount)   : row.hitType === 'boxed'    ? hitCount : 0;
    const stateStrengthScore = row.stateStrengthScore !== undefined
      ? Number(row.stateStrengthScore) : straightCount * 3 + boxedCount;
    const lastHitDate        = String(row.lastHitDate ?? row.drawDate ?? '').trim();
    const latestHitType      = straightCount > 0 && boxedCount > 0 ? 'mixed'
      : straightCount > 0 ? 'straight' : 'boxed';

    if (!sr) {
      sr = { state, gameType, drawTime, hitCount, straightCount, boxedCount, stateStrengthScore, lastHitDate, latestHitType };
      ng.states.push(sr);
    } else {
      sr.hitCount          += hitCount;
      sr.straightCount     += straightCount;
      sr.boxedCount        += boxedCount;
      sr.stateStrengthScore += stateStrengthScore;
      if (lastHitDate > sr.lastHitDate) sr.lastHitDate = lastHitDate;
      sr.latestHitType = sr.straightCount > 0 && sr.boxedCount > 0 ? 'mixed'
        : sr.straightCount > 0 ? 'straight' : 'boxed';
    }
    tg.totalHits += hitCount;
  }

  const groups = Array.from(termMap.values());
  for (const tg of groups) {
    for (const ng of tg.numbers) {
      ng.states.sort((a, b) => b.stateStrengthScore - a.stateStrengthScore || b.hitCount - a.hitCount);
      ng.totalHits = ng.states.reduce((s, r) => s + r.hitCount, 0);
    }
    tg.numbers.sort((a, b) => b.totalHits - a.totalHits);
  }
  return groups.sort((a, b) => a.term.localeCompare(b.term));
}

// ─── Visual helpers ───────────────────────────────────────────────────────────

const HIT_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  straight: { bg: 'rgba(96,224,154,0.14)',  border: 'rgba(96,224,154,0.32)',  text: '#60e09a' },
  boxed:    { bg: 'rgba(255,204,80,0.14)',   border: 'rgba(255,204,80,0.32)',  text: '#ffcc50' },
  mixed:    { bg: 'rgba(160,144,255,0.14)',  border: 'rgba(160,144,255,0.32)', text: '#a090ff' },
};

function HitTypeBadge({ type }: { type: string }) {
  const c = HIT_TYPE_COLORS[type] ?? HIT_TYPE_COLORS.boxed;
  return (
    <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {type}
    </span>
  );
}

function StateChip({ state, hitCount, hitType }: { state: string; hitCount: number; hitType: string }) {
  const c = HIT_TYPE_COLORS[hitType] ?? HIT_TYPE_COLORS.boxed;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', padding: '6px 10px', borderRadius: '10px', background: c.bg, border: `1px solid ${c.border}`, minWidth: '46px' }}>
      <span style={{ fontWeight: 900, fontSize: '12px', color: c.text, fontFamily: 'system-ui,sans-serif', letterSpacing: '0.02em' }}>{state}</span>
      <span style={{ fontSize: '9px', color: c.text, opacity: 0.75, fontWeight: 700, letterSpacing: '0.06em' }}>{hitCount}×</span>
    </div>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function FellBeforeInner() {
  const { user }       = useAuth();
  const searchParams   = useSearchParams();

  const [rows,      setRows]      = useState<MappingRow[]>([]);
  const [lookupMode, setLookupMode] = useState('');
  const [filtersApplied, setFiltersApplied] = useState<string[]>([]);
  const [totalSampled, setTotalSampled] = useState<number | null>(null);
  const [dreamers,  setDreamers]  = useState<DreamerOption[]>([]);
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [dreamerId, setDreamerId] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Filters
  const [searchTerm,   setSearchTerm]   = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [stateFilter,  setStateFilter]  = useState('');
  const [gameFilter,   setGameFilter]   = useState<'all'|'cash3'|'cash4'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all'|'backtest-replay'|'live-dream-refresh'|'unknown'>('all');

  // Drilldown: fetch individual events when user expands a group
  const [eventsLoaded,   setEventsLoaded]   = useState(false);
  const [eventsLoading,  setEventsLoading]  = useState(false);
  const [eventsError,    setEventsError]    = useState('');
  const [allEvents,      setAllEvents]      = useState<FellBeforeRow[]>([]);
  // Which repeat/boxed/state cards are expanded
  const [expandedRepeat, setExpandedRepeat] = useState<Set<string>>(new Set());

  useEffect(() => {
    const qd = searchParams.get('dreamerId') ?? '';
    setDreamerId(qd);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch(`/api/dreamers?ownerUid=${encodeURIComponent(user.uid)}`).then(r => r.json()),
      fetch(`/api/owner-profile?ownerUid=${encodeURIComponent(user.uid)}`).then(r => r.json()),
    ]).then(([dreamerData, profileData]) => {
      if (dreamerData.ok) setDreamers(dreamerData.dreamers ?? []);
      if (profileData.ok && profileData.profile?.displayName) {
        setOwnerDisplayName(profileData.profile.displayName);
      }
    }).catch(err => console.error('dreamers/profile load:', err));
  }, [user]);

  // loadRows is called whenever any server-side filter changes.
  // It passes all active filters to the API so results come from a full
  // 500-row sample with server-side filtering — not a capped 250-row client filter.
  async function loadRows(overrides?: {
    did?: string; term?: string; num?: string;
    state?: string; game?: string; source?: string;
  }) {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const activeDid    = overrides?.did    !== undefined ? overrides.did    : dreamerId;
      const activeTerm   = overrides?.term   !== undefined ? overrides.term   : searchTerm;
      const activeNum    = overrides?.num    !== undefined ? overrides.num    : searchNumber;
      const activeState  = overrides?.state  !== undefined ? overrides.state  : stateFilter;
      const activeGame   = overrides?.game   !== undefined ? overrides.game   : gameFilter;
      const activeSource = overrides?.source !== undefined ? overrides.source : sourceFilter;

      const qs = new URLSearchParams({ ownerUid: user.uid });
      if (activeDid && activeDid !== 'all')   qs.set('dreamerId', activeDid);
      if (activeTerm.trim())                  qs.set('term',      activeTerm.trim());
      if (activeNum.trim())                   qs.set('number',    activeNum.trim());
      if (activeState)                        qs.set('state',     activeState);
      if (activeGame && activeGame !== 'all') qs.set('gameType',  activeGame);
      if (activeSource && activeSource !== 'all') qs.set('source', activeSource);
      // Auto-bump limit when any filter is active so server can search full dataset
      const hasFilter = !!(activeTerm.trim() || activeNum.trim() || activeSource !== 'all');
      qs.set('limit', hasFilter ? '500' : '250');

      const res  = await fetch(`/api/fell-before?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to load term memory.'); return; }
      setRows(Array.isArray(data.rows) ? (data.rows as MappingRow[]) : []);
      setLookupMode(data.lookupMode ?? '');
      setFiltersApplied(data.filtersApplied ?? []);
      setTotalSampled(data.totalSampled ?? null);
    } catch (err) {
      console.error(err);
      setError('Could not load As They Fell Before dictionary.');
    } finally { setLoading(false); }
  }

  // Reload when dreamer changes
  useEffect(() => { void loadRows(); }, [user, dreamerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load event-level drilldown data for current search term
  async function loadEvents(term: string) {
    if (!user || !term.trim() || eventsLoaded) return;
    setEventsLoading(true); setEventsError('');
    try {
      const uid = encodeURIComponent(user.uid);
      const res  = await fetch(`/api/fell-before/events?ownerUid=${uid}&term=${encodeURIComponent(term.trim())}&limit=500`);
      const data = await res.json();
      if (!data.ok) { setEventsError(data.error ?? 'Could not load events.'); return; }
      setAllEvents(data.rows ?? []);
      setEventsLoaded(true);
    } catch (e) { setEventsError(String(e)); }
    finally { setEventsLoading(false); }
  }

  function toggleExpandedRepeat(key: string) {
    setExpandedRepeat(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  } // eslint-disable-line react-hooks/exhaustive-deps

  function handleDreamerChange(did: string) { setDreamerId(did); }

  const dictionary = useMemo(() => buildDictionary(rows), [rows]);

  // Collect all states for filter dropdown
  const allStates = useMemo(() => {
    const s = new Set<string>();
    for (const tg of dictionary) for (const ng of tg.numbers) for (const sr of ng.states) s.add(sr.state);
    return Array.from(s).sort();
  }, [dictionary]);

  // Server handles term/number/state/gameType/source filtering.
  // The dictionary useMemo just groups returned rows — no client-side filter needed.
  const filtered = dictionary;

  // ── Pattern analysis (only when rows are loaded) ──────────────────────────
  const powerRepeats: PowerRepeat[] = useMemo(() =>
    rows.length > 0 ? buildPowerRepeats(rows, []) : [], [rows]);
  const boxedRepeats: BoxedRepeat[] = useMemo(() =>
    rows.length > 0 ? buildBoxedRepeats(rows, []) : [], [rows]);
  const stateHotspots: StateHotspot[] = useMemo(() =>
    rows.length > 0 ? buildStateHotspots(rows, []) : [], [rows]);
  const dayWindows = useMemo(() =>
    rows.length > 0 ? buildDayWindows(rows) : [], [rows]);
  const fellSummary: FellSummary = useMemo(() =>
    buildFellSummary(rows, powerRepeats, [], { lookupMode, filtersApplied }),
    [rows, powerRepeats, lookupMode, filtersApplied]);

  // Populated groups — events[] filled in after on-demand fetch
  const populated = useMemo(() =>
    eventsLoaded && allEvents.length > 0
      ? populateGroupEvents(allEvents, powerRepeats, boxedRepeats, stateHotspots)
      : { powerRepeats, boxedRepeats, stateHotspots },
    [eventsLoaded, allEvents, powerRepeats, boxedRepeats, stateHotspots]
  );


  const letters = useMemo(() => Array.from(new Set(filtered.map(g => g.letter))).sort(), [filtered]);

  const scopeLabel = dreamerId === '' ? 'All Dreamers'
    : dreamerId === 'owner-self' ? (ownerDisplayName || 'Owner / Self')
    : dreamers.find(d => d.id === dreamerId)?.displayName ?? dreamerId;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div className="page-header">
            <h1>As They Fell Before</h1>
            <p>
              Confirmed hit memory — grouped by term, then by number, then by state.
              {dreamerId
                ? <> Showing: <strong style={{ color: '#a090ff' }}>{scopeLabel}</strong></>
                : ' Showing all dreamers combined.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/hits"           className="btn-secondary">Hits Detector</Link>
            <Link href="/forecast-board" className="btn-secondary">Forecast Board</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {([
          ['Memory Rows',   rows.length,                        '#a090ff'],
          ['Terms',         dictionary.length,                  '#ff6b4a'],
          ['Showing',       filtered.length,                    '#60e09a'],
          ['States',        allStates.length,                   '#ffcc50'],
        ] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '18px', padding: '14px 18px' }}>
            <strong style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.05em', display: 'block', lineHeight: 1, color, fontFamily: 'system-ui,sans-serif' }}>{val}</strong>
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <section className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamerSel">Personal Dictionary</label>
            <select id="dreamerSel" className="journal-select" value={dreamerId} onChange={e => handleDreamerChange(e.target.value)}>
              <option value="">All Dreamers</option>
              <option value="owner-self">{ownerDisplayName || 'Owner / Self'}</option>
              {dreamers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="gameFil">Game Type</label>
            <select id="gameFil" className="journal-select" value={gameFilter} onChange={e => { setGameFilter(e.target.value as typeof gameFilter); void loadRows({ game: e.target.value }); }}>
              <option value="all">All Games</option>
              <option value="cash3">Cash 3</option>
              <option value="cash4">Cash 4</option>
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="stateFil">State</label>
            <select id="stateFil" className="journal-select" value={stateFilter} onChange={e => { setStateFilter(e.target.value); void loadRows({ state: e.target.value }); }}>
              <option value="">All States</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="termSearch">Search Term</label>
            <input id="termSearch" className="journal-input" value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter') void loadRows({ term: searchTerm }); }}
              onBlur={() => void loadRows()}
              placeholder="driving, sister, boat…" />
          </div>
          <div>
            <label className="journal-label" htmlFor="numSearch">Search Number</label>
            <input id="numSearch" className="journal-input" value={searchNumber}
              onChange={e => setSearchNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void loadRows({ num: searchNumber }); }}
              onBlur={() => void loadRows()}
              placeholder="856, 089…" style={{ fontFamily: 'monospace' }} />
            <button type="button" className="btn-secondary" style={{ fontSize:'12px' }}
              onClick={() => void loadRows()}>
              Search
            </button>
          </div>
        </div>

        {/* Search summary + pattern analysis */}
        {rows.length > 0 && searchTerm && (
          <div style={{ padding:'10px 14px', borderRadius:'13px', border:'1px solid rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.04)', display:'grid', gap:'5px', fontSize:'12px', color:'rgba(255,255,255,0.60)' }}>
            <div style={{ fontWeight:700, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
              Search: <span style={{ color:'#a090ff' }}>{searchTerm}</span>
              <span style={{ marginLeft:'10px', fontSize:'11px', color: lookupMode === 'targeted-term' ? '#60e09a' : 'rgba(255,204,80,0.70)' }}>
                {lookupMode === 'targeted-term' ? '✓ targeted lookup' : lookupMode === 'browse-sample' ? '⚠ capped sample' : lookupMode}
              </span>
            </div>
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
              <span>{rows.length} rows · {fellSummary.states.length} states · {fellSummary.numbers.length} numbers</span>
              {fellSummary.powerRepeats > 0 && <span style={{ color:'#60e09a' }}>⚡ {fellSummary.powerRepeats} power repeat{fellSummary.powerRepeats !== 1 ? 's' : ''}</span>}
              {rows.some((r: any) => r._isDuplicate) && <span style={{ color:'#ffcc50' }}>⚠ deduped duplicates</span>}
              {fellSummary.strongRepeats > 0 && <span style={{ color:'#ffcc50' }}>● {fellSummary.strongRepeats} strong</span>}
              <span>{fellSummary.straightTotal}S / {fellSummary.boxedTotal}B</span>
            </div>
          </div>
        )}

        {/* Power Repeats */}
        {populated.powerRepeats.filter(p => p.evidenceStrength !== 'Single Evidence').length > 0 && (
          <div style={{ display:'grid', gap:'8px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>
                Power &amp; Strong Repeats
              </span>
              {!eventsLoaded && searchTerm && (
                <button type="button" className="btn-secondary" style={{ fontSize:'11px' }}
                  onClick={() => void loadEvents(searchTerm)} disabled={eventsLoading}>
                  {eventsLoading ? '⏳ Loading events…' : '🔍 Load event drilldowns'}
                </button>
              )}
              {eventsLoaded && (
                <span style={{ fontSize:'11px', color:'#60e09a' }}>✓ {allEvents.length} individual events loaded</span>
              )}
            </div>
            {eventsError && <div style={{ fontSize:'12px', color:'#ff9090' }}>⚠ {eventsError}</div>}
            {populated.powerRepeats.filter(p => p.evidenceStrength !== 'Single Evidence').slice(0, 12).map(p => {
              const isP   = p.evidenceStrength === 'Power Repeat';
              const rKey  = `${p.termLabel}::${p.number}::${p.gameType}::${p.state}`;
              const isExp = expandedRepeat.has(rKey);
              const countMismatch = eventsLoaded && p.events.length < p.totalHitCount;
              return (
                <div key={rKey} style={{ borderRadius:'14px',
                  background: isP ? 'rgba(96,224,154,0.06)' : 'rgba(255,204,80,0.06)',
                  border:`1px solid ${isP ? 'rgba(96,224,154,0.20)' : 'rgba(255,204,80,0.16)'}` }}>
                  {/* Summary row */}
                  <div style={{ padding:'10px 13px', display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'13px',
                      color: p.gameType === 'cash4' ? '#a090ff' : '#ff8a6a',
                      padding:'2px 7px', borderRadius:'7px',
                      background: p.gameType === 'cash4' ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
                      border:`1px solid ${p.gameType === 'cash4' ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}` }}>
                      {p.number}
                    </span>
                    <span style={{ padding:'2px 7px', borderRadius:'7px', fontSize:'11px', fontWeight:800,
                      background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>
                      {p.state}
                    </span>
                    <span style={{ padding:'2px 8px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                      color: isP ? '#60e09a' : '#ffcc50', border:`1px solid ${isP ? 'rgba(96,224,154,0.28)' : 'rgba(255,204,80,0.22)'}`,
                      background: isP ? 'rgba(96,224,154,0.12)' : 'rgba(255,204,80,0.10)', fontFamily:'system-ui,sans-serif' }}>
                      {p.evidenceStrength}
                    </span>
                    <div style={{ flex:1, fontSize:'12px', color:'rgba(255,255,255,0.55)', display:'grid', gap:'2px' }}>
                      <span>
                        {eventVerifiedFor(p)
                          ? <span style={{ color:'#60e09a' }}>{eventCountFor(p)} verified event{eventCountFor(p) !== 1 ? 's' : ''}</span>
                          : <span>{p.totalHitCount} hit{p.totalHitCount !== 1 ? 's' : ''}</span>
                        }
                        {' · '}
                        {eventVerifiedFor(p)
                          ? <span>{eventStraightCountFor(p)}S / {eventBoxedCountFor(p)}B</span>
                          : <span>{p.straightCount}S / {p.boxedCount}B</span>
                        }
                        {p.uniqueDreamCount > 1 && <span style={{ color:'#a090ff', marginLeft:'6px' }}>· {p.uniqueDreamCount} dreams</span>}
                        {eventVerifiedFor(p) && (
                          <span style={{ marginLeft:'6px', padding:'1px 5px', borderRadius:'4px', fontSize:'9px', fontWeight:700, background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.28)', color:'#60e09a' }}>
                            Event Verified
                          </span>
                        )}
                        {countMismatch && !eventVerifiedFor(p) && (
                          <span style={{ marginLeft:'6px', padding:'1px 5px', borderRadius:'4px', fontSize:'9px', fontWeight:700, background:'rgba(255,204,80,0.12)', border:'1px solid rgba(255,204,80,0.26)', color:'#ffcc50' }}>
                            Aggregate Mismatch
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', fontFamily:'monospace' }}>
                        First: {p.firstHitDate || '—'} · Last: {p.lastHitDate || '—'}
                      </span>
                      {'_isDuplicate' in p && (p as any)._isDuplicate && (
                        <span style={{ fontSize:'10px', color:'rgba(255,204,80,0.70)' }}>
                          ⚠ Duplicate aggregate docs deduped. Run audit-hit-counts to repair.
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                      {p.sourceClasses.map(sc => (
                        <span key={sc} style={{ padding:'1px 6px', borderRadius:'5px', fontSize:'9px', fontWeight:700,
                          background: sc === 'backtest-replay' ? 'rgba(160,144,255,0.14)' : 'rgba(255,107,74,0.12)',
                          color: sc === 'backtest-replay' ? '#a090ff' : '#ff8a6a',
                          border:`1px solid ${sc === 'backtest-replay' ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.24)'}` }}>
                          {sc === 'backtest-replay' ? 'Backtest' : sc === 'live-dream-refresh' ? 'Live' : sc}
                        </span>
                      ))}
                      {eventsLoaded && (
                        <button type="button" onClick={() => toggleExpandedRepeat(rKey)}
                          style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'6px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.70)', cursor:'pointer' }}>
                          {isExp ? 'Hide ↑' : `View ${p.events.length || p.totalHitCount} event${(p.events.length || p.totalHitCount) !== 1 ? 's' : ''} ↓`}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Event drilldown */}
                  {isExp && p.events.length > 0 && (
                    <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)', padding:'8px 12px', display:'grid', gap:'5px' }}>
                      {countMismatch && (
                        <div style={{ fontSize:'11px', color:'rgba(255,204,80,0.70)' }}>
                          ⚠ Aggregate count ({p.totalHitCount}) is higher than visible events ({p.events.length}). Run repair/audit to rebuild event-level proof.
                        </div>
                      )}
                      {p.events.map((ev, i) => (
                        <div key={ev.id ?? i} style={{ fontSize:'11px', fontFamily:'monospace',
                          padding:'5px 8px', borderRadius:'8px', background:'rgba(255,255,255,0.04)',
                          display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center', color:'rgba(255,255,255,0.70)' }}>
                          <span style={{ color: ev.hitType === 'straight' ? '#60e09a' : '#ffcc50', fontWeight:700 }}>
                            {ev.hitType === 'straight' ? 'S' : 'B'}
                          </span>
                          {ev.winningNumber && <span style={{ color:'rgba(255,255,255,0.45)' }}>{ev.number}→{ev.winningNumber}</span>}
                          <span style={{ color:'rgba(255,255,255,0.55)' }}>{ev.drawDate || '—'}</span>
                          {ev.drawTime && <span style={{ color:'rgba(255,255,255,0.40)' }}>{ev.drawTime}</span>}
                          {ev.daysFromDream !== null && ev.daysFromDream !== undefined && (
                            <span style={{ color:'rgba(255,255,255,0.40)' }}>
                              {ev.sameDay ? 'Same day' : `Day ${ev.daysFromDream}`}
                            </span>
                          )}
                          <span style={{ padding:'1px 5px', borderRadius:'4px', fontSize:'9px',
                            background: ev._sourceClass === 'backtest-replay' ? 'rgba(160,144,255,0.14)' : 'rgba(255,107,74,0.12)',
                            color: ev._sourceClass === 'backtest-replay' ? '#a090ff' : '#ff8a6a' }}>
                            {ev._sourceClass === 'backtest-replay' ? 'Backtest' : ev._sourceClass === 'live-dream-refresh' ? 'Live' : 'Repair'}
                          </span>
                          {ev.dreamerName && <span style={{ color:'rgba(255,255,255,0.35)' }}>{ev.dreamerName}</span>}
                          {ev.backtestDreamId && (
                            <span style={{ color:'rgba(255,255,255,0.25)', fontSize:'9px' }}>
                              ID:{ev.backtestDreamId.slice(0, 8)}…
                            </span>
                          )}
                          {!ev.drawDate && <span style={{ color:'rgba(255,204,80,0.70)', fontSize:'9px' }}>Missing timestamp metadata.</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {isExp && p.events.length === 0 && eventsLoaded && (
                    <div style={{ padding:'8px 12px', fontSize:'11px', color:'rgba(255,204,80,0.70)', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                      No individual event rows found for this group. Run repair-backtest-memory to rebuild event-level proof.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Boxed Family Repeats */}
        {boxedRepeats.filter(b => b.numbers.length > 1).length > 0 && (
          <div style={{ display:'grid', gap:'7px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>
              Boxed Families
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {boxedRepeats.filter(b => b.numbers.length > 1).slice(0, 8).map(b => (
                <div key={`${b.boxedKey}::${b.state}`}
                  style={{ padding:'8px 12px', borderRadius:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ fontFamily:'monospace', fontWeight:900, fontSize:'12px', color:'#a090ff', marginBottom:'4px' }}>
                    {b.boxedKey} · <span style={{ fontSize:'10px', fontWeight:800, color:'#60e09a' }}>{b.state}</span>
                  </div>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'4px' }}>
                    {b.numbers.slice(0, 6).map(n => (
                      <span key={n} style={{ fontFamily:'monospace', fontSize:'11px', padding:'1px 6px', borderRadius:'5px',
                        background: b.gameType === 'cash4' ? 'rgba(160,144,255,0.14)' : 'rgba(255,107,74,0.14)',
                        color: b.gameType === 'cash4' ? '#a090ff' : '#ff8a6a' }}>{n}</span>
                    ))}
                  </div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.40)' }}>{b.totalHitCount} hits · {b.straightCount}S / {b.boxedCount}B</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State Hotspots */}
        {stateHotspots.filter(s => s.totalHitCount >= 2).length > 0 && (
          <div style={{ display:'grid', gap:'7px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>
              State Hotspots
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {stateHotspots.filter(s => s.totalHitCount >= 2).slice(0, 8).map(s => (
                <div key={`${s.termLabel}::${s.state}`}
                  style={{ padding:'8px 12px', borderRadius:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ fontWeight:900, fontSize:'13px', color:'#a090ff', fontFamily:'system-ui,sans-serif' }}>{s.state}</div>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)', marginTop:'3px' }}>
                    {s.totalHitCount} hits · {s.straightCount}S / {s.boxedCount}B
                  </div>
                  <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', marginTop:'2px' }}>
                    {s.numbers.slice(0, 4).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Day windows */}
        {dayWindows.filter(d => d.label !== 'Unknown').length > 0 && (
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', fontFamily:'system-ui,sans-serif', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Day Windows:</span>
            {dayWindows.filter(d => d.label !== 'Unknown').map(d => (
              <span key={d.label} style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'6px', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.60)', border:'1px solid rgba(255,255,255,0.09)' }}>
                {d.label}: {d.count}
              </span>
            ))}
          </div>
        )}

        {/* Capped sample note */}
        {totalSampled !== null && (
          <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', padding:'2px 0 6px' }}>
            Showing {rows.length} of {totalSampled} sampled rows.
            {lookupMode === 'browse-sample' && totalSampled >= 250 && !searchTerm && (
              <span style={{ color:'rgba(255,204,80,0.70)', marginLeft:'4px' }}>
                Capped sample. Use search to target a specific term.
              </span>
            )}
          </div>
        )}

        {/* Backtest hint — only on empty/default state */}
        {!loading && rows.length === 0 && (
          <div style={{ padding:'11px 14px', borderRadius:'13px', border:'1px solid rgba(160,144,255,0.22)', background:'rgba(160,144,255,0.07)', fontSize:'12px', color:'rgba(255,255,255,0.65)', lineHeight:1.7 }}>
            💡 <strong style={{ color:'#a090ff' }}>Looking for replay evidence?</strong>{' '}
            Try searching terms from Backtest Archive such as <strong>boat</strong>, <strong>truck</strong>, or <strong>crying</strong>,
            or filter <strong>Source = Backtest Replay</strong>.
          </div>
        )}

        {/* A–Z jump */}
        {letters.length > 0 && (
          <div>
            <div className="journal-label">Jump to</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {letters.map(l => (
                <a key={l} href={`#letter-${l}`} className="btn-secondary" style={{ textDecoration: 'none', padding: '3px 10px', fontSize: '12px' }}>{l}</a>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* State */}
      {loading && <section className="journal-card"><p style={{ margin: 0, color: 'rgba(255,255,255,0.55)' }}>Loading dictionary…</p></section>}
      {!loading && error && <div style={{ padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>{error}</div>}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && rows.length === 0 && (
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#a090ff' }}>
            <BookMarked size={18} />
            <strong>{dictionary.length === 0 ? 'No hit memory yet' : 'No matches for current filters'}</strong>
          </div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.50)', lineHeight: 1.7 }}>
            {lookupMode === 'targeted-term' || lookupMode === 'targeted-number'
              ? 'No targeted memory rows found for this term. If Backtest Archive shows hits for this term, run Backtest Memory Repair from the Integrity Console to promote the evidence.'
              : dictionary.length === 0
              ? 'No confirmed fell-before memory yet. Hits will appear here after active windows are refreshed and the engine finds matches.'
              : 'Try broadening the search or clearing filters.'}
          </p>
        </section>
      )}

      {/* Dictionary A–Z */}
      {!loading && !error && letters.map(letter => {
        const letterTerms = filtered.filter(g => g.letter === letter);
        if (!letterTerms.length) return null;

        return (
          <section key={letter} id={`letter-${letter}`} style={{ display: 'grid', gap: '14px' }}>

            {/* Letter header */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span style={{ fontSize: 'clamp(2rem,4vw,3.2rem)', fontWeight: 900, letterSpacing: '-0.05em', color: '#a090ff', fontFamily: 'system-ui,sans-serif', lineHeight: 1 }}>{letter}</span>
              <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: '13px' }}>{letterTerms.length} term{letterTerms.length !== 1 ? 's' : ''}</span>
            </div>

            {letterTerms.map(tg => (
              <section key={tg.term} id={`term-${slugify(tg.term)}`} className="journal-card" style={{ display: 'grid', gap: '16px' }}>

                {/* Term header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'system-ui,sans-serif', color: '#ffffff' }}>{tg.term}</h2>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', marginTop: '4px' }}>
                      {tg.numbers.length} number{tg.numbers.length !== 1 ? 's' : ''} · {tg.totalHits} total hit{tg.totalHits !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* Number groups */}
                <div style={{ display: 'grid', gap: '12px' }}>
                  {tg.numbers.map(ng => {
                    const isC3 = ng.gameType === 'cash3';
                    return (
                      <div key={ng.number + ng.gameType} style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.11)',
                        borderRadius: '16px',
                        padding: '14px 16px',
                        display: 'grid',
                        gap: '12px',
                      }}>

                        {/* Number + game badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 900, fontSize: '1.5rem',
                            letterSpacing: '0.08em', lineHeight: 1,
                            color: isC3 ? '#ff8a6a' : '#a090ff',
                          }}>{ng.number}</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '6px',
                            background: isC3 ? 'rgba(255,107,74,0.14)' : 'rgba(160,144,255,0.14)',
                            border: `1px solid ${isC3 ? 'rgba(255,107,74,0.28)' : 'rgba(160,144,255,0.28)'}`,
                            color: isC3 ? '#ff8a6a' : '#a090ff',
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            fontFamily: 'system-ui,sans-serif',
                          }}>{ng.gameType}</span>
                          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                            {ng.totalHits} hit{ng.totalHits !== 1 ? 's' : ''} across {ng.states.length} state{ng.states.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* State chips */}
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '8px', fontFamily: 'system-ui,sans-serif' }}>
                            Fell in
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {ng.states.map(sr => (
                              <StateChip key={`${sr.state}-${sr.gameType}-${sr.drawTime}`} state={sr.state} hitCount={sr.hitCount} hitType={sr.latestHitType} />
                            ))}
                          </div>
                        </div>

                        {/* Detail rows — expandable per state */}
                        <div style={{ display: 'grid', gap: '6px' }}>
                          {ng.states.map(sr => (
                            <div key={`${sr.state}-${sr.gameType}-${sr.drawTime}`} style={{
                              display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
                              padding: '8px 12px', borderRadius: '10px',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              fontSize: '12px',
                            }}>
                              <strong style={{ color: '#ffffff', fontFamily: 'system-ui,sans-serif', minWidth: '32px' }}>{sr.state}</strong>
                              <HitTypeBadge type={sr.latestHitType} />
                              <span style={{ color: 'rgba(255,255,255,0.50)' }}>
                                {sr.hitCount} hit{sr.hitCount !== 1 ? 's' : ''}
                                {sr.straightCount > 0 && ` · ${sr.straightCount} straight`}
                                {sr.boxedCount    > 0 && ` · ${sr.boxedCount} boxed`}
                              </span>
                              {sr.drawTime && sr.drawTime !== 'unknown' && (
                                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>{sr.drawTime}</span>
                              )}
                              {sr.lastHitDate && (
                                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', marginLeft: 'auto' }}>
                                  Last: {sr.lastHitDate}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        );
      })}

    </div>
  );
}

// ─── Export wrapped in Suspense ───────────────────────────────────────────────



function eventStraightCountFor(group: any): number {
  return Array.isArray(group?.events)
    ? group.events.filter((e: any) => String(e?.hitType ?? e?.matchMode ?? '').toLowerCase() === 'straight').length
    : 0;
}

function eventBoxedCountFor(group: any): number {
  return Array.isArray(group?.events)
    ? group.events.filter((e: any) => String(e?.hitType ?? e?.matchMode ?? '').toLowerCase() === 'boxed').length
    : 0;
}

function eventCountFor(group: any): number {
  return Array.isArray(group?.events) ? group.events.length : 0;
}

function eventVerifiedFor(group: any): boolean {
  const eventCount = eventCountFor(group);
  const aggregateCount = Number(group?.totalHitCount ?? group?.hitCount ?? 0);
  return eventCount > 0 && eventCount === aggregateCount;
}

export default function FellBeforePage() {
  return (
    <Suspense fallback={
      <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)' }}>
        <p style={{ color: 'rgba(255,255,255,0.55)' }}>Loading As They Fell Before…</p>
      </div>
    }>
      <FellBeforeInner />
    </Suspense>
  );
}
