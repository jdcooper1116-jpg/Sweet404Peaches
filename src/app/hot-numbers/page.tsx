// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { buildGroupedTermDictionary, flattenDictionary, type PersonalMappingRow } from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';

export default function HotFamiliesPage() {
  const { user } = useAuth();

  const [mappingRows,  setMappingRows]  = useState<PersonalMappingRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [familySearch, setFamilySearch] = useState('');
  const [stateSearch,  setStateSearch]  = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const res  = await fetch(`/api/fell-before?ownerUid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Load failed.');
        setMappingRows(data.rows ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load Hot Families.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  // Intelligence pipeline — unchanged
  const flat            = useMemo(() => flattenDictionary(buildGroupedTermDictionary(mappingRows)), [mappingRows]);
  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);

  const filteredFamilies = useMemo(() =>
    familyAnalytics.families.filter((f: any) => {
      const fOk = familySearch.trim() ? f.familyKey.includes(familySearch.trim()) : true;
      const sOk = stateSearch.trim()
        ? f.topStates.some((s: any) => s.state.toLowerCase().includes(stateSearch.trim().toLowerCase()))
        : true;
      return fOk && sOk;
    }),
    [familyAnalytics, familySearch, stateSearch]
  );

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Hot Families</h1>
              <p>Family intelligence across boxed families, reversals, doubles, triples, and double-doubles — sourced from confirmed personal hit memory.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/intelligence"  className="btn-secondary">Intelligence Hub</Link>
              <Link href="/forecast-board" className="btn-secondary">Forecast Board</Link>
              <Link href="/chat"          className="btn-secondary">Intelligence Chat</Link>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="familySearch">Filter by Family Key</label>
            <input id="familySearch" className="journal-input" value={familySearch}
              onChange={e => setFamilySearch(e.target.value)} placeholder="e.g. 058" />
          </div>
          <div>
            <label className="journal-label" htmlFor="stateSearch">Filter by State</label>
            <input id="stateSearch" className="journal-input" value={stateSearch}
              onChange={e => setStateSearch(e.target.value)} placeholder="e.g. Georgia" />
          </div>
        </section>

        {/* Summary counts */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            ['Families',       familyAnalytics.families.length],
            ['Doubles',        familyAnalytics.doubles.length],
            ['Triples',        familyAnalytics.triples.length],
            ['Double-Doubles', familyAnalytics.doubleDoubles.length],
            ['Showing',        filteredFamilies.length],
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div className="journal-label">{label}</div>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </section>

        {loading && <section className="journal-card"><p>Loading Hot Families…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {!loading && !error && filteredFamilies.length === 0 && (
          <section className="journal-card">
            <p style={{ color: 'var(--ink-light)', margin: 0 }}>
              {mappingRows.length === 0
                ? 'No hit memory yet. Run a dream refresh or engine backtest to populate families.'
                : 'No families match the current filters.'}
            </p>
          </section>
        )}

        {/* Family cards */}
        <section className="journal-card">
          <div className="page-header"><h1>Top Families</h1><p>Ranked by accumulated strength, hits, and state support.</p></div>
          {filteredFamilies.length > 0 && (
            <div style={{ display: 'grid', gap: '16px', marginTop: '14px' }}>
              {filteredFamilies.slice(0, 20).map((family: any) => (
                <div key={family.familyKey} className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', fontSize: '13px' }}>
                    <div><strong>Family:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{family.familyKey}</span></div>
                    <div><strong>Pattern:</strong> {family.patternTag}</div>
                    <div><strong>Hits:</strong> {family.totalHits}</div>
                    <div><strong>Strength:</strong> {family.totalStrength}</div>
                    <div><strong>Straight:</strong> {family.straightHits}</div>
                    <div><strong>Boxed:</strong> {family.boxedHits}</div>
                    <div><strong>States:</strong> {family.stateCount}</div>
                    <div><strong>Terms:</strong> {family.termCount}</div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-light)' }}>
                    <strong>Sample Numbers:</strong> {family.sampleNumbers?.join(', ') || '—'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-light)' }}>
                    <strong>Reversals:</strong> {family.reversals?.join(', ') || '—'}
                  </div>
                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                    <div>
                      <strong style={{ fontSize: '13px' }}>Top States</strong>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
                        {family.topStates?.slice(0, 4).map((s: any) => (
                          <div key={s.state} className="journal-card-flat" style={{ fontSize: '12px' }}>
                            <strong>{s.state}</strong> — hits: {s.hits}, strength: {s.strength}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <strong style={{ fontSize: '13px' }}>Top Terms</strong>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
                        {family.topTerms?.slice(0, 4).map((t: any) => (
                          <div key={t.term} className="journal-card-flat" style={{ fontSize: '12px' }}>
                            <strong>{t.term}</strong> — hits: {t.hits}, strength: {t.strength}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
    </div>
  );
}
