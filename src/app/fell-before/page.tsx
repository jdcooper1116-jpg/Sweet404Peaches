'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listPersonalHitMappings } from '@/lib/firebase/firestore';

type MappingRow = {
  id: string;
  termLabel?: string;
  number?: string;
  state?: string;
  gameType?: 'cash3' | 'cash4';
  drawTime?: string;
  drawDate?: string;
  hitType?: 'straight' | 'boxed';
  hitCount?: number;
  straightCount?: number;
  boxedCount?: number;
  stateStrengthScore?: number;
  lastHitDate?: string;
};

type StateRecord = {
  state: string;
  gameType: string;
  drawTime: string;
  hitCount: number;
  straightCount: number;
  boxedCount: number;
  stateStrengthScore: number;
  lastHitDate: string;
  latestHitType: string;
};

type NumberGroup = {
  number: string;
  states: StateRecord[];
  totalHits: number;
};

type TermGroup = {
  term: string;
  letter: string;
  numbers: NumberGroup[];
  totalHits: number;
};

function normalizeTermLabel(term: string) {
  const cleaned = term.trim();
  if (cleaned === 'direct-cash3' || cleaned === 'direct-cash4') {
    return 'Unmapped Direct Numbers';
  }
  return cleaned;
}

function termLetter(term: string) {
  const ch = term.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sortTerms(a: TermGroup, b: TermGroup) {
  return a.term.localeCompare(b.term);
}

function sortNumberStrings(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function buildDictionary(rows: MappingRow[]): TermGroup[] {
  const termMap = new Map<string, TermGroup>();

  for (const row of rows) {
    const rawTerm = String(row.termLabel ?? '').trim();
    if (!rawTerm) continue;

    const term = normalizeTermLabel(rawTerm);
    const termKey = term.toLowerCase();

    if (!termMap.has(termKey)) {
      termMap.set(termKey, {
        term,
        letter: termLetter(term),
        numbers: [],
        totalHits: 0,
      });
    }

    const termGroup = termMap.get(termKey)!;
    const numberValue = String(row.number ?? '').trim();
    if (!numberValue) continue;

    let numberGroup = termGroup.numbers.find(n => n.number === numberValue);
    if (!numberGroup) {
      numberGroup = {
        number: numberValue,
        states: [],
        totalHits: 0,
      };
      termGroup.numbers.push(numberGroup);
    }

    const state = String(row.state ?? 'Unknown').trim() || 'Unknown';
    const gameType = String(row.gameType ?? 'unknown').trim() || 'unknown';
    const drawTime = String(row.drawTime ?? 'unknown').trim() || 'unknown';
    const key = `${state}__${gameType}__${drawTime}`;

    let stateRecord = numberGroup.states.find(
      s => `${s.state}__${s.gameType}__${s.drawTime}` === key
    );

    const hitCount = Number(row.hitCount ?? 1);
    const straightCount =
      row.straightCount !== undefined
        ? Number(row.straightCount)
        : row.hitType === 'straight'
          ? hitCount
          : 0;

    const boxedCount =
      row.boxedCount !== undefined
        ? Number(row.boxedCount)
        : row.hitType === 'boxed'
          ? hitCount
          : 0;

    const stateStrengthScore =
      row.stateStrengthScore !== undefined
        ? Number(row.stateStrengthScore)
        : straightCount * 3 + boxedCount;

    const lastHitDate = String(row.lastHitDate ?? row.drawDate ?? '').trim();
    const latestHitType =
      straightCount > 0 && boxedCount > 0
        ? 'mixed'
        : straightCount > 0
          ? 'straight'
          : 'boxed';

    if (!stateRecord) {
      stateRecord = {
        state,
        gameType,
        drawTime,
        hitCount,
        straightCount,
        boxedCount,
        stateStrengthScore,
        lastHitDate,
        latestHitType,
      };
      numberGroup.states.push(stateRecord);
    } else {
      stateRecord.hitCount += hitCount;
      stateRecord.straightCount += straightCount;
      stateRecord.boxedCount += boxedCount;
      stateRecord.stateStrengthScore += stateStrengthScore;
      if (lastHitDate > stateRecord.lastHitDate) {
        stateRecord.lastHitDate = lastHitDate;
      }
      stateRecord.latestHitType =
        stateRecord.straightCount > 0 && stateRecord.boxedCount > 0
          ? 'mixed'
          : stateRecord.straightCount > 0
            ? 'straight'
            : 'boxed';
    }

    termGroup.totalHits += hitCount;
  }

  const groups = Array.from(termMap.values());

  for (const termGroup of groups) {
    for (const numberGroup of termGroup.numbers) {
      numberGroup.states.sort((a, b) => {
        if (b.stateStrengthScore !== a.stateStrengthScore) {
          return b.stateStrengthScore - a.stateStrengthScore;
        }
        if (b.hitCount !== a.hitCount) {
          return b.hitCount - a.hitCount;
        }
        return b.lastHitDate.localeCompare(a.lastHitDate);
      });

      numberGroup.totalHits = numberGroup.states.reduce((sum, s) => sum + s.hitCount, 0);
    }

    termGroup.numbers.sort((a, b) => {
      if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits;
      return sortNumberStrings(a.number, b.number);
    });
  }

  groups.sort(sortTerms);
  return groups;
}

export default function FellBeforePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setLoading(false);
        return;
      }

      try {
        const data = await listPersonalHitMappings(user.uid);
        setRows(data as MappingRow[]);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dictionary;

    return dictionary.filter(group => group.term.toLowerCase().includes(q));
  }, [dictionary, search]);

  const letters = useMemo(() => {
    return Array.from(new Set(filtered.map(group => group.letter))).sort();
  }, [filtered]);

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
              <h1>As They Fell Before</h1>
              <p>
                Your alphabetized term dictionary. Each term keeps one running record of the
                numbers that have hit for that term, the states they hit in, and how strong
                those states have become over time.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/hits" className="btn-secondary">
                Hits Detector
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
              Search Term
            </label>
            <input
              id="termSearch"
              className="journal-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a term like dancing or man"
            />
          </div>

          <div>
            <div className="journal-label">A–Z Table of Contents</div>
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

        {loading ? (
          <section className="journal-card">
            <p>Loading dictionary...</p>
          </section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : null}

        {!loading && !filtered.length ? (
          <section className="journal-card">
            <p>No term entries found.</p>
          </section>
        ) : null}

        {letters.map(letter => {
          const letterTerms = filtered.filter(group => group.letter === letter);
          if (!letterTerms.length) return null;

          return (
            <section key={letter} id={`letter-${letter}`} style={{ display: 'grid', gap: '16px' }}>
              <div className="page-header">
                <h1>{letter}</h1>
                <p>{letterTerms.length} term entr{letterTerms.length === 1 ? 'y' : 'ies'}</p>
              </div>

              {letterTerms.map(termGroup => (
                <section
                  key={termGroup.term}
                  id={`term-${slugify(termGroup.term)}`}
                  className="journal-card"
                  style={{ display: 'grid', gap: '18px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0 }}>{termGroup.term}</h2>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                        Numbers tracked: {termGroup.numbers.length} • Total logged hits: {termGroup.totalHits}
                      </div>
                    </div>
                  </div>

                  {termGroup.numbers.map(numberGroup => (
                    <div key={numberGroup.number} className="journal-card-flat" style={{ display: 'grid', gap: '14px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '16px',
                          flexWrap: 'wrap',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div>
                          <strong>Number: {numberGroup.number}</strong>
                          <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                            Total hits across states: {numberGroup.totalHits}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '12px' }}>
                        {numberGroup.states.map((stateRecord, index) => (
                          <div
                            key={`${numberGroup.number}-${stateRecord.state}-${stateRecord.gameType}-${stateRecord.drawTime}`}
                            style={{
                              border: '1px solid rgba(90, 52, 74, 0.12)',
                              borderRadius: '16px',
                              padding: '14px',
                              background: 'rgba(255,255,255,0.5)',
                              display: 'grid',
                              gap: '10px',
                            }}
                          >
                            <div
                              style={{
                                display: 'grid',
                                gap: '8px',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                              }}
                            >
                              <div>
                                <div className="journal-label">Rank / Hits</div>
                                <div>{index + 1} / {stateRecord.hitCount}</div>
                              </div>

                              <div>
                                <div className="journal-label">State</div>
                                <div>{stateRecord.state}</div>
                              </div>

                              <div>
                                <div className="journal-label">Game</div>
                                <div>{stateRecord.gameType}</div>
                              </div>

                              <div>
                                <div className="journal-label">Draw</div>
                                <div>{stateRecord.drawTime}</div>
                              </div>

                              <div>
                                <div className="journal-label">Hit Type</div>
                                <div>{stateRecord.latestHitType}</div>
                              </div>

                              <div>
                                <div className="journal-label">Straight Count</div>
                                <div>{stateRecord.straightCount}</div>
                              </div>

                              <div>
                                <div className="journal-label">Boxed Count</div>
                                <div>{stateRecord.boxedCount}</div>
                              </div>

                              <div>
                                <div className="journal-label">State Strength</div>
                                <div>{stateRecord.stateStrengthScore}</div>
                              </div>

                              <div>
                                <div className="journal-label">Last Hit Date</div>
                                <div>{stateRecord.lastHitDate || '—'}</div>
                              </div>
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
