// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  listSafeBacktestSummariesForDreams,
  listBacktestDreams,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import {
  buildGroupedTermDictionary,
  flattenDictionary,
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';

export default function IntelligenceHubPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termSearch, setTermSearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setBacktestSummaries([]);
        setLoading(false);
        return;
      }

      try {
        const liveMappings = await listPersonalHitMappings(user.uid);
        const dreams = await listBacktestDreams(user.uid);

        const summaries = await listSafeBacktestSummariesForDreams(
          user.uid,
          dreams
        );

        setMappingRows(liveMappings as PersonalMappingRow[]);
        setBacktestSummaries(summaries.filter(Boolean));
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const flat = useMemo(() => {
    const grouped = buildGroupedTermDictionary(mappingRows);
    return flattenDictionary(grouped);
  }, [mappingRows]);

  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);

  const filteredRecords = useMemo(() => {
    return flat.filter((record: any) => {
      const termOk = termSearch.trim()
        ? record.term.toLowerCase().includes(termSearch.trim().toLowerCase())
        : true;

      const stateOk = stateSearch.trim()
        ? record.state.toLowerCase().includes(stateSearch.trim().toLowerCase())
        : true;

      return termOk && stateOk;
    });
  }, [flat, termSearch, stateSearch]);

  const topTerms = useMemo(() => {
    const map = new Map();

    for (const row of filteredRecords) {
      if (!map.has(row.term)) {
        map.set(row.term, { hits: 0, states: new Set(), straight: 0, boxed: 0 });
      }
      const current = map.get(row.term);
      current.hits += row.hitCount;
      current.states.add(row.state);
      current.straight += row.straightCount;
      current.boxed += row.boxedCount;
    }

    return Array.from(map.entries())
      .map(([term, value]: any) => ({
        term,
        hits: value.hits,
        stateCount: value.states.size,
        straight: value.straight,
        boxed: value.boxed,
      }))
      .sort((a: any, b: any) => b.hits - a.hits)
      .slice(0, 12);
  }, [filteredRecords]);

  const topStates = useMemo(() => {
    const map = new Map();

    for (const row of filteredRecords) {
      if (!map.has(row.state)) {
        map.set(row.state, { hits: 0, strength: 0 });
      }
      const current = map.get(row.state);
      current.hits += row.hitCount;
      current.strength += row.stateStrengthScore;
    }

    return Array.from(map.entries())
      .map(([state, value]: any) => ({
        state,
        hits: value.hits,
        strength: value.strength,
      }))
      .sort((a: any, b: any) => b.strength - a.strength)
      .slice(0, 12);
  }, [filteredRecords]);

  const archiveTotals = useMemo(() => {
    return backtestSummaries.reduce(
      (acc: any, row: any) => {
        acc.completed += 1;
        acc.totalHits += Number(row.totalHits ?? 0);
        acc.straight += Number(row.straightHits ?? 0);
        acc.boxed += Number(row.boxedHits ?? 0);
        return acc;
      },
      { completed: 0, totalHits: 0, straight: 0, boxed: 0 }
    );
  }, [backtestSummaries]);

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
              <h1>Intelligence Hub</h1>
              <p>
                Deep pattern analysis across live dictionary memory, family intelligence,
                and historical backtesting.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/hot-numbers" className="btn-secondary">
                Hot Families
              </Link>
              <Link href="/chat" className="btn-secondary">
                Intelligence Chat
              </Link>
              <Link href="/backtesting/archive" className="btn-secondary">
                Backtest Archive
              </Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
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
            <div className="journal-label">Live Rows</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{filteredRecords.length}</div>
          </div>
          <div>
            <div className="journal-label">Families</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{familyAnalytics.families.length}</div>
          </div>
          <div>
            <div className="journal-label">Completed Backtests</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{archiveTotals.completed}</div>
          </div>
          <div>
            <div className="journal-label">Backtest Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{archiveTotals.totalHits}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Intelligence Hub...</p>
          </section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}
          >
            {error}
          </section>
        ) : null}

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Top Live Terms</h1>
              <p>Most active live terms in the personal dictionary.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {topTerms.length ? topTerms.map((row: any, index: number) => (
                <div key={row.term} className="journal-card-flat">
                  <strong>#{index + 1} {row.term}</strong>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Hits: {row.hits} • States: {row.stateCount} • Straight: {row.straight} • Boxed: {row.boxed}
                  </div>
                </div>
              )) : <p>No live term intelligence yet.</p>}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Top Live States</h1>
              <p>Strongest active states in the personal dictionary.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {topStates.length ? topStates.map((row: any, index: number) => (
                <div key={row.state} className="journal-card-flat">
                  <strong>#{index + 1} {row.state}</strong>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Hits: {row.hits} • Strength: {row.strength}
                  </div>
                </div>
              )) : <p>No live state intelligence yet.</p>}
            </div>
          </section>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Top Families</h1>
              <p>Family clusters ranked by strength and repeated support.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {familyAnalytics.families.slice(0, 10).map((family: any, index: number) => (
                <div key={family.familyKey} className="journal-card-flat">
                  <strong>#{index + 1} {family.familyKey}</strong>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Pattern: {family.patternTag} • Hits: {family.totalHits} • Strength: {family.totalStrength}
                  </div>
                  <div style={{ marginTop: '6px', color: 'var(--ink-light)' }}>
                    Top State: {family.topStates[0]?.state ?? '—'} • Top Term: {family.topTerms[0]?.term ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Pattern Groups</h1>
              <p>Special family categories worth tracking closely.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              <div className="journal-card-flat">
                Doubles: {familyAnalytics.doubles.length}
              </div>
              <div className="journal-card-flat">
                Triples: {familyAnalytics.triples.length}
              </div>
              <div className="journal-card-flat">
                Double-Doubles: {familyAnalytics.doubleDoubles.length}
              </div>
              <div className="journal-card-flat">
                All-Different Families: {familyAnalytics.allDifferent.length}
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
