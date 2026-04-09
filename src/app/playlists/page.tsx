'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listPersonalHitMappings } from '@/lib/firebase/firestore';
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
  const [rows, setRows] = useState<PersonalMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termSearch, setTermSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setLoading(false);
        return;
      }

      try {
        const data = await listPersonalHitMappings(user.uid);
        setRows(data as PersonalMappingRow[]);
      } catch (err) {
        console.error(err);
        setError('Could not load State Playlist.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const dictionary = useMemo(() => buildGroupedTermDictionary(rows), [rows]);

  const filteredTerms = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    if (!q) return dictionary;
    return dictionary.filter(group => group.term.toLowerCase().includes(q));
  }, [dictionary, termSearch]);

  const letters = useMemo(() => {
    return Array.from(new Set(filteredTerms.map(group => group.letter))).sort();
  }, [filteredTerms]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div className="page-header">
              <h1>State Playlist</h1>
              <p>
                Search a term and see the strongest state-specific watch recommendations sourced from your term dictionary.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/fell-before" className="btn-secondary">
                As They Fell Before
              </Link>
              <Link href="/forecast-board" className="btn-secondary">
                Forecast Board
              </Link>
            </div>
          </div>
        </section>

        <section className="journal-card-flat" style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label className="journal-label" htmlFor="termSearch">
              Search Dream Term
            </label>
            <input
              id="termSearch"
              className="journal-input"
              value={termSearch}
              onChange={(e) => setTermSearch(e.target.value)}
              placeholder="Search a term like dancing or man"
            />
          </div>

          <div>
            <div className="journal-label">A–Z Terms</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              {letters.map(letter => (
                <a
                  key={letter}
                  href={`#letter-${letter}`}
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  {letter}
                </a>
              ))}
            </div>
          </div>
        </section>

        {loading ? <section className="journal-card"><p>Loading playlist...</p></section> : null}

        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        {!loading && !filteredTerms.length ? (
          <section className="journal-card"><p>No matching terms found.</p></section>
        ) : null}

        {letters.map(letter => {
          const letterTerms = filteredTerms.filter(group => group.letter === letter);
          if (!letterTerms.length) return null;

          return (
            <section key={letter} id={`letter-${letter}`} style={{ display: 'grid', gap: '16px' }}>
              <div className="page-header">
                <h1>{letter}</h1>
                <p>{letterTerms.length} playlist term entr{letterTerms.length === 1 ? 'y' : 'ies'}</p>
              </div>

              {letterTerms.map(termGroup => {
                const termRecords = flattenDictionary([termGroup])
                  .map(record => ({
                    ...record,
                    forecastScore: computeForecastScore(record),
                  }))
                  .sort((a, b) => b.forecastScore - a.forecastScore);

                const stateGroups: StatePlaylistGroup[] = Array.from(
                  termRecords.reduce((map, record) => {
                    if (!map.has(record.state)) map.set(record.state, []);
                    map.get(record.state)!.push(record);
                    return map;
                  }, new Map<string, Array<TermStateRecord & { forecastScore: number }>>())
                )
                  .map(([state, records]) => ({
                    state,
                    records: records.sort((a, b) => b.forecastScore - a.forecastScore),
                  }))
                  .sort((a, b) => (b.records[0]?.forecastScore ?? 0) - (a.records[0]?.forecastScore ?? 0));

                return (
                  <section
                    key={termGroup.term}
                    id={`term-${slugify(termGroup.term)}`}
                    className="journal-card"
                    style={{ display: 'grid', gap: '18px' }}
                  >
                    <div>
                      <h2 style={{ margin: 0 }}>{termGroup.term}</h2>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                        {termRecords.length} state recommendation{termRecords.length === 1 ? '' : 's'}
                      </div>
                    </div>

                    {stateGroups.length ? (
                      <div style={{ display: 'grid', gap: '16px' }}>
                        {stateGroups.map(group => (
                          <div key={group.state} className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
                            <div>
                              <strong>{group.state}</strong>
                              <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                                Top numbers for this term in {group.state}
                              </div>
                            </div>

                            <div style={{ display: 'grid', gap: '10px' }}>
                              {group.records.map((record, index) => (
                                <div
                                  key={`${record.term}-${record.number}-${record.state}-${record.gameType}-${record.drawTime}`}
                                  style={{
                                    border: '1px solid rgba(90, 52, 74, 0.12)',
                                    borderRadius: '16px',
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.5)',
                                    display: 'grid',
                                    gap: '8px',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'grid',
                                      gap: '8px',
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                    }}
                                  >
                                    <div><div className="journal-label">Rank</div><div>{index + 1}</div></div>
                                    <div><div className="journal-label">Number</div><div>{record.number}</div></div>
                                    <div><div className="journal-label">Game</div><div>{record.gameType}</div></div>
                                    <div><div className="journal-label">Draw</div><div>{record.drawTime}</div></div>
                                    <div><div className="journal-label">Hit Type</div><div>{record.latestHitType}</div></div>
                                    <div><div className="journal-label">Hits</div><div>{record.hitCount}</div></div>
                                    <div><div className="journal-label">State Strength</div><div>{record.stateStrengthScore}</div></div>
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
                      <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
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
