// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listPersonalHitMappings } from '@/lib/firebase/firestore';
import {
  buildGroupedTermDictionary,
  flattenDictionary,
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';

export default function HotFamiliesPage() {
  const { user } = useAuth();
  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [familySearch, setFamilySearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setLoading(false);
        return;
      }

      try {
        const rows = await listPersonalHitMappings(user.uid);
        setMappingRows(rows as PersonalMappingRow[]);
      } catch (err) {
        console.error(err);
        setError('Could not load Hot Families.');
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

  const filteredFamilies = useMemo(() => {
    return familyAnalytics.families.filter((family: any) => {
      const familyOk = familySearch.trim()
        ? family.familyKey.includes(familySearch.trim())
        : true;

      const stateOk = stateSearch.trim()
        ? family.topStates.some((s: any) =>
            s.state.toLowerCase().includes(stateSearch.trim().toLowerCase())
          )
        : true;

      return familyOk && stateOk;
    });
  }, [familyAnalytics, familySearch, stateSearch]);

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
              <h1>Hot Families</h1>
              <p>
                Family intelligence across boxed families, reversals, doubles, triples,
                and double-doubles.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/intelligence" className="btn-secondary">
                Intelligence Hub
              </Link>
              <Link href="/forecast-board" className="btn-secondary">
                Forecast Board
              </Link>
              <Link href="/chat" className="btn-secondary">
                Intelligence Chat
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
            <label className="journal-label" htmlFor="familySearch">
              Filter by Family Key
            </label>
            <input
              id="familySearch"
              className="journal-input"
              value={familySearch}
              onChange={(e) => setFamilySearch(e.target.value)}
              placeholder="Ex: 058"
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
            <div className="journal-label">Families</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{familyAnalytics.families.length}</div>
          </div>
          <div>
            <div className="journal-label">Doubles</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{familyAnalytics.doubles.length}</div>
          </div>
          <div>
            <div className="journal-label">Triples</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{familyAnalytics.triples.length}</div>
          </div>
          <div>
            <div className="journal-label">Double-Doubles</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{familyAnalytics.doubleDoubles.length}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading Hot Families...</p>
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

        <section className="journal-card">
          <div className="page-header">
            <h1>Top Families</h1>
            <p>Ranked by accumulated strength, hits, and state support.</p>
          </div>

          {filteredFamilies.length ? (
            <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
              {filteredFamilies.slice(0, 20).map((family: any) => (
                <div key={family.familyKey} className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <div><strong>Family:</strong> {family.familyKey}</div>
                    <div><strong>Pattern:</strong> {family.patternTag}</div>
                    <div><strong>Hits:</strong> {family.totalHits}</div>
                    <div><strong>Strength:</strong> {family.totalStrength}</div>
                    <div><strong>Straight:</strong> {family.straightHits}</div>
                    <div><strong>Boxed:</strong> {family.boxedHits}</div>
                    <div><strong>States:</strong> {family.stateCount}</div>
                    <div><strong>Terms:</strong> {family.termCount}</div>
                  </div>

                  <div style={{ color: 'var(--ink-light)' }}>
                    <strong>Sample Numbers:</strong> {family.sampleNumbers.join(', ')}
                  </div>

                  <div style={{ color: 'var(--ink-light)' }}>
                    <strong>Reversals:</strong> {family.reversals.join(', ')}
                  </div>

                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <div>
                      <strong>Top States</strong>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                        {family.topStates.slice(0, 4).map((s: any) => (
                          <div key={s.state} className="journal-card-flat">
                            {s.state} — hits: {s.hits}, strength: {s.strength}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <strong>Top Terms</strong>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                        {family.topTerms.slice(0, 4).map((t: any) => (
                          <div key={t.term} className="journal-card-flat">
                            {t.term} — hits: {t.hits}, strength: {t.strength}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No family matches found.</p>
          )}
        </section>
      </section>
    </main>
  );
}
