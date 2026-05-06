'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { MapPinned } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WindowRow = {
  dreamEntryId: string;
  dreamerName:  string;
  activeStart:  string;
  activeEnd:    string;
  cash3Numbers: string[];
  cash4Numbers: string[];
  totalWatchItems: number;
  termMap: Record<string, { cash3: string[]; cash4: string[] }>;
  newHitsSinceLastCheck?: number;
};

type FellBeforeRow = {
  termLabel?:   string;
  number?:      string;
  state?:       string;
  gameType?:    string;
  hitCount?:    number;
  straightCount?: number;
  boxedCount?:  number;
  stateStrengthScore?: number;
  lastHitDate?: string;
  dreamerId?:   string;
  dreamerName?: string;
};

// A single candidate number for a state's playlist
type PlaylistEntry = {
  number:       string;
  gameType:     'cash3' | 'cash4';
  sourceTerm:   string;
  dreamerName:  string;
  dreamEntryId: string;
  fellBefore:   boolean;         // has confirmed fell-before support
  stateHitCount: number;         // how many times it fell in this state
  latestHitDate: string;
  matchTypes:   string[];        // 'straight' | 'boxed' | 'mixed'
  multiTerm:    boolean;         // multiple active terms → same number in this state
  termList:     string[];        // all active terms pointing here
};

// ─── Grouping helpers ─────────────────────────────────────────────────────────

// Re-use same grouping logic as Active Windows page
function buildGroupedWindows(raw: any[]): WindowRow[] {
  const map = new Map<string, WindowRow>();
  for (const row of raw) {
    const eid = String(row.dreamEntryId || row.id || '');
    if (!map.has(eid)) {
      map.set(eid, {
        dreamEntryId: eid,
        dreamerName:  String(row.dreamerName || 'Unknown'),
        activeStart:  String(row.activeStart || ''),
        activeEnd:    String(row.activeEnd   || ''),
        cash3Numbers: [], cash4Numbers: [], totalWatchItems: 0,
        termMap: {}, newHitsSinceLastCheck: row.newHitsSinceLastCheck ?? 0,
      });
    }
    const g  = map.get(eid)!;
    const gt = String(row.gameType || '');
    const num = String(row.number || '');
    const tl  = String(row.termLabel || row.term || '').trim().toLowerCase();

    if (num) {
      if (gt === 'cash4') { if (!g.cash4Numbers.includes(num)) g.cash4Numbers.push(num); }
      else                { if (!g.cash3Numbers.includes(num)) g.cash3Numbers.push(num); }
    }
    if (tl && num) {
      if (!g.termMap[tl]) g.termMap[tl] = { cash3: [], cash4: [] };
      const bucket = gt === 'cash4' ? g.termMap[tl].cash4 : g.termMap[tl].cash3;
      if (!bucket.includes(num)) bucket.push(num);
    }
    g.totalWatchItems++;
    if ((row.activeEnd ?? '') > (g.activeEnd ?? '')) {
      g.activeEnd   = row.activeEnd;
      g.activeStart = row.activeStart;
    }
  }
  return Array.from(map.values());
}

// Build a fast lookup: termLabel_lowercase::number::gameType → { states, hitCount, … }
type FellKey = string;
type FellEvidence = {
  states:     string[];
  hitCount:   number;
  stateDetails: Map<string, { hitCount: number; matchType: string; lastHitDate: string }>;
};

function buildFellIndex(rows: FellBeforeRow[]): Map<FellKey, FellEvidence> {
  const idx = new Map<FellKey, FellEvidence>();
  for (const row of rows) {
    const term = String(row.termLabel ?? '').trim().toLowerCase();
    const num  = String(row.number   ?? '').trim();
    const state= String(row.state    ?? '').trim();
    const gt   = String(row.gameType ?? '').trim();
    if (!term || !num || !state) continue;

    const key: FellKey = `${term}::${num}::${gt}`;
    if (!idx.has(key)) idx.set(key, { states: [], hitCount: 0, stateDetails: new Map() });
    const ev = idx.get(key)!;
    if (!ev.states.includes(state)) ev.states.push(state);
    ev.hitCount += Number(row.hitCount ?? 1);

    const sc = Number(row.straightCount ?? 0);
    const bc = Number(row.boxedCount    ?? 0);
    const mt = sc > 0 && bc > 0 ? 'mixed' : sc > 0 ? 'straight' : 'boxed';
    const prev = ev.stateDetails.get(state);
    if (!prev) {
      ev.stateDetails.set(state, { hitCount: Number(row.hitCount ?? 1), matchType: mt, lastHitDate: String(row.lastHitDate ?? '') });
    } else {
      prev.hitCount += Number(row.hitCount ?? 1);
      if (String(row.lastHitDate ?? '') > prev.lastHitDate) prev.lastHitDate = String(row.lastHitDate ?? '');
    }
  }
  return idx;
}

