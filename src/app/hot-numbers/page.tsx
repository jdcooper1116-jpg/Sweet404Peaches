'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Flame } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WindowRow = {
  dreamEntryId: string;
  dreamerName:  string;
  activeStart:  string;
  activeEnd:    string;
  cash3Numbers: string[];
  cash4Numbers: string[];
  termMap: Record<string, { cash3: string[]; cash4: string[] }>;
};

type FellBeforeRow = {
  termLabel?:   string;
  number?:      string;
  state?:       string;
  gameType?:    string;
  hitCount?:    number;
  straightCount?: number;
  boxedCount?:  number;
};

type BoxedFamily = {
  boxedKey:    string;   // sorted digits, e.g. "226" or "0178"
  gameType:    'cash3' | 'cash4';
  numbers:     string[];           // all display numbers in this family
  terms:       string[];           // all active terms pointing here
  dreamers:    string[];           // all dreamers involved
  windowIds:   string[];           // dreamEntryIds
  fellBefore:  boolean;
  fellStates:  string[];           // states where this family has evidence
  fellHitCount:number;
  strength:    number;             // termCount * 3 + dreamerCount * 2 + fellHitCount
};

// ─── Boxed key computation ────────────────────────────────────────────────────

/**
 * Compute boxed key: sort digits ascending, preserve leading zeros by keeping length.
 * "226" → "226"   "620" → "026"   "015" → "015"   "0187" → "0178"
 */
function boxedKey(num: string): string {
  return num.split('').sort().join('');
}

// ─── Group helper for windows (same as other pages) ──────────────────────────

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
        cash3Numbers: [], cash4Numbers: [], termMap: {},
      });
    }
    const g  = map.get(eid)!;
    const gt = String(row.gameType || '');
    const num = String(row.number  || '');
    const tl  = String(row.termLabel || row.term || '').trim().toLowerCase();

    if (num) {
      if (gt === 'cash4') { if (!g.cash4Numbers.includes(num)) g.cash4Numbers.push(num); }
      else                { if (!g.cash3Numbers.includes(num)) g.cash3Numbers.push(num); }
    }
    if (tl && num) {
      if (!g.termMap[tl]) g.termMap[tl] = { cash3: [], cash4: [] };
      const b = gt === 'cash4' ? g.termMap[tl].cash4 : g.termMap[tl].cash3;
      if (!b.includes(num)) b.push(num);
    }
    if ((row.activeEnd ?? '') > (g.activeEnd ?? '')) {
      g.activeEnd   = row.activeEnd;
      g.activeStart = row.activeStart;
    }
  }
  return Array.from(map.values());
}

// ─── Boxed family builder ─────────────────────────────────────────────────────

