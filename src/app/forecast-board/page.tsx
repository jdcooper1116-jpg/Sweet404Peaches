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
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';

export default function ForecastBoardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PersonalMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termSearch, setTermSearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');

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
        setError('Could not load Forecast Board.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const dictionary = useMemo(() => buildGroupedTermDictionary(rows), [rows]);

  const ranked = useMemo(() => {
    return flattenDictionary(dictionary)
      .map(record => ({
        ...record,
        forecastScore: computeForecastScore(record),
      }))
      .filter(record => {
        const termOk = termSearch.trim()
          ? record.term.toLowerCase().includes(termSearch.trim().toLowerCase())
          : true;

        const stateOk = stateSearch.trim()
          ? record.state.toLowerCase().includes(stateSearch.trim().toLowerCase())
          : true;

        return termOk && stateOk;
      })
      .sort((a, b) => {
        if (b.forecastScore !== a.forecastScore) return b.forecastScore - a.forecastScore;
        if (b.stateStrengthScore !== a.stateStrengthScore) return b.stateStrengthScore - a.stateStrengthScore;
        if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
        return b.lastHitDate.localeCompare(a.lastHitDate);
      });
  }, [dictionary, termSearch, stateSearch]);

  const topStates = useMemo(() => {
    const byState = new Map<string, number>();

    for (const record of ranked) {
      byState.set(record.state, (byState.get(record.state) ?? 0) + record.forecastScore);
    }

    return Array.from(byState.entries())
      .map(([state, score]) => ({ state, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [ranked]);

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
              <h1>Forecast Board</h1>
              <p>
                Historical dream-term memory ranked into actionable state-number recommendations.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/playlists" className="btn-secondary">
                State Playlist
              </Link>
              <Link href="/fell-before" className="btn-secondary">
                As They Fell Before
              </Link>
            </div>
          </div>
        </section>

        <section className="journal-card-flat" style={{ display: 'grid', gap: '16px' }}>
          <div
            style={{
              display: 'grid',
              gap: '16px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            <div>
              <label className="journal-label" htmlFor="termSearch">
                Filter by Term
              </label>
              <input
                id="termSearch"
                className="journal-input"
                value={termSearch}
                onChange={(e) => setTermSearch(e.target.value)}
                placeholder="Ex: dancing"
              />
            </div>

            <div>
              <label className="journal-label" htmlFor="stateSearch">
                Filter by State
              </label>
              <input
                id="stateSearch"
                className="journal-input"
                value={stateSearch}
                onChange={(e) => setStateSearch(e.target.value)}
                placeholder="Ex: Illinois"
              />
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <div className="journal-label">Ranked Recommendations</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{ranked.length}</div>
          </div>

          <div>
            <div className="journal-label">Top State Score</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{topStates[0]?.score ?? 0}</div>
          </div>

          <div>
            <div className="journal-label">Top State</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{topStates[0]?.state ?? '—'}</div>
          </div>
        </section>

        {loading ? <section className="journal-card"><p>Loading forecast board...</p></section> : null}

        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        {topStates.length ? (
          <section className="journal-card">
            <div className="page-header">
              <h1>Top States Right Now</h1>
              <p>States with the strongest cumulative forecast scores from dictionary memory.</p>
            </div>

            <div
              style={{
                display: 'grid',
                gap: '12px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                marginTop: '12px',
              }}
            >
              {topStates.map((item, index) => (
                <div key={item.state} className="journal-card-flat">
                  <div className="journal-label">#{index + 1}</div>
                  <div style={{ fontWeight: 700 }}>{item.state}</div>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Score: {item.score}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && !ranked.length ? (
          <section className="journal-card">
            <p>No forecast recommendations found.</p>
          </section>
        ) : null}

        {ranked.length ? (
          <section style={{ display: 'grid', gap: '16px' }}>
            {ranked.map((record, index) => (
              <section
                key={`${record.term}-${record.number}-${record.state}-${record.gameType}-${record.drawTime}`}
                className="journal-card"
                style={{ display: 'grid', gap: '14px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>
                      #{index + 1} • {record.number} • {record.state}
                    </h2>
                    <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                      Trigger Term: {record.term}
                    </div>
                  </div>

                  <div className="journal-card-flat" style={{ minWidth: '180px' }}>
                    <div className="journal-label">Forecast Score</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>{record.forecastScore}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  }}
                >
                  <div className="journal-card-flat"><div className="journal-label">Game</div><div>{record.gameType}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">Draw</div><div>{record.drawTime}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">Hit Type</div><div>{record.latestHitType}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">Hit Count</div><div>{record.hitCount}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">Straight Count</div><div>{record.straightCount}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">Boxed Count</div><div>{record.boxedCount}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">State Strength</div><div>{record.stateStrengthScore}</div></div>
                  <div className="journal-card-flat"><div className="journal-label">Last Hit</div><div>{record.lastHitDate || '—'}</div></div>
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}
