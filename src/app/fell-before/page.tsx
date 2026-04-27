'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

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
  state:               string;
  gameType:            string;
  drawTime:            string;
  hitCount:            number;
  straightCount:       number;
  boxedCount:          number;
  stateStrengthScore:  number;
  lastHitDate:         string;
  latestHitType:       string;
};

type NumberGroup = { number: string; states: StateRecord[]; totalHits: number };
type TermGroup   = { term: string; letter: string; numbers: NumberGroup[]; totalHits: number };

// ─── Dictionary builder (unchanged logic) ────────────────────────────────────

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
    const tg    = termMap.get(termKey)!;
    const numVal = String(row.number ?? '').trim();
    if (!numVal) continue;

    let ng = tg.numbers.find(n => n.number === numVal);
    if (!ng) { ng = { number: numVal, states: [], totalHits: 0 }; tg.numbers.push(ng); }

    const state    = String(row.state    ?? 'Unknown').trim() || 'Unknown';
    const gameType = String(row.gameType ?? 'unknown').trim() || 'unknown';
    const drawTime = String(row.drawTime ?? 'unknown').trim() || 'unknown';
    const key      = `${state}__${gameType}__${drawTime}`;

    let sr = ng.states.find(s => `${s.state}__${s.gameType}__${s.drawTime}` === key);

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

// ─── Inner page (needs useSearchParams → must be wrapped in Suspense) ─────────

function FellBeforeInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [rows,       setRows]       = useState<MappingRow[]>([]);
  const [dreamers,   setDreamers]   = useState<DreamerOption[]>([]);
  const [dreamerId,  setDreamerId]  = useState('');  // '' = All Dreamers
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');

  // Read ?dreamerId= from URL on mount
  useEffect(() => {
    const qd = searchParams.get('dreamerId') ?? '';
    setDreamerId(qd);
  }, [searchParams]);

  // Load dreamer list for selector
  useEffect(() => {
    if (!user) return;
    fetch(`/api/dreamers?ownerUid=${encodeURIComponent(user.uid)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setDreamers(d.dreamers ?? []); })
      .catch(err => console.error('dreamers load:', err));
  }, [user]);

  // Load personal hit mappings — dreamer-scoped
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
    } finally {
      setLoading(false);
    }
  }

  // Reload when user or dreamerId changes
  useEffect(() => { void loadRows(); }, [user, dreamerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDreamerChange(did: string) {
    setDreamerId(did);
    // loadRows will fire via the useEffect above
  }

  const dictionary  = useMemo(() => buildDictionary(rows), [rows]);
  const filtered    = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? dictionary.filter(g => g.term.toLowerCase().includes(q)) : dictionary;
  }, [dictionary, search]);
  const letters = useMemo(() =>
    Array.from(new Set(filtered.map(g => g.letter))).sort(),
  [filtered]);

  // Human-readable scope label
  const scopeLabel = dreamerId === ''
    ? 'All Dreamers'
    : dreamerId === 'owner-self'
    ? 'Owner / Self'
    : dreamers.find(d => d.id === dreamerId)?.displayName ?? dreamerId;

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

        {/* Header */}
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>As They Fell Before</h1>
              <p>
                Personal hit memory — alphabetised by term. Each dreamer's dictionary is separate.
                {dreamerId
                  ? <strong> Showing: {scopeLabel}</strong>
                  : ' Showing all dreamers combined.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/hits"           className="btn-secondary">Hits Detector</Link>
              <Link href="/forecast-board" className="btn-secondary">Forecast Board</Link>
            </div>
          </div>
        </section>

        {/* Dreamer selector + search */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {/* Dreamer selector */}
            <div>
              <label className="journal-label" htmlFor="dreamerSel">Personal Dictionary</label>
              <select
                id="dreamerSel"
                className="journal-select"
                value={dreamerId}
                onChange={e => handleDreamerChange(e.target.value)}
              >
                <option value="">All Dreamers</option>
                <option value="owner-self">Owner / Self</option>
                {dreamers.map(d => (
                  <option key={d.id} value={d.id}>{d.displayName}</option>
                ))}
              </select>
            </div>

            {/* Term search */}
            <div>
              <label className="journal-label" htmlFor="termSearch">Search Term</label>
              <input
                id="termSearch"
                className="journal-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="driving, sister, traffic…"
              />
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--ink-light)' }}>
            <span><strong style={{ color: 'var(--ink)' }}>{rows.length}</strong> mapping rows</span>
            <span><strong style={{ color: 'var(--ink)' }}>{dictionary.length}</strong> terms</span>
            <span><strong style={{ color: 'var(--ink)' }}>{filtered.length}</strong> shown</span>
            <span>Scope: <strong style={{ color: '#b0b8ff' }}>{scopeLabel}</strong></span>
          </div>

          {/* A–Z jump links */}
          {letters.length > 0 && (
            <div>
              <div className="journal-label">Jump to</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {letters.map(l => (
                  <a
                    key={l}
                    href={`#letter-${l}`}
                    className="btn-secondary"
                    style={{ textDecoration: 'none', padding: '3px 10px', fontSize: '12px' }}
                  >
                    {l}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        {loading && <section className="journal-card"><p>Loading dictionary…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {!loading && filtered.length === 0 && (
          <section className="journal-card">
            <p>
              No term entries for <strong>{scopeLabel}</strong> yet.
              {dreamerId === '' && ' Run a current dream refresh or engine backtest to populate this dictionary.'}
            </p>
          </section>
        )}

        {/* Dictionary A–Z */}
        {letters.map(letter => {
          const letterTerms = filtered.filter(g => g.letter === letter);
          if (!letterTerms.length) return null;

          return (
            <section key={letter} id={`letter-${letter}`} style={{ display: 'grid', gap: '16px' }}>
              <div className="page-header">
                <h1>{letter}</h1>
                <p>{letterTerms.length} term entr{letterTerms.length === 1 ? 'y' : 'ies'}</p>
              </div>

              {letterTerms.map(tg => (
                <section
                  key={tg.term}
                  id={`term-${slugify(tg.term)}`}
                  className="journal-card"
                  style={{ display: 'grid', gap: '18px' }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>{tg.term}</h2>
                    <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                      {tg.numbers.length} number{tg.numbers.length !== 1 ? 's' : ''} tracked · {tg.totalHits} total hit{tg.totalHits !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {tg.numbers.map(ng => (
                    <div key={ng.number} className="journal-card-flat" style={{ display: 'grid', gap: '14px' }}>
                      <div>
                        <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{ng.number}</strong>
                        <span style={{ marginLeft: '12px', color: 'var(--ink-light)', fontSize: '14px' }}>
                          {ng.totalHits} hit{ng.totalHits !== 1 ? 's' : ''} across {ng.states.length} state{ng.states.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gap: '10px' }}>
                        {ng.states.map((sr, idx) => (
                          <div
                            key={`${ng.number}-${sr.state}-${sr.gameType}-${sr.drawTime}`}
                            style={{
                              border: '1px solid rgba(90,52,74,0.12)',
                              borderRadius: '14px', padding: '12px',
                              background: 'rgba(255,255,255,0.04)',
                              borderLeft: `3px solid ${
                                sr.latestHitType === 'straight' ? '#4a7c59'
                                : sr.latestHitType === 'mixed'    ? '#6c78ff'
                                : '#a07c4a'
                              }`,
                            }}
                          >
                            <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', fontSize: '0.83rem' }}>
                              <div><div className="journal-label">Rank / Hits</div><div>{idx + 1} / {sr.hitCount}</div></div>
                              <div><div className="journal-label">State</div><div style={{ fontWeight: 700 }}>{sr.state}</div></div>
                              <div><div className="journal-label">Game</div><div>{sr.gameType}</div></div>
                              <div><div className="journal-label">Draw</div><div>{sr.drawTime}</div></div>
                              <div><div className="journal-label">Hit Type</div>
                                <div style={{
                                  color: sr.latestHitType === 'straight' ? '#6dbf8a' : sr.latestHitType === 'mixed' ? '#b0b8ff' : '#d4a95a',
                                  fontWeight: 700,
                                }}>{sr.latestHitType}</div>
                              </div>
                              <div><div className="journal-label">Straight</div><div>{sr.straightCount}</div></div>
                              <div><div className="journal-label">Boxed</div><div>{sr.boxedCount}</div></div>
                              <div><div className="journal-label">Strength</div><div>{sr.stateStrengthScore}</div></div>
                              <div><div className="journal-label">Last Hit</div><div>{sr.lastHitDate || '—'}</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </section>
          );
        })}
      </section>
    </main>
  );
}

// ─── Export wrapped in Suspense (required for useSearchParams) ────────────────

export default function FellBeforePage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr' }}>
        <div />
        <section style={{ padding: '32px' }}>
          <p style={{ color: 'var(--ink-light)' }}>Loading As They Fell Before…</p>
        </section>
      </main>
    }>
      <FellBeforeInner />
    </Suspense>
  );
}