// Build state-grouped playlist entries from active windows + fell index
type StateGroup = { state: string; entries: PlaylistEntry[]; };

function buildStatePlaylists(
  windows: WindowRow[],
  today: string,
  fellIdx: Map<FellKey, FellEvidence>
): { stateGroups: StateGroup[]; watchlist: PlaylistEntry[] } {
  const stateMap  = new Map<string, Map<string, PlaylistEntry>>(); // state → num::gt → entry
  const watchMap  = new Map<string, PlaylistEntry>();              // num::gt::term → entry (no state)

  const activeWindows = windows.filter(w => (w.activeEnd ?? '') >= today);

  for (const win of activeWindows) {
    // Collect all term→number pairs from this window
    const pairs: Array<{ term: string; num: string; gt: 'cash3'|'cash4' }> = [];

    for (const [term, payload] of Object.entries(win.termMap)) {
      for (const n of payload.cash3) pairs.push({ term, num: n, gt: 'cash3' });
      for (const n of payload.cash4) pairs.push({ term, num: n, gt: 'cash4' });
    }
    // Fallback: numbers with no term mapping
    for (const n of win.cash3Numbers) {
      if (!pairs.some(p => p.num === n && p.gt === 'cash3')) pairs.push({ term: '', num: n, gt: 'cash3' });
    }
    for (const n of win.cash4Numbers) {
      if (!pairs.some(p => p.num === n && p.gt === 'cash4')) pairs.push({ term: '', num: n, gt: 'cash4' });
    }

    for (const { term, num, gt } of pairs) {
      const fellKey: FellKey = `${term}::${num}::${gt}`;
      const ev = fellIdx.get(fellKey);

      if (ev && ev.states.length > 0) {
        // Has fell-before state evidence — add to each state
        for (const state of ev.states) {
          if (!stateMap.has(state)) stateMap.set(state, new Map());
          const stateEntries = stateMap.get(state)!;
          const entryKey = `${num}::${gt}`;
          const sd = ev.stateDetails.get(state);

          if (!stateEntries.has(entryKey)) {
            stateEntries.set(entryKey, {
              number: num, gameType: gt,
              sourceTerm: term, dreamerName: win.dreamerName,
              dreamEntryId: win.dreamEntryId, fellBefore: true,
              stateHitCount: sd?.hitCount ?? 1,
              latestHitDate: sd?.lastHitDate ?? '',
              matchTypes: [sd?.matchType ?? 'boxed'],
              multiTerm: false, termList: [term],
            });
          } else {
            const e = stateEntries.get(entryKey)!;
            if (!e.termList.includes(term)) { e.termList.push(term); e.multiTerm = e.termList.length > 1; }
            if (sd && sd.hitCount > e.stateHitCount) e.stateHitCount = sd.hitCount;
            if (sd?.matchType && !e.matchTypes.includes(sd.matchType)) e.matchTypes.push(sd.matchType);
          }
        }
      } else {
        // No fell-before evidence — add to watchlist
        const watchKey = `${num}::${gt}::${term}`;
        if (!watchMap.has(watchKey)) {
          watchMap.set(watchKey, {
            number: num, gameType: gt, sourceTerm: term,
            dreamerName: win.dreamerName, dreamEntryId: win.dreamEntryId,
            fellBefore: false, stateHitCount: 0, latestHitDate: '',
            matchTypes: [], multiTerm: false, termList: [term],
          });
        }
      }
    }
  }

  const stateGroups: StateGroup[] = Array.from(stateMap.entries())
    .map(([state, entryMap]) => ({
      state,
      entries: Array.from(entryMap.values())
        .sort((a, b) => b.stateHitCount - a.stateHitCount || (a.multiTerm ? -1 : 1)),
    }))
    .sort((a, b) => b.entries.length - a.entries.length);

  const watchlist = Array.from(watchMap.values());

  return { stateGroups, watchlist };
}

// ─── Visual helpers ───────────────────────────────────────────────────────────

