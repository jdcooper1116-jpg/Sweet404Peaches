'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
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
  const [dreamers,  setDreamers]  = useState<DreamerOption[]>([]);
  const [dreamerId, setDreamerId] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Filters
  const [searchTerm,   setSearchTerm]   = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [stateFilter,  setStateFilter]  = useState('');
  const [gameFilter,   setGameFilter]   = useState<'all'|'cash3'|'cash4'>('all');

  useEffect(() => {
    const qd = searchParams.get('dreamerId') ?? '';
    setDreamerId(qd);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/dreamers?ownerUid=${encodeURIComponent(user.uid)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setDreamers(d.dreamers ?? []); })
      .catch(err => console.error('dreamers load:', err));
  }, [user]);

  async function loadRows(did?: string) {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const activeDid = did !== undefined ? did : dreamerId;
      const qs = new URLSearchParams({ ownerUid: user.uid });
      if (activeDid) qs.set('dreamerId', activeDid);
      const res  = await fetch(`/api/fell-before?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load term memory.');
      setRows(Array.isArray(data.rows) ? (data.rows as MappingRow[]) : []);
    } catch (err) {
      console.error(err);
      setError('Could not load As They Fell Before dictionary.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadRows(); }, [user, dreamerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDreamerChange(did: string) { setDreamerId(did); }

  const dictionary = useMemo(() => buildDictionary(rows), [rows]);

  // Collect all states for filter dropdown
  const allStates = useMemo(() => {
    const s = new Set<string>();
    for (const tg of dictionary) for (const ng of tg.numbers) for (const sr of ng.states) s.add(sr.state);
    return Array.from(s).sort();
  }, [dictionary]);

  // Filter by term/number/state/game
  const filtered = useMemo(() => {
    const qt = searchTerm.trim().toLowerCase();
    const qn = searchNumber.trim();
    return dictionary
      .map(tg => {
        if (qt && !tg.term.toLowerCase().includes(qt)) return null;
        const filteredNumbers = tg.numbers
          .map(ng => {
            if (qn && !ng.number.includes(qn)) return null;
            if (gameFilter !== 'all' && ng.gameType !== gameFilter) return null;
            const filteredStates = stateFilter
              ? ng.states.filter(sr => sr.state === stateFilter)
              : ng.states;
            if (!filteredStates.length) return null;
            return { ...ng, states: filteredStates };
          })
          .filter((ng): ng is NonNullable<typeof ng> => ng !== null);
        if (!filteredNumbers.length) return null;
        return { ...tg, numbers: filteredNumbers };
      })
      .filter((tg): tg is NonNullable<typeof tg> => tg !== null);
  }, [dictionary, searchTerm, searchNumber, stateFilter, gameFilter]);

  const letters = useMemo(() => Array.from(new Set(filtered.map(g => g.letter))).sort(), [filtered]);

  const scopeLabel = dreamerId === '' ? 'All Dreamers'
    : dreamerId === 'owner-self' ? 'Owner / Self'
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
              <option value="owner-self">Owner / Self</option>
              {dreamers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="gameFil">Game Type</label>
            <select id="gameFil" className="journal-select" value={gameFilter} onChange={e => setGameFilter(e.target.value as typeof gameFilter)}>
              <option value="all">All Games</option>
              <option value="cash3">Cash 3</option>
              <option value="cash4">Cash 4</option>
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="stateFil">State</label>
            <select id="stateFil" className="journal-select" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
              <option value="">All States</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="termSearch">Search Term</label>
            <input id="termSearch" className="journal-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="driving, sister…" />
          </div>
          <div>
            <label className="journal-label" htmlFor="numSearch">Search Number</label>
            <input id="numSearch" className="journal-input" value={searchNumber} onChange={e => setSearchNumber(e.target.value)} placeholder="856, 089…" style={{ fontFamily: 'monospace' }} />
          </div>
        </div>

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
      {!loading && !error && filtered.length === 0 && (
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#a090ff' }}>
            <BookMarked size={18} />
            <strong>{dictionary.length === 0 ? 'No hit memory yet' : 'No matches for current filters'}</strong>
          </div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.50)', lineHeight: 1.7 }}>
            {dictionary.length === 0
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