function buildBoxedFamilies(
  windows: WindowRow[],
  today: string,
  fellRows: FellBeforeRow[]
): BoxedFamily[] {
  const active = windows.filter(w => (w.activeEnd ?? '') >= today);

  // Collect all term→number→game pairs from active windows
  type Pair = { term: string; num: string; gt: 'cash3'|'cash4'; dreamer: string; eid: string };
  const pairs: Pair[] = [];
  for (const win of active) {
    for (const [term, payload] of Object.entries(win.termMap)) {
      for (const n of payload.cash3) pairs.push({ term, num: n, gt: 'cash3', dreamer: win.dreamerName, eid: win.dreamEntryId });
      for (const n of payload.cash4) pairs.push({ term, num: n, gt: 'cash4', dreamer: win.dreamerName, eid: win.dreamEntryId });
    }
    // Fallback: unmapped numbers
    for (const n of win.cash3Numbers) {
      if (!pairs.some(p => p.num === n && p.gt === 'cash3' && p.eid === win.dreamEntryId))
        pairs.push({ term: '', num: n, gt: 'cash3', dreamer: win.dreamerName, eid: win.dreamEntryId });
    }
    for (const n of win.cash4Numbers) {
      if (!pairs.some(p => p.num === n && p.gt === 'cash4' && p.eid === win.dreamEntryId))
        pairs.push({ term: '', num: n, gt: 'cash4', dreamer: win.dreamerName, eid: win.dreamEntryId });
    }
  }

  // Build fell-before boxed index: boxedKey::gameType → { states, hitCount }
  const fellBoxed = new Map<string, { states: Set<string>; hitCount: number }>();
  for (const row of fellRows) {
    const num = String(row.number   ?? '').trim();
    const gt  = String(row.gameType ?? '').trim();
    const st  = String(row.state    ?? '').trim();
    if (!num || !st) continue;
    const fbKey = boxedKey(num) + '::' + gt;
    if (!fellBoxed.has(fbKey)) fellBoxed.set(fbKey, { states: new Set(), hitCount: 0 });
    const fe = fellBoxed.get(fbKey)!;
    fe.states.add(st);
    fe.hitCount += Number(row.hitCount ?? 1);
  }

  // Group by boxedKey::gameType
  const familyMap = new Map<string, BoxedFamily>();
  for (const { term, num, gt, dreamer, eid } of pairs) {
    const bk    = boxedKey(num);
    const fKey  = bk + '::' + gt;

    if (!familyMap.has(fKey)) {
      const fell = fellBoxed.get(fKey);
      familyMap.set(fKey, {
        boxedKey:     bk,
        gameType:     gt,
        numbers:      [],
        terms:        [],
        dreamers:     [],
        windowIds:    [],
        fellBefore:   fell ? fell.states.size > 0 : false,
        fellStates:   fell ? Array.from(fell.states).sort() : [],
        fellHitCount: fell?.hitCount ?? 0,
        strength:     0,
      });
    }

    const fam = familyMap.get(fKey)!;
    if (!fam.numbers.includes(num))   fam.numbers.push(num);
    if (term && !fam.terms.includes(term))   fam.terms.push(term);
    if (!fam.dreamers.includes(dreamer))     fam.dreamers.push(dreamer);
    if (!fam.windowIds.includes(eid))        fam.windowIds.push(eid);
  }

  // Compute strength + sort
  return Array.from(familyMap.values())
    .map(f => ({
      ...f,
      numbers: [...f.numbers].sort(),
      strength: f.terms.length * 3 + f.dreamers.length * 2 + (f.fellBefore ? f.fellHitCount : 0),
    }))
    .filter(f => f.terms.length > 0 || f.numbers.length > 0)
    .sort((a, b) => b.strength - a.strength || b.terms.length - a.terms.length);
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

function StateChip({ state }: { state: string }) {
  return (
    <span style={{
      fontFamily: 'system-ui,sans-serif', fontWeight: 800, fontSize: '11px',
      background: 'rgba(96,224,154,0.12)', border: '1px solid rgba(96,224,154,0.26)',
      color: '#60e09a', borderRadius: '7px', padding: '3px 8px', letterSpacing: '0.04em',
    }}>{state}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HotFamiliesPage() {
  const { user } = useAuth();

  const [windowsRaw, setWindowsRaw] = useState<any[]>([]);
  const [fellRows,   setFellRows]   = useState<FellBeforeRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const [familySearch, setFamilySearch] = useState('');
  const [stateSearch,  setStateSearch]  = useState('');
  const [showAll,      setShowAll]      = useState(false);
  const [pinningKey,   setPinningKey]   = useState('');
  const [pinMsg,       setPinMsg]       = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [winRes, fellRes] = await Promise.all([
          fetch(`/api/dreams/windows?ownerUid=${uid}`),
          fetch(`/api/fell-before?ownerUid=${uid}`),
        ]);
        const [winData, fellData] = await Promise.all([winRes.json(), fellRes.json()]);
        if (!winData.ok)  throw new Error(winData.error  || 'Windows load failed.');
        if (!fellData.ok) throw new Error(fellData.error || 'Fell-before load failed.');
        setWindowsRaw(winData.windows  ?? []);
        setFellRows(fellData.rows      ?? []);
      } catch (err) { console.error(err); setError('Could not load Hot Families.'); }
      finally { setLoading(false); }
    }
    void load();
  }, [user]);

  const today   = new Date().toISOString().slice(0, 10);
  const windows = useMemo(() => buildGroupedWindows(windowsRaw), [windowsRaw]);
  const families = useMemo(() => buildBoxedFamilies(windows, today, fellRows), [windows, today, fellRows]);

  // Families with convergence (multiple terms or fell-before)
  const convergent  = useMemo(() => families.filter(f => f.terms.length > 1 || (f.fellBefore && f.terms.length > 0)), [families]);
  const singleTerm  = useMemo(() => families.filter(f => f.terms.length <= 1 && !f.fellBefore), [families]);

  const filtered = useMemo(() => {
    const qf = familySearch.trim();
    const qs = stateSearch.trim().toUpperCase();
    const source = showAll ? families : convergent.length > 0 ? convergent : families;
    return source.filter(f =>
      (!qf || f.boxedKey.includes(qf) || f.numbers.some(n => n.includes(qf))) &&
      (!qs || f.fellStates.some(s => s.includes(qs)))
    );
  }, [families, convergent, showAll, familySearch, stateSearch]);

  // ── Pin a family candidate ─────────────────────────────────────────────────
  async function pinFamily(family: BoxedFamily) {
    if (!user || pinningKey) return;
    const key = family.boxedKey + '::' + family.gameType;
    setPinningKey(key);
    try {
      const res = await fetch('/api/pinned-plays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid:      user.uid,
          number:        family.numbers[0] ?? family.boxedKey,
          gameType:      family.gameType,
          states:        family.fellStates,
          sourceTerms:   family.terms,
          sourceTerm:    family.terms[0] ?? '',
          source:        'hot-families',
          reason:        family.terms.length > 1
            ? `Boxed convergence: ${family.terms.slice(0, 3).join(', ')}`
            : `Active dream term: ${family.terms[0] ?? ''}`,
          boxedKey:      family.boxedKey,
          hitCount:      family.fellHitCount,
          dreamerName:   family.dreamers[0] ?? '',
          evidenceBadges: [
            family.terms.length > 1 ? 'Multi-Term' : 'Active Dream',
            ...(family.fellBefore ? ['Fell Before'] : []),
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

    return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="page-header">
            <h1>Hot Families</h1>
            <p>Boxed-number convergence across active dream terms. Groups where multiple terms map to the same boxed number are highlighted as stronger candidates.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/playlists"    className="btn-secondary">State Playlists</Link>
            <Link href="/intelligence" className="btn-secondary">Intelligence Hub</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {([
          ['Families',    families.length,   '#ff6b4a'],
          ['Convergent',  convergent.length, '#ffcc50'],
          ['Fell Before', families.filter(f=>f.fellBefore).length, '#60e09a'],
          ['Showing',     filtered.length,   '#a090ff'],
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
          <label className="journal-label" htmlFor="familySearch">Filter Family / Number</label>
          <input id="familySearch" className="journal-input" value={familySearch} onChange={e => setFamilySearch(e.target.value)} placeholder="226, 015…" style={{ fontFamily: 'monospace' }} />
        </div>
        <div>
          <label className="journal-label" htmlFor="stateSearch">Filter State</label>
          <input id="stateSearch" className="journal-input" value={stateSearch} onChange={e => setStateSearch(e.target.value)} placeholder="GA, FL…" style={{ textTransform: 'uppercase' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
          <button type="button" onClick={() => setShowAll(v => !v)} className="btn-secondary" style={{ fontSize: '12px', minHeight: '40px' }}>
            {showAll ? 'Show Convergent Only' : 'Show All Families'}
          </button>
        </div>
      </section>

      {loading && <section className="journal-card"><p style={{ margin: 0, color: 'rgba(255,255,255,0.55)' }}>Building hot families…</p></section>}
      {!loading && error && <div style={{ padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>{error}</div>}

      {!loading && !error && families.length === 0 && (
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#a090ff' }}>
            <Flame size={18} />
            <strong>No active families yet</strong>
          </div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.50)', lineHeight: 1.7 }}>
            Hot Families are built from active dream window numbers. Write a dream entry with mapped numbers and they will appear here.
          </p>
        </section>
      )}

      {/* Convergence callout */}
      {!loading && !error && convergent.length > 0 && !showAll && (
        <div style={{ padding: '12px 16px', borderRadius: '16px', background: 'rgba(255,204,80,0.08)', border: '1px solid rgba(255,204,80,0.22)', fontSize: '13px', color: 'rgba(255,255,255,0.70)', lineHeight: 1.65 }}>
          <strong style={{ color: '#ffcc50' }}>{convergent.length} convergent famil{convergent.length !== 1 ? 'ies' : 'y'}</strong>
          {' '}— multiple active terms point to the same boxed number. These are the strongest candidates.
          {singleTerm.length > 0 && <span style={{ color: 'rgba(255,255,255,0.40)' }}> ({singleTerm.length} single-term families hidden — toggle above to show all.)</span>}
        </div>
      )}

      {/* Family cards */}
      {!loading && !error && filtered.length > 0 && (
        <section style={{ display: 'grid', gap: '14px' }}>
          {filtered.map(family => {
            const isStrong = family.terms.length > 1 || family.fellBefore;
            return (
              <article key={`${family.boxedKey}::${family.gameType}`} className="journal-card" style={{
                borderLeft: isStrong
                  ? `3px solid ${family.terms.length > 1 ? '#ffcc50' : '#60e09a'}`
                  : '3px solid rgba(255,255,255,0.08)',
              }}>

                {/* Family header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 900, fontSize: '1.6rem',
                      letterSpacing: '0.10em', color: family.gameType === 'cash3' ? '#ff8a6a' : '#a090ff',
                    }}>{family.boxedKey}</span>
                    <span style={{
                      fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '6px',
                      background: family.gameType === 'cash3' ? 'rgba(255,107,74,0.14)' : 'rgba(160,144,255,0.14)',
                      border: `1px solid ${family.gameType === 'cash3' ? 'rgba(255,107,74,0.28)' : 'rgba(160,144,255,0.28)'}`,
                      color: family.gameType === 'cash3' ? '#ff8a6a' : '#a090ff',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'system-ui,sans-serif',
                    }}>{family.gameType}</span>
                    {family.terms.length > 1 && (
                      <span style={{ padding: '4px 11px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(255,204,80,0.14)', border: '1px solid rgba(255,204,80,0.30)', color: '#ffcc50', fontFamily: 'system-ui,sans-serif' }}>
                        ✦ {family.terms.length} terms converge
                      </span>
                    )}
                    {family.fellBefore && (
                      <span style={{ padding: '4px 11px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(96,224,154,0.14)', border: '1px solid rgba(96,224,154,0.28)', color: '#60e09a', fontFamily: 'system-ui,sans-serif' }}>
                        ✓ Fell Before
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
                    Strength: <strong style={{ color: 'rgba(255,255,255,0.70)' }}>{family.strength}</strong>
                  </div>
                </div>

                {/* Display numbers */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '7px', fontFamily: 'system-ui,sans-serif' }}>
                    Numbers in this family
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {family.numbers.map(n => <NumberChip key={n} n={n} game={family.gameType} />)}
                  </div>
                </div>

                {/* Active terms */}
                {family.terms.filter(Boolean).length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '7px', fontFamily: 'system-ui,sans-serif' }}>
                      Active dream terms
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {family.terms.filter(Boolean).map(t => (
                        <span key={t} style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,107,74,0.12)', border: '1px solid rgba(255,107,74,0.24)', color: '#ff8a6a' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dreamers */}
                {family.dreamers.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '7px', fontFamily: 'system-ui,sans-serif' }}>
                      Dreamers
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {family.dreamers.map(d => (
                        <span key={d} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: 'rgba(160,144,255,0.10)', border: '1px solid rgba(160,144,255,0.20)', color: '#a090ff' }}>{d}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fell-before state evidence */}
                {family.fellBefore && family.fellStates.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#60e09a', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '7px', fontFamily: 'system-ui,sans-serif' }}>
                      Fell before in — {family.fellHitCount} hit{family.fellHitCount !== 1 ? 's' : ''}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {family.fellStates.map(s => <StateChip key={s} state={s} />)}
                    </div>
                  </div>
                )}

                {/* Pin candidate button */}
                {isStrong && (
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {(() => {
                      const key = family.boxedKey + '::' + family.gameType;
                      const msg = pinMsg[key];
                      return msg
                        ? <span style={{ fontSize: '12px', color: '#60e09a', fontWeight: 700 }}>{msg}</span>
                        : <button type="button" onClick={() => pinFamily(family)} disabled={!!pinningKey}
                            style={{ padding: '5px 14px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(255,204,80,0.12)', border: '1px solid rgba(255,204,80,0.28)', color: '#ffcc50', cursor: pinningKey ? 'default' : 'pointer', fontFamily: 'system-ui,sans-serif' }}>
                            {pinningKey === key ? '…' : '★ Suggest Pin'}
                          </button>;
                    })()}
                    <Link href="/pinned-plays" style={{ fontSize: '12px', color: '#a090ff', textDecoration: 'none', fontWeight: 600, marginLeft: 'auto' }}>
                      View Pinned Plays →
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

    </div>
  );
}