function NumberChip({ n, game }: { n: string; game: 'cash3'|'cash4' }) {
  return (
    <span style={{
      fontFamily: 'monospace', fontWeight: 700, fontSize: '14px',
      background:   game === 'cash3' ? 'rgba(255,107,74,0.16)' : 'rgba(160,144,255,0.16)',
      border:       `1px solid ${game === 'cash3' ? 'rgba(255,107,74,0.32)' : 'rgba(160,144,255,0.32)'}`,
      color:        game === 'cash3' ? '#ff8a6a' : '#a090ff',
      borderRadius: '8px', padding: '4px 10px', letterSpacing: '0.06em',
    }}>{n}</span>
  );
}

type BadgeKind = 'fell' | 'active' | 'multi' | 'straight' | 'boxed';
const BADGE: Record<BadgeKind, { bg: string; border: string; color: string; label: string }> = {
  fell:     { bg: 'rgba(96,224,154,0.14)',  border: 'rgba(96,224,154,0.30)',  color: '#60e09a', label: 'Fell Before' },
  active:   { bg: 'rgba(255,107,74,0.14)',  border: 'rgba(255,107,74,0.30)',  color: '#ff8a6a', label: 'Active Dream' },
  multi:    { bg: 'rgba(255,204,80,0.14)',  border: 'rgba(255,204,80,0.30)',  color: '#ffcc50', label: 'Multi-Term' },
  straight: { bg: 'rgba(96,224,154,0.10)',  border: 'rgba(96,224,154,0.24)',  color: '#60e09a', label: 'Straight' },
  boxed:    { bg: 'rgba(255,204,80,0.10)',  border: 'rgba(255,204,80,0.24)',  color: '#ffcc50', label: 'Boxed' },
};

function Badge({ kind }: { kind: BadgeKind }) {
  const b = BADGE[kind];
  return (
    <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontFamily: 'system-ui,sans-serif', letterSpacing: '0.03em' }}>
      {b.label}
    </span>
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


function CapWarning({ capped, count }: { capped?: boolean; count: number }) {
  if (!capped) return null;
  return (
    <div style={{ padding:'9px 13px', borderRadius:'12px', border:'1px solid rgba(255,204,80,0.26)',
      background:'rgba(255,204,80,0.07)', fontSize:'12px', color:'rgba(255,255,255,0.65)', lineHeight:1.6 }}>
      <strong style={{ color:'#ffcc50' }}>⚠ Visible page only ({count} windows).</strong>
      {' '}Playlist candidates below are based on the visible window set only. Filter by dreamer to see complete groups.
    </div>
  );
}

