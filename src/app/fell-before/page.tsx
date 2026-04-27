'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Types (unchanged from original) ─────────────────────────────────────────

type MappingRow = {
  id: string;
  termLabel?: string; number?: string; state?: string;
  gameType?: string; drawTime?: string; drawDate?: string;
  hitType?: string; hitCount?: number; straightCount?: number;
  boxedCount?: number; stateStrengthScore?: number; lastHitDate?: string;
};

type StateRecord = {
  state: string; gameType: string; drawTime: string;
  hitCount: number; straightCount: number; boxedCount: number;
  stateStrengthScore: number; lastHitDate: string; latestHitType: string;
};

type NumberGroup = { number: string; states: StateRecord[]; totalHits: number; };
type TermGroup   = { term: string; letter: string; numbers: NumberGroup[]; totalHits: number; };

function normalizeTermLabel(term: string) {
  const cleaned = term.trim();
  if (cleaned === 'direct-cash3' || cleaned === 'direct-cash4') return 'Unmapped Direct Numbers';
  return cleaned;
}
function termLetter(term: string) {
  const ch = term.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
}
function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildDictionary(rows: MappingRow[]): TermGroup[] {
  const termMap = new Map<string, TermGroup>();
  for (const row of rows) {
    const rawTerm = String(row.termLabel ?? '').trim();
    if (!rawTerm) continue;
    const term    = normalizeTermLabel(rawTerm);
    const termKey = term.toLowerCase();
    if (!termMap.has(termKey)) termMap.set(termKey, { term, letter: termLetter(term), numbers: [], totalHits: 0 });
    const termGroup   = termMap.get(termKey)!;
    const numberValue = String(row.number ?? '').trim();
    if (!numberValue) continue;
    let numberGroup = termGroup.numbers.find(n => n.number === numberValue);
    if (!numberGroup) { numberGroup = { number: numberValue, states: [], totalHits: 0 }; termGroup.numbers.push(numberGroup); }
    const state    = String(row.state    ?? 'Unknown').trim() || 'Unknown';
    const gameType = String(row.gameType ?? 'unknown').trim() || 'unknown';
    const drawTime = String(row.drawTime ?? 'unknown').trim() || 'unknown';
    const key      = `${state}__${gameType}__${drawTime}`;
    let stateRecord = numberGroup.states.find(s => `${s.state}__${s.gameType}__${s.drawTime}` === key);
    const hitCount         = Number(row.hitCount ?? 1);
    const straightCount    = row.straightCount    !== undefined ? Number(row.straightCount)    : row.hitType === 'straight' ? hitCount : 0;
    const boxedCount       = row.boxedCount       !== undefined ? Number(row.boxedCount)       : row.hitType === 'boxed'    ? hitCount : 0;
    const stateStrengthScore = row.stateStrengthScore !== undefined ? Number(row.stateStrengthScore) : straightCount * 3 + boxedCount;
    const lastHitDate      = String(row.lastHitDate ?? row.drawDate ?? '').trim();
    const latestHitType    = straightCount > 0 && boxedCount > 0 ? 'mixed' : straightCount > 0 ? 'straight' : 'boxed';
    if (!stateRecord) {
      stateRecord = { state, gameType, drawTime, hitCount, straightCount, boxedCount, stateStrengthScore, lastHitDate, latestHitType };
      numberGroup.states.push(stateRecord);
    } else {
      stateRecord.hitCount         += hitCount;
      stateRecord.straightCount    += straightCount;
      stateRecord.boxedCount       += boxedCount;
      stateRecord.stateStrengthScore += stateStrengthScore;
      if (lastHitDate > stateRecord.lastHitDate) stateRecord.lastHitDate = lastHitDate;
      stateRecord.latestHitType = stateRecord.straightCount > 0 && stateRecord.boxedCount > 0 ? 'mixed' : stateRecord.straightCount > 0 ? 'straight' : 'boxed';
    }
    termGroup.totalHits += hitCount;
  }
  const groups = Array.from(termMap.values());
  for (const tg of groups) {
    for (const ng of tg.numbers) {
      ng.states.sort((a, b) => b.stateStrengthScore - a.stateStrengthScore || b.hitCount - a.hitCount || b.lastHitDate.localeCompare(a.lastHitDate));
      ng.totalHits = ng.states.reduce((s, r) => s + r.hitCount, 0);
    }
    tg.numbers.sort((a, b) => b.totalHits - a.totalHits || a.number.localeCompare(b.number, undefined, { numeric: true }));
  }
  return groups.sort((a, b) => a.term.localeCompare(b.term));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FellBeforePage() {
  const { user } = useAuth();
  const [rows,    setRows]    = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setRows([]); setLoading(false); return; }
      try {
        // Server-side read — avoids client Firestore "offline" issues.
        const res  = await fetch(`/api/fell-before?ownerUid=${encodeURIComponent(user.uid)}`);
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
    void load();
  }, [user]);

  const dictionary = useMemo(() => buildDictionary(rows), [rows]);
  const filtered   = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? dictionary.filter(g => g.term.toLowerCase().includes(q)) : dictionary;
  }, [dictionary, search]);
  const letters = useMemo(() => Array.from(new Set(filtered.map(g => g.letter))).sort(), [filtered]);

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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>As They Fell Before</h1>
              <p>Alphabetized term dictionary. Each term records the numbers that have historically hit, by state and draw.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/hits"           className="btn-secondary">Hits Detector</Link>
              <Link href="/forecast-board" className="btn-secondary">Forecast Board</Link>
            </div>
          </div>
        </section>

        <section className="journal-card-flat" style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label className="journal-label" htmlFor="termSearch">Search Term</label>
            <input id="termSearch" className="journal-input" value={search}
              onChange={e => setSearch(e.target.value)} placeholder="driving, sister, traffic…" />
          </div>
          {letters.length > 0 && (
            <div>
              <div className="journal-label">A–Z</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {letters.map(l => <a key={l} href={`#letter-${l}`} className="btn-secondary" style={{ textDecoration: 'none', padding: '4px 10px', fontSize: '0.8rem' }}>{l}</a>)}
              </div>
            </div>
          )}
        </section>

        {loading && <section className="journal-card"><p>Loading dictionary…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}
        {!loading && !filtered.length && (
          <section className="journal-card">
            <p>No term entries yet. Run an engine backtest from <Link href="/backtesting/intake" style={{ color: '#b0b8ff' }}>Historical Dream Intake</Link> to populate this dictionary.</p>
          </section>
        )}

        {letters.map(letter => {
          const letterTerms = filtered.filter(g => g.letter === letter);
          if (!letterTerms.length) return null;
          return (
            <section key={letter} id={`letter-${letter}`} style={{ display: 'grid', gap: '16px' }}>
              <div className="page-header">
                <h1>{letter}</h1>
                <p>{letterTerms.length} term entr{letterTerms.length === 1 ? 'y' : 'ies'}</p>
              </div>
              {letterTerms.map(termGroup => (
                <section key={termGroup.term} id={`term-${slugify(termGroup.term)}`}
                  className="journal-card" style={{ display: 'grid', gap: '18px' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{termGroup.term}</h2>
                    <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                      {termGroup.numbers.length} number{termGroup.numbers.length !== 1 ? 's' : ''} tracked · {termGroup.totalHits} total hit{termGroup.totalHits !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {termGroup.numbers.map(ng => (
                    <div key={ng.number} className="journal-card-flat" style={{ display: 'grid', gap: '14px' }}>
                      <div>
                        <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{ng.number}</strong>
                        <span style={{ marginLeft: '12px', color: 'var(--ink-light)', fontSize: '14px' }}>
                          {ng.totalHits} hit{ng.totalHits !== 1 ? 's' : ''} across {ng.states.length} state{ng.states.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {ng.states.map((sr, idx) => (
                          <div key={`${ng.number}-${sr.state}-${sr.gameType}-${sr.drawTime}`}
                            style={{
                              border: '1px solid rgba(90,52,74,0.12)', borderRadius: '14px', padding: '12px',
                              background: 'rgba(255,255,255,0.04)',
                              borderLeft: `3px solid ${sr.latestHitType === 'straight' ? '#4a7c59' : sr.latestHitType === 'mixed' ? '#6c78ff' : '#a07c4a'}`,
                            }}>
                            <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', fontSize: '0.83rem' }}>
                              <div><div className="journal-label">Rank / Hits</div><div>{idx + 1} / {sr.hitCount}</div></div>
                              <div><div className="journal-label">State</div><div style={{ fontWeight: 700 }}>{sr.state}</div></div>
                              <div><div className="journal-label">Game</div><div>{sr.gameType}</div></div>
                              <div><div className="journal-label">Draw</div><div>{sr.drawTime}</div></div>
                              <div><div className="journal-label">Hit Type</div><div style={{ color: sr.latestHitType === 'straight' ? '#6dbf8a' : sr.latestHitType === 'mixed' ? '#b0b8ff' : '#d4a95a', fontWeight: 700 }}>{sr.latestHitType}</div></div>
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
