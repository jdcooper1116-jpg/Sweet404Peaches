// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  listBacktestDreams,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import {
  buildGroupedTermDictionary,
  flattenDictionary,
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { buildEvidencePromotionModel } from '@/lib/intelligence/evidencePromotion';
import PageIntro from '@/components/ui/PageIntro';

export default function BacktestingEvidencePage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termSearch, setTermSearch] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setBacktestSummaries([]);
        setLoading(false);
        return;
      }

      try {
        const [liveMappings, dreams] = await Promise.all([
          listPersonalHitMappings(user.uid),
          listBacktestDreams(user.uid),
        ]);

        const summaries = await Promise.all(
          dreams.map((dream: any) => getBacktestSummaryForDream(user.uid, dream.id))
        );

        setMappingRows(liveMappings as PersonalMappingRow[]);
        setBacktestSummaries(summaries.filter(Boolean));
      } catch (err) {
        console.error(err);
        setError('Could not load Evidence Rules.');
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
  const promotionModel = useMemo(
    () =>
      buildEvidencePromotionModel({
        liveRows: flat,
        backtestSummaries,
        familyAnalytics,
      }),
    [flat, backtestSummaries, familyAnalytics]
  );

  const filteredTerms = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    if (!q) return promotionModel.termCandidates;
    return promotionModel.termCandidates.filter((row: any) =>
      row.term.toLowerCase().includes(q)
    );
  }, [promotionModel.termCandidates, termSearch]);

  const filteredCombos = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    if (!q) return promotionModel.comboCandidates;
    return promotionModel.comboCandidates.filter((row: any) =>
      row.term.toLowerCase().includes(q) ||
      row.number.toLowerCase().includes(q) ||
      row.state.toLowerCase().includes(q)
    );
  }, [promotionModel.comboCandidates, termSearch]);

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
      <section className="panel-grid" style={{ padding: '32px' }}>
        <PageIntro
          title="Evidence Rules"
          description="Weighted promotion engine for Universal Dictionary learning, Personal Dictionary strengthening, and backtest-to-live boosts."
          actions={[
            { href: '/backtesting/archive', label: 'Backtest Archive' },
            { href: '/forecast-board', label: 'Forecast Board' },
            { href: '/chat', label: 'Intelligence Chat' },
          ]}
        />

        <section
          style={{
            display: 'grid',
            gap: '14px',
            gridTemplateColumns: '1.2fr repeat(4, minmax(180px, 1fr))',
          }}
        >
          <div className="journal-card-flat">
            <label className="journal-label" htmlFor="termSearch">Filter Candidates</label>
            <input
              id="termSearch"
              className="journal-input"
              value={termSearch}
              onChange={(e) => setTermSearch(e.target.value)}
              placeholder="Ex: dancing, 330, Illinois"
            />
          </div>
          <div className="stat-tile">
            <div className="stat-label">Universal Ready</div>
            <div className="stat-value">{promotionModel.summary.universalReady}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Personal Ready</div>
            <div className="stat-value">{promotionModel.summary.personalReady}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Backtest States</div>
            <div className="stat-value">{promotionModel.learningSignals.topBacktestStates.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Backtest Terms</div>
            <div className="stat-value">{promotionModel.learningSignals.topBacktestTerms.length}</div>
          </div>
        </section>

        {loading ? <section className="journal-card"><p>Loading Evidence Rules...</p></section> : null}
        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.22)', color: '#fff0f0' }}>
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Promotion Logic</h1>
            <p>How the app decides what should be strengthened.</p>
          </div>

          <div className="metric-row" style={{ marginTop: '14px' }}>
            {[
              'Universal Dictionary score = total hits + state spread + straight/boxed weight + repeated backtest term support + family support.',
              'Personal Dictionary score = hit count + straight weight + boxed weight + state strength + repeated backtest state support + recency + family support.',
              'Straight hits carry more evidentiary weight than boxed hits.',
              'Repeated best-term and best-state backtest signals increase live promotion strength.',
              'Family repetition adds extra support when boxed relatives keep showing up.',
            ].map((item) => (
              <div key={item} className="journal-card-flat surface-accent">{item}</div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Universal Dictionary Candidates</h1>
              <p>Terms strongest for universal promotion.</p>
            </div>

            <div className="metric-row" style={{ marginTop: '14px' }}>
              {filteredTerms.slice(0, 15).map((row: any) => (
                <div key={row.term} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    }}
                  >
                    <div><strong>Term:</strong> {row.term}</div>
                    <div><strong>Tier:</strong> {row.promotionTier}</div>
                    <div><strong>Score:</strong> {row.promotionScore}</div>
                    <div><strong>Hits:</strong> {row.totalHits}</div>
                    <div><strong>States:</strong> {row.stateCount}</div>
                    <div><strong>Numbers:</strong> {row.numberCount}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Personal Dictionary Candidates</h1>
              <p>State-specific combos strongest for personal promotion.</p>
            </div>

            <div className="metric-row" style={{ marginTop: '14px' }}>
              {filteredCombos.slice(0, 20).map((row: any, index: number) => (
                <div key={`${row.term}-${row.number}-${row.state}-${index}`} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    }}
                  >
                    <div><strong>Term:</strong> {row.term}</div>
                    <div><strong>Number:</strong> {row.number}</div>
                    <div><strong>State:</strong> {row.state}</div>
                    <div><strong>Tier:</strong> {row.promotionTier}</div>
                    <div><strong>Score:</strong> {row.promotionScore}</div>
                    <div><strong>Game:</strong> {row.gameType}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
