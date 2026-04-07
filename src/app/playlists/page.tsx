'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listDreamers,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import { US_STATES } from '@/lib/types';

type RankedNumber = {
  number: string;
  gameType: 'cash3' | 'cash4';
  hitType: 'straight' | 'boxed';
  hitCount: number;
  states: string[];
};

type TermPlaylistGroup = {
  termLabel: string;
  totalHits: number;
  rankedNumbers: RankedNumber[];
};

type PlaylistRow = {
  state: string;
  numbers: string[];
  terms: string[];
  score: number;
  hitCount: number;
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function PlaylistsPage() {
  const { user, loading } = useAuth();
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState('GA');
  const [dreamerFilter, setDreamerFilter] = useState('ALL');
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreamers([]);
        setMemory([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [dreamerRows, memoryRows] = await Promise.all([
          listDreamers(user.uid),
          listPersonalHitMappings(user.uid),
        ]);

        setDreamers(dreamerRows);
        setMemory(memoryRows);
      } catch (err) {
        console.error(err);
        setError('Could not load state playlists.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredMemory = useMemo(() => {
    return dreamerFilter === 'ALL'
      ? memory
      : memory.filter((row: any) => row.dreamerName === dreamerFilter);
  }, [memory, dreamerFilter]);

  const playlistMap = useMemo(() => {
    const map = new Map<string, PlaylistRow>();

    for (const state of US_STATES) {
      map.set(state, {
        state,
        numbers: [],
        terms: [],
        score: 0,
        hitCount: 0,
      });
    }

    for (const row of filteredMemory) {
      if (!map.has(row.state)) continue;
      const item = map.get(row.state)!;
      item.numbers.push(row.number);
      item.terms.push(row.termLabel);
      item.hitCount += row.hitCount || 0;
    }

    for (const item of map.values()) {
      item.numbers = unique(item.numbers).sort();
      item.terms = unique(item.terms).sort();
      item.score = item.hitCount * 10 + item.numbers.length * 4 + item.terms.length * 3;
    }

    return map;
  }, [filteredMemory]);

  const rankedStates = useMemo(() => {
    return Array.from(playlistMap.values())
      .filter(item => item.hitCount > 0 || item.numbers.length > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.state.localeCompare(b.state);
      });
  }, [playlistMap]);

  const selected = playlistMap.get(selectedState);

  const groupedTerms = useMemo<TermPlaylistGroup[]>(() => {
    const stateRows = filteredMemory.filter((row: any) => row.state === selectedState);

    const termMap = new Map<string, any[]>();

    for (const row of stateRows) {
      if (!termMap.has(row.termLabel)) {
        termMap.set(row.termLabel, []);
      }
      termMap.get(row.termLabel)!.push(row);
    }

    return Array.from(termMap.entries())
      .map(([termLabel, rows]) => {
        const numberMap = new Map<string, RankedNumber>();

        for (const row of rows) {
          const key = `${row.number}__${row.gameType}__${row.hitType}`;

          if (!numberMap.has(key)) {
            numberMap.set(key, {
              number: row.number,
              gameType: row.gameType,
              hitType: row.hitType,
              hitCount: 0,
              states: [],
            });
          }

          const item = numberMap.get(key)!;
          item.hitCount += row.hitCount || 0;
          item.states.push(row.state);
        }

        const rankedNumbers = Array.from(numberMap.values())
          .map(item => ({
            ...item,
            states: unique(item.states).sort(),
          }))
          .sort((a, b) => {
            if (a.hitCount !== b.hitCount) return b.hitCount - a.hitCount;
            if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
            return a.number.localeCompare(b.number);
          });

        return {
          termLabel,
          totalHits: rows.reduce((sum: number, row: any) => sum + (row.hitCount || 0), 0),
          rankedNumbers,
        };
      })
      .sort((a, b) => {
        if (a.totalHits !== b.totalHits) return b.totalHits - a.totalHits;
        return a.termLabel.localeCompare(b.termLabel);
      });
  }, [filteredMemory, selectedState]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
      }}
    >
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>State Specific Playlists</h1>
            <p>
              Built from proven hit history only. Ranked by term, then by number hit count inside each state.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading playlists...</p>
          </section>
        ) : error ? (
          <section className="journal-card" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div>
                  <label className="journal-label">Dreamer Filter</label>
                  <select className="journal-select" value={dreamerFilter} onChange={e => setDreamerFilter(e.target.value)}>
                    <option value="ALL">All Dreamers</option>
                    {dreamers.map((dreamer: any) => (
                      <option key={dreamer.id} value={dreamer.displayName}>
                        {dreamer.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="journal-label">State</label>
                  <select className="journal-select" value={selectedState} onChange={e => setSelectedState(e.target.value)}>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="journal-card-flat">
                  <div className="journal-label">Visible Term Groups</div>
                  <div>{groupedTerms.length}</div>
                </div>
              </div>
            </section>

            {selected ? (
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--deep-plum)' }}>
                  <MapPinned size={18} />
                  <strong style={{ fontSize: '22px' }}>{selected.state} Proven Playlist</strong>
                </div>

                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                  <div className="journal-card-flat">
                    <div className="journal-label">Hit Count</div>
                    <div>{selected.hitCount}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Playlist Score</div>
                    <div>{selected.score}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Unique Numbers</div>
                    <div>{selected.numbers.length}</div>
                  </div>
                </div>
              </section>
            ) : null}

            {groupedTerms.length === 0 ? (
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
                  <Sparkles size={18} />
                  <strong>No proven term groups for this state</strong>
                </div>
                <p style={{ margin: 0, color: 'var(--ink-light)' }}>
                  Add or save more proven hits to build term-based state playlists.
                </p>
              </section>
            ) : (
              <section style={{ display: 'grid', gap: '18px' }}>
                {groupedTerms.map(group => (
                  <article key={`${selectedState}-${group.termLabel}`} className="journal-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '20px', marginBottom: '8px' }}>
                          {group.termLabel}
                        </div>
                        <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                          Total proven hits for term in {selectedState}: {group.totalHits}
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                        <div className="journal-label">Ranked Numbers</div>
                        <div style={{ fontSize: '28px', color: 'var(--deep-plum)', fontWeight: 700 }}>
                          {group.rankedNumbers.length}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                      {group.rankedNumbers.map((item, index) => (
                        <div key={`${group.termLabel}-${item.number}-${item.gameType}-${item.hitType}`} className="journal-card-flat">
                          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                            <div>
                              <div className="journal-label">Rank</div>
                              <div>#{index + 1}</div>
                            </div>

                            <div>
                              <div className="journal-label">Number</div>
                              <div>{item.number}</div>
                            </div>

                            <div>
                              <div className="journal-label">Game</div>
                              <div>{item.gameType}</div>
                            </div>

                            <div>
                              <div className="journal-label">Hit Type</div>
                              <div>{item.hitType}</div>
                            </div>

                            <div>
                              <div className="journal-label">Hit Count</div>
                              <div>{item.hitCount}</div>
                            </div>

                            <div>
                              <div className="journal-label">States Seen</div>
                              <div>{item.states.join(', ')}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            )}

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Ranked States From Proven Hit History</strong>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {rankedStates.length ? rankedStates.map(item => (
                  <div key={item.state} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                      <div>
                        <div className="journal-label">State</div>
                        <div>{item.state}</div>
                      </div>
                      <div>
                        <div className="journal-label">Hit Count</div>
                        <div>{item.hitCount}</div>
                      </div>
                      <div>
                        <div className="journal-label">Numbers</div>
                        <div>{item.numbers.length}</div>
                      </div>
                      <div>
                        <div className="journal-label">Score</div>
                        <div>{item.score}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    No proven state playlists yet.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