export default function PlaylistsPage() {
  const { user } = useAuth();

  const [windowsRaw,  setWindowsRaw]  = useState<any[]>([]);
  const [windowsCapped, setWindowsCapped] = useState(false);
  const [capCount,      setCapCount]      = useState(0);
  const [fellRows,    setFellRows]    = useState<FellBeforeRow[]>([]);
  const [ebCandidates,  setEbCandidates]  = useState<any[]>([]);
  const [ebNoEvidence,  setEbNoEvidence]  = useState<any[]>([]);
  const [ebRecentOnly,  setEbRecentOnly]  = useState<any[]>([]);
  const [ebMeta,        setEbMeta]        = useState<{ activeTermCount: number; activeWindowCount: number; dreamerBreakdown: Record<string,number> }>({ activeTermCount: 0, activeWindowCount: 0, dreamerBreakdown: {} });
  const [recentHits,     setRecentHits]    = useState<any[]>([]);
  const [playlistHits,   setPlaylistHits]  = useState<any[]>([]);
  const [snapshotSaving, setSnapshotSaving]= useState(false);
  const [snapshotResult, setSnapshotResult]= useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  const [stateSearch, setStateSearch] = useState('');
  const [pinningKey,  setPinningKey]  = useState('');
  const [pinMsg,      setPinMsg]      = useState<Record<string, string>>({});
  const [numSearch,   setNumSearch]   = useState('');
  const [termSearch,  setTermSearch]  = useState('');

  async function saveSnapshot() {
    if (!user) return;
    setSnapshotSaving(true); setSnapshotResult('');
    try {
      const res  = await fetch('/api/admin/save-playlist-candidates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (data.ok) setSnapshotResult(`Saved ${data.candidatesSaved ?? 0} candidates · ${data.hitsFound ?? 0} hits found.`);
      else setSnapshotResult(data.error ?? 'Snapshot failed.');
    } catch (e) { setSnapshotResult(String(e)); }
    finally { setSnapshotSaving(false); }
  }

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [winRes, fellRes, hitsRes, snapsRes] = await Promise.all([
          fetch(`/api/dreams/window-groups?ownerUid=${uid}&limit=50`),
          fetch(`/api/playlists/evidence-backed?ownerUid=${uid}`),
          fetch(`/api/dreams/hits?ownerUid=${uid}&limit=100`),
          fetch(`/api/admin/playlist-hits?ownerUid=${uid}&limit=50`).catch(() => null),
        ]);
        const [winData, ebData, hitsData, snapsData] = await Promise.all([
          winRes.json(), fellRes.json(), hitsRes.json(),
          snapsRes ? snapsRes.json().catch(() => null) : Promise.resolve(null),
        ]);
        if (!winData.ok) throw new Error(winData.error || 'Windows load failed.');
        setWindowsRaw(winData.windows ?? []);
        setWindowsCapped(winData.capped ?? false);
        setCapCount(winData.totalActiveWindows ?? (winData.windows ?? []).length);
        if (ebData?.ok) {
          setEbCandidates(ebData.candidates ?? []);
          setEbNoEvidence(ebData.noEvidenceCandidates ?? []);
          setEbRecentOnly(ebData.recentHitOnlyCandidates ?? []);
          setEbMeta({ activeTermCount: ebData.activeTermCount ?? 0, activeWindowCount: ebData.activeWindowCount ?? 0, dreamerBreakdown: ebData.dreamerBreakdown ?? {} });
        }
        // Still set fellRows from ebData for backward compat with any helpers that use it
        setFellRows([]);
        if (hitsData?.ok) setRecentHits(hitsData.hits ?? []);
        if (snapsData?.ok) setPlaylistHits(snapsData.hits ?? []);
      } catch (err) { console.error(err); setError('Could not load playlist data.'); }
      finally { setLoading(false); }
    }
    void load();
  }, [user]);

  const today   = new Date().toISOString().slice(0, 10);
  const windows = useMemo(() => buildGroupedWindows(windowsRaw), [windowsRaw]);
  const active  = useMemo(() => windows.filter(w => (w.activeEnd ?? '') >= today), [windows, today]);
  const fellIdx = useMemo(() => buildFellIndex(fellRows), [fellRows]);
  // statePlaylistHits index — confirmed hits on persisted candidates
  const playlistHitIndex = useMemo(() => {
    const idx = new Map<string, { hitType: string; drawDate: string; winningNumber: string; drawTime: string }>();
    for (const h of playlistHits) {
      const key = `${h.number ?? ''}::${h.state ?? ''}`;
      if (!idx.has(key)) idx.set(key, { hitType: h.hitType ?? '', drawDate: h.drawDate ?? '', winningNumber: h.winningNumber ?? '', drawTime: h.drawTime ?? '' });
    }
    return idx;
  }, [playlistHits]);

  const hitIndex = useMemo(() => {
    const idx = new Map<string, { hitType: string; drawDate: string; winningNumber: string }>();
    for (const h of recentHits) {
      const num   = String(h.number ?? h.candidate ?? '');
      const state = String(h.state ?? '');
      if (!num || !state) continue;
      const key = `${num}::${state}`;
      const dd  = String(h.drawDate ?? h.draw_date ?? '');
      if (!idx.has(key) || dd > (idx.get(key)?.drawDate ?? ''))
        idx.set(key, { hitType: String(h.hitType ?? h.match_type ?? ''), drawDate: dd, winningNumber: String(h.winningNumber ?? h.winning_number ?? '') });
    }
    return idx;
  }, [recentHits]);

  const { stateGroups, watchlist } = useMemo(
    () => buildStatePlaylists(windows, today, fellIdx),
    [windows, today, fellIdx]
  );

  // Filters
  const filteredGroups = useMemo(() => {
    const qs = stateSearch.trim().toUpperCase();
    const qn = numSearch.trim();
    const qt = termSearch.trim().toLowerCase();
    return stateGroups
      .filter(g => !qs || g.state.toUpperCase().includes(qs))
      .map(g => ({
        ...g,
        entries: g.entries.filter(e =>
          (!qn || e.number.includes(qn)) &&
          (!qt || e.sourceTerm.toLowerCase().includes(qt) || e.termList.some(t => t.toLowerCase().includes(qt)))
        ),
      }))
      .filter(g => g.entries.length > 0);
  }, [stateGroups, stateSearch, numSearch, termSearch]);

  const filteredWatchlist = useMemo(() => {
    const qn = numSearch.trim();
    const qt = termSearch.trim().toLowerCase();
    return watchlist.filter(e =>
      (!qn || e.number.includes(qn)) &&
      (!qt || e.sourceTerm.toLowerCase().includes(qt))
    );
  }, [watchlist, numSearch, termSearch]);

  const totalEntries = stateGroups.reduce((s, g) => s + g.entries.length, 0);

  // ── Pin a playlist entry ────────────────────────────────────────────────────
  async function pinEntry(entry: PlaylistEntry, state: string) {
    if (!user || pinningKey) return;
    const key = `${state}::${entry.number}::${entry.gameType}`;
    setPinningKey(key);
    try {
      const res = await fetch('/api/pinned-plays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid:      user.uid,
          number:        entry.number,
          gameType:      entry.gameType,
          state,
          sourceTerms:   entry.termList,
          sourceTerm:    entry.sourceTerm,
          source:        'state-playlists',
          reason:        entry.fellBefore
            ? `Fell in ${state} (${entry.stateHitCount} hit${entry.stateHitCount !== 1 ? 's' : ''})`
            : `Active dream: ${entry.sourceTerm}`,
          dreamerName:   entry.dreamerName,
          hitCount:      entry.stateHitCount,
          states:        [state],
          evidenceBadges: [
            'Active Dream',
            ...(entry.fellBefore ? ['Fell Before'] : []),
            ...(entry.multiTerm  ? ['Multi-Term']  : []),
          ],
          status: 'suggested',
        }),
      });
      const data = await res.json();
      setPinMsg(m => ({ ...m, [key]: data.duplicate ? 'Already pinned' : '✓ Pinned' }));
      setTimeout(() => setPinMsg(m => { const n = { ...m }; delete n[key]; return n; }), 3000);
    } catch {
      setPinMsg(m => ({ ...m, [key]: 'Pin failed' }));
    } finally { setPinningKey(''); }
  }

    // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="page-header">
            <h1>State Playlists</h1>
            <p>State-by-state candidate numbers built from active dream terms and fell-before evidence. Each number shows exactly why it appears.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/fell-before"    className="btn-secondary">As They Fell Before</Link>
            <Link href="/windows"        className="btn-secondary">Active Windows</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {([
          ['Active Windows', active.length,         '#ff6b4a'],
          ['States',         stateGroups.length,    '#a090ff'],
          ['Candidates',     totalEntries,           '#60e09a'],
          ['Watchlist',      watchlist.length,       '#ffcc50'],
        ] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '18px', padding: '14px 18px' }}>
            <strong style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.05em', display: 'block', lineHeight: 1, color, fontFamily: 'system-ui,sans-serif' }}>{val}</strong>
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <section className="journal-card-flat" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))' }}>
        <div>
          <label className="journal-label" htmlFor="stateSearch">Filter State</label>
          <input id="stateSearch" className="journal-input" value={stateSearch} onChange={e => setStateSearch(e.target.value)} placeholder="GA, FL, NC…" style={{ textTransform: 'uppercase' }} />
        </div>
        <div>
          <label className="journal-label" htmlFor="numSearch">Filter Number</label>
          <input id="numSearch" className="journal-input" value={numSearch} onChange={e => setNumSearch(e.target.value)} placeholder="856, 015…" style={{ fontFamily: 'monospace' }} />
        </div>
        <div>
          <label className="journal-label" htmlFor="termSearch">Filter Term</label>
          <input id="termSearch" className="journal-input" value={termSearch} onChange={e => setTermSearch(e.target.value)} placeholder="car, sister…" />
        </div>
      </section>

      <CapWarning capped={windowsCapped} count={capCount} />
      {/* Save Snapshot + Attribution status */}
      <section style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
        <button type="button" className="btn-secondary" style={{ fontSize:'12px' }}
          onClick={saveSnapshot} disabled={snapshotSaving || !user}>
          {snapshotSaving ? '⏳ Saving…' : '📸 Save Playlist Snapshot'}
        </button>
        {snapshotResult
          ? <span style={{ fontSize:'12px', color: snapshotResult.startsWith('Saved') ? '#60e09a' : '#ff9090' }}>{snapshotResult}</span>
          : <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)' }}>Playlist attribution begins after candidate snapshots are saved.</span>
        }
      </section>

      {/* Recent Playlist Hits — confirmed hits on persisted candidates */}
      {playlistHits.length > 0 && (
        <section className="journal-card">
          <h2 style={{ margin:'0 0 12px', fontSize:'1.0rem', fontWeight:900, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
            Recent Playlist Hits
          </h2>
          <div style={{ display:'grid', gap:'7px' }}>
            {playlistHits.slice(0, 10).map((h: any, i: number) => {
              const isS = h.hitType === 'straight' || h.hitType === 'exact';
              return (
                <div key={h.id ?? i} style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center',
                  padding:'8px 12px', borderRadius:'12px',
                  background: isS ? 'rgba(96,224,154,0.08)' : 'rgba(255,204,80,0.07)',
                  border:`1px solid ${isS ? 'rgba(96,224,154,0.22)' : 'rgba(255,204,80,0.18)'}` }}>
                  <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'13px',
                    color: h.gameType === 'cash4' ? '#a090ff' : '#ff8a6a',
                    padding:'2px 7px', borderRadius:'7px',
                    background: h.gameType === 'cash4' ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
                    border:`1px solid ${h.gameType === 'cash4' ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}` }}>
                    {h.number}→{h.winningNumber}
                  </span>
                  <span style={{ padding:'2px 7px', borderRadius:'6px', fontSize:'11px', fontWeight:800,
                    background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a' }}>
                    {h.state}
                  </span>
                  <span style={{ fontSize:'11px', fontWeight:700, color: isS ? '#60e09a' : '#ffcc50' }}>{isS ? 'Straight' : 'Boxed'}</span>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.55)' }}>{h.termLabel}</span>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', fontFamily:'monospace', marginLeft:'auto' }}>
                    {h.drawDate} {h.drawTime}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loading && <section className="journal-card"><p style={{ margin: 0, color: 'rgba(255,255,255,0.55)' }}>Building evidence-backed playlists…</p></section>}
      {!loading && error && <div style={{ padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>{error}</div>}

      {/* ── Empty state ── */}
      {!loading && !error && ebCandidates.length === 0 && ebNoEvidence.length === 0 && (
        <section className="journal-card">
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px', color:'#a090ff' }}>
            <MapPinned size={18} />
            <strong>No evidence-backed playlist entries yet</strong>
          </div>
          <p style={{ margin:0, color:'rgba(255,255,255,0.50)', lineHeight:1.7 }}>
            {ebMeta.activeWindowCount === 0
              ? 'No active dream windows. Write a dream entry to generate candidates.'
              : 'Active windows exist but no historical fell-before evidence for these terms yet. Run a refresh, then check As They Fell Before.'}
          </p>
        </section>
      )}

      {/* ── Section 1: Evidence-Backed State Playlist ── */}
      {!loading && ebCandidates.length > 0 && (
        <section style={{ display:'grid', gap:'10px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
            <div>
              <h2 style={{ margin:0, fontSize:'1.0rem', fontWeight:900, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
                Evidence-Backed State Playlist
              </h2>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginTop:'3px' }}>
                {ebCandidates.length} candidate{ebCandidates.length !== 1 ? 's' : ''} · {ebMeta.activeWindowCount} active windows · {ebMeta.activeTermCount} active terms · past-window evidence only
              </div>
            </div>
          </div>
          <div style={{ display:'grid', gap:'8px' }}>
            {ebCandidates.filter((c: any) => c.strengthTier !== 'Cross-Dream Convergence').map((c: any) => {
              const isStrong = c.strengthTier === 'Strong Play';
              const isMed    = c.strengthTier === 'Watch Closely';
              const tierColor = isStrong ? '#60e09a' : isMed ? '#ffcc50' : '#a090ff';
              return (
                <div key={`${c.normalizedTerm}::${c.number}::${c.gameType}::${c.state}`}
                  style={{ padding:'10px 13px', borderRadius:'14px',
                    background: isStrong ? 'rgba(96,224,154,0.07)' : 'rgba(255,255,255,0.06)',
                    border:`1px solid ${isStrong ? 'rgba(96,224,154,0.20)' : 'rgba(255,255,255,0.09)'}`,
                    display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                  {/* State chip */}
                  <span style={{ padding:'2px 8px', borderRadius:'7px', fontSize:'12px', fontWeight:800, background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a', fontFamily:'system-ui,sans-serif', minWidth:'28px', textAlign:'center' }}>
                    {c.state}
                  </span>
                  {/* Number chip */}
                  <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'13px', padding:'2px 8px', borderRadius:'7px',
                    background: c.gameType === 'cash4' ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
                    border:`1px solid ${c.gameType === 'cash4' ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}`,
                    color: c.gameType === 'cash4' ? '#a090ff' : '#ff8a6a' }}>
                    {c.number}
                  </span>
                  {/* Tier badge */}
                  <span style={{ padding:'2px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700,
                    color: tierColor, border:`1px solid ${tierColor}40`,
                    background:`${tierColor}15`, fontFamily:'system-ui,sans-serif' }}>
                    {c.strengthTier}
                  </span>
                  {/* Meta */}
                  <div style={{ flex:1, fontSize:'12px', color:'rgba(255,255,255,0.55)', lineHeight:1.5, minWidth:'120px' }}>
                    <span style={{ fontWeight:700, color:'rgba(255,255,255,0.80)' }}>{c.termLabel}</span>
                    {' · '}
                    {c.verifiedPastEventCount ?? c.verifiedEventCount ?? 0} verified past event{(c.verifiedPastEventCount ?? c.verifiedEventCount ?? 0) !== 1 ? 's' : ''}
                    {c.straightCount > 0 && ` · ${c.straightCount}S`}
                    {c.boxedCount > 0   && ` · ${c.boxedCount}B`}
                    {c.lastHitDate && <span style={{ color:'rgba(255,255,255,0.35)', marginLeft:'6px', fontFamily:'monospace', fontSize:'11px' }}>{c.lastHitDate}</span>}
                  </div>
                  {/* Hit attribution */}
                  {(() => {
                    const h = playlistHitIndex.get(`${c.number}::${c.state}`) || hitIndex.get(`${c.number}::${c.state}`);
                    if (!h) return null;
                    const isS = h.hitType === 'exact' || h.hitType === 'straight';
                    return (
                      <span style={{ padding:'2px 7px', borderRadius:'999px', fontSize:'9px', fontWeight:800,
                        background: isS ? 'rgba(96,224,154,0.18)' : 'rgba(255,204,80,0.14)',
                        border:`1px solid ${isS ? 'rgba(96,224,154,0.35)' : 'rgba(255,204,80,0.30)'}`,
                        color: isS ? '#60e09a' : '#ffcc50', fontFamily:'system-ui,sans-serif' }}>
                        {isS ? '🎯 Straight Hit' : '📦 Boxed Hit'} {h.drawDate}
                      </span>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 2: Cross-Dream Convergence ── */}
      {!loading && ebCandidates.filter((c: any) => c.strengthTier === 'Cross-Dream Convergence').length > 0 && (
        <section style={{ display:'grid', gap:'8px' }}>
          <h2 style={{ margin:0, fontSize:'1.0rem', fontWeight:900, color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>
            ⚡ Cross-Dream Convergence
          </h2>
          <div style={{ display:'grid', gap:'7px' }}>
            {ebCandidates.filter((c: any) => c.strengthTier === 'Cross-Dream Convergence').map((c: any) => (
              <div key={`xd::${c.normalizedTerm}::${c.number}::${c.state}`}
                style={{ padding:'10px 13px', borderRadius:'14px',
                  background:'rgba(96,224,154,0.09)', border:'1px solid rgba(96,224,154,0.28)',
                  display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ padding:'2px 8px', borderRadius:'7px', fontSize:'12px', fontWeight:800, background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>{c.state}</span>
                <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'13px', padding:'2px 8px', borderRadius:'7px',
                  background: c.gameType === 'cash4' ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
                  color: c.gameType === 'cash4' ? '#a090ff' : '#ff8a6a',
                  border:`1px solid ${c.gameType === 'cash4' ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}` }}>{c.number}</span>
                <span style={{ padding:'2px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700, color:'#60e09a', border:'1px solid rgba(96,224,154,0.35)', background:'rgba(96,224,154,0.12)', fontFamily:'system-ui,sans-serif' }}>Cross-Dream Convergence</span>
                <div style={{ flex:1, fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>
                  <span style={{ fontWeight:700, color:'rgba(255,255,255,0.80)' }}>{c.termLabel}</span>
                  {' · '}{c.activeDreamerCount} dreamers: {c.activeDreamers.slice(0,3).join(', ')}
                  {' · '}{c.verifiedPastEventCount ?? 0} verified past event{(c.verifiedPastEventCount ?? 0) !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 3: Recent Confirmed Hits From Active Windows ── */}
      {!loading && (recentHits.length > 0 || ebRecentOnly.length > 0) && (
        <section className="journal-card">
          <h2 style={{ margin:'0 0 4px', fontSize:'1.0rem', fontWeight:900, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
            Recent Confirmed Hits From Active Windows
          </h2>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginBottom:'12px' }}>
            Current-window hits. These are not State Playlist candidates until they recur in a future independent dream window.
          </div>
          {ebRecentOnly.length > 0 && (
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' }}>
              {ebRecentOnly.slice(0, 10).map((c: any) => (
                <span key={`rh::${c.normalizedTerm}::${c.number}::${c.state}`}
                  style={{ fontFamily:'monospace', fontWeight:700, fontSize:'11px', padding:'2px 7px', borderRadius:'7px',
                    background: c.gameType === 'cash4' ? 'rgba(160,144,255,0.14)' : 'rgba(255,107,74,0.12)',
                    color: c.gameType === 'cash4' ? '#a090ff' : '#ff8a6a',
                    border:`1px solid ${c.gameType === 'cash4' ? 'rgba(160,144,255,0.24)' : 'rgba(255,107,74,0.22)'}` }}>
                  {c.number}
                  {c.state && <span style={{ fontSize:'9px', marginLeft:'3px', opacity:0.6 }}>{c.state}</span>}
                </span>
              ))}
            </div>
          )}
          <div style={{ display:'grid', gap:'6px' }}>
            {recentHits.slice(0, 8).map((h: any, i: number) => {
              const isS = h.hitType === 'exact' || h.hitType === 'straight' || h.matchType === 'exact';
              return (
                <div key={i} style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center', padding:'7px 10px', borderRadius:'10px',
                  background: isS ? 'rgba(96,224,154,0.07)' : 'rgba(255,204,80,0.06)',
                  border:`1px solid ${isS ? 'rgba(96,224,154,0.18)' : 'rgba(255,204,80,0.14)'}` }}>
                  <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:'12px', padding:'1px 6px', borderRadius:'6px',
                    background: (h.gameType||h.game_type) === 'cash4' ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
                    color: (h.gameType||h.game_type) === 'cash4' ? '#a090ff' : '#ff8a6a',
                    border:`1px solid ${(h.gameType||h.game_type) === 'cash4' ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}` }}>
                    {h.candidate ?? h.number}
                  </span>
                  <span style={{ padding:'2px 6px', borderRadius:'6px', fontSize:'10px', fontWeight:800, background:'rgba(96,224,154,0.10)', color:'#60e09a', border:'1px solid rgba(96,224,154,0.22)' }}>
                    {h.state}
                  </span>
                  <span style={{ fontSize:'11px', fontWeight:700, color: isS ? '#60e09a' : '#ffcc50' }}>{isS ? 'Straight' : 'Boxed'}</span>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.50)' }}>{h.termLabel ?? ''}</span>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)', marginLeft:'auto', fontFamily:'monospace' }}>{h.drawDate ?? h.draw_date ?? ''}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 4: New Active Numbers — No Evidence Yet ── */}
      {!loading && ebNoEvidence.length > 0 && (
        <details style={{ padding:'10px 14px', borderRadius:'13px', border:'1px solid rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.04)' }}>
          <summary style={{ cursor:'pointer', fontSize:'12px', color:'rgba(255,255,255,0.55)', fontWeight:700, fontFamily:'system-ui,sans-serif', listStyle:'none', display:'flex', gap:'8px', alignItems:'center' }}>
            <span>New Active Numbers — No Fell-Before Evidence Yet ({ebNoEvidence.length})</span>
          </summary>
          <div style={{ marginTop:'10px', fontSize:'12px', color:'rgba(255,255,255,0.45)', lineHeight:1.6, marginBottom:'8px' }}>
            These numbers are active from current dream windows but have no historical fell-before evidence yet.
            They will become playlist candidates after confirmed hits are detected and promoted.
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {ebNoEvidence.slice(0, 30).map((c: any) => (
              <span key={`ne::${c.normalizedTerm}::${c.number}::${c.gameType}`}
                style={{ fontFamily:'monospace', fontWeight:700, fontSize:'11px', padding:'2px 7px', borderRadius:'7px',
                  background: c.gameType === 'cash4' ? 'rgba(160,144,255,0.14)' : 'rgba(255,107,74,0.12)',
                  color: c.gameType === 'cash4' ? '#a090ff' : '#ff8a6a',
                  border:`1px solid ${c.gameType === 'cash4' ? 'rgba(160,144,255,0.24)' : 'rgba(255,107,74,0.22)'}` }}>
                {c.number}
                <span style={{ fontSize:'9px', marginLeft:'3px', opacity:0.6 }}>{c.termLabel}</span>
              </span>
            ))}
            {ebNoEvidence.length > 30 && <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>+{ebNoEvidence.length - 30} more</span>}
          </div>
        </details>
      )}

    </div>
  );
}
