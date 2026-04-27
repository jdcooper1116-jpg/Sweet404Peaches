'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildGroupedTermDictionary,
  computeForecastScore,
  flattenDictionary,
  slugify,
  type PersonalMappingRow,
  type TermStateRecord,
} from '@/lib/intelligence/termDictionary';

type StatePlaylistGroup = {
  state: string;
  records: Array<TermStateRecord & { forecastScore: number }>;
};

export default function PlaylistsPage() {
  const { user } = useAuth();

  const [rows,    setRows]    = useState<PersonalMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [termSearch, setTermSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const res  = await fetch(`/api/fell-before?ownerUid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Load failed.');
        setRows(data.rows ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load State Playlist.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Intelligence pipeline — unchanged
  const dictionary = useMemo(() => buildGroupedTermDictionary(rows), [rows]);

  const filteredTerms = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    return q ? dictionary.filter(g => g.term.toLowerCase().includes(q)) : dictionary;
  }, [dictionary, termSearch]);

  const letters = useMemo(() =>
    Array.from(new Set(filteredTerms.map(g => g.letter))).sort(),
    [filteredTerms]
  );

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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>State Playlists</h1>
              <p>Search a dream term and see the strongest state-specific watch recommendations sourced from confirmed personal hit memory.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/fell-before"    className="btn-secondary">As They Fell Before</Link>
              <Link href="/forecast-board" className="btn-secondary">Forecast Board</Link>
            </div>
          </div>
        </section>

        {/* Search + A–Z */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label className="journal-label" htmlFor="termSearch">Search Dream Term</label>
            <input id="termSearch" className="journal-input" value={termSearch}
              onChange={e => setTermSearch(e.target.value)}
              placeholder="Search a term like dancing or car" />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ink-light)' }}>
            <span style={{ alignSelf: 'center' }}>{rows.length} memory rows · {filteredTerms.length} terms shown</span>
          </div>
          {letters.length > 0 && (
            <div>
              <div className="journal-label">A–Z Terms</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {letters.map(l => (
                  <a key={l} href={`#letter-${l}`} className="btn-secondary"
                    style={{ textDecoration: 'none', padding: '3px 10px', fontSize: '12px' }}>
                    {l}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        {loading && <section className="journal-card"><p>Loading playlist…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {!loading && !error && filteredTerms.length === 0 && (
          <section className="journal-card">
            <p style={{ color: 'var(--ink-light)', margin: 0 }}>
              {rows.length === 0
                ? 'No hit memory yet. Run a dream refresh to populate the playlist.'
                : 'No terms match the current search.'}
            </p>
          </section>
        )}

        {/* Term playlist sections */}
        {letters.map(letter => {
          const letterTerms = filteredTerms.filter(g => g.letter === letter);
          if (!letterTerms.length) return null;

          return (
            <section key={letter} id={`letter-${letter}`} style={{ display: 'grid', gap: '16px' }}>
              <div className="page-header">
                <h1>{letter}</h1>
                <p>{letterTerms.length} playlist term entr{letterTerms.length === 1 ? 'y' : 'ies'}</p>
              </div>

              {letterTerms.map(termGroup => {
                const termRecords = flattenDictionary([termGroup])
                  .map(r => ({ ...r, forecastScore: computeForecastScore(r) }))
                  .sort((a, b) => b.forecastScore - a.forecastScore);

                const stateGroups: StatePlaylistGroup[] = Array.from(
                  termRecords.reduce((map, r) => {
                    if (!map.has(r.state)) map.set(r.state, []);
                    map.get(r.state)!.push(r);
                    return map;
                  }, new Map<string, any[]>())
                )
                  .map(([state, records]) => ({
                    state,
                    records: records.sort((a: any, b: any) => b.forecastScore - a.forecastScore),
                  }))
                  .sort((a, b) => (b.records[0]?.forecastScore ?? 0) - (a.records[0]?.forecastScore ?? 0));

                return (
                  <section key={termGroup.term} id={`term-${slugify(termGroup.term)}`}
                    className="journal-card" style={{ display: 'grid', gap: '18px' }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{termGroup.term}</h2>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                        {termRecords.length} state recommendation{termRecords.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {stateGroups.length ? (
                      <div style={{ display: 'grid', gap: '16px' }}>
                        {stateGroups.map(group => (
                          <div key={group.state} className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
                            <div>
                              <strong>{group.state}</strong>
                              <div style={{ color: 'var(--ink-light)', fontSize: '13px', marginTop: '4px' }}>
                                Top numbers for {termGroup.term} in {group.state}
                              </div>
                            </div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {group.records.map((record: any, idx: number) => (
                                <div key={`${record.term}-${record.number}-${record.state}-${record.gameType}-${record.drawTime}`}
                                  style={{
                                    border: '1px solid rgba(90,52,74,0.12)', borderRadius: '14px', padding: '12px',
                                    background: 'rgba(255,255,255,0.04)', display: 'grid', gap: '6px',
                                    borderLeft: `3px solid ${record.latestHitType === 'straight' ? '#4a7c59' : record.latestHitType === 'mixed' ? '#6c78ff' : '#a07c4a'}`,
                                  }}>
                                  <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', fontSize: '12.5px' }}>
                                    <div><div className="journal-label">Rank</div><div>{idx + 1}</div></div>
                                    <div><div className="journal-label">Number</div><div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{record.number}</div></div>
                                    <div><div className="journal-label">Game</div><div>{record.gameType}</div></div>
                                    <div><div className="journal-label">Draw</div><div>{record.drawTime}</div></div>
                                    <div><div className="journal-label">Hit Type</div>
                                      <div style={{ color: record.latestHitType === 'straight' ? '#6dbf8a' : record.latestHitType === 'mixed' ? '#b0b8ff' : '#d4a95a', fontWeight: 700 }}>
                                        {record.latestHitType}
                                      </div>
                                    </div>
                                    <div><div className="journal-label">Hits</div><div>{record.hitCount}</div></div>
                                    <div><div className="journal-label">Strength</div><div>{record.stateStrengthScore}</div></div>
                                    <div><div className="journal-label">Forecast Score</div><div>{record.forecastScore}</div></div>
                                    <div><div className="journal-label">Last Hit</div><div>{record.lastHitDate || '—'}</div></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="journal-card-flat" style={{ color: 'var(--ink-light)', fontSize: '13px' }}>
                        No state recommendations for this term yet.
                      </div>
                    )}
                  </section>
                );
              })}
            </section>
          );
        })}
      </section>
    </main>
  );
}
