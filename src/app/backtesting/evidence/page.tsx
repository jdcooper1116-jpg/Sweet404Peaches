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
              <h1>Evidence Rules</h1>
              <p>
                Weighted promotion engine for Universal Dictionary learning,
                Personal Dictionary strengthening, and backtest-to-live boosts.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/archive" className="btn-secondary">
                Backtest Archive
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

        <section className="journal-card-flat">
          <label className="journal-label" htmlFor="termSearch">Filter Candidates</label>
          <input
            id="termSearch"
            className="journal-input"
            value={termSearch}
            onChange={(e) => setTermSearch(e.target.value)}
            placeholder="Ex: dancing, 330, Illinois"
          />
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
            <div className="journal-label">Universal Ready</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{promotionModel.summary.universalReady}</div>
          </div>
          <div>
            <div className="journal-label">Personal Ready</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{promotionModel.summary.personalReady}</div>
          </div>
          <div>
            <div className="journal-label">Backtest State Signals</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{promotionModel.learningSignals.topBacktestStates.length}</div>
          </div>
          <div>
            <div className="journal-label">Backtest Term Signals</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{promotionModel.learningSignals.topBacktestTerms.length}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card"><p>Loading Evidence Rules...</p></section>
        ) : null}

        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Promotion Logic</h1>
            <p>How the app decides what should be strengthened.</p>
          </div>

          <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
            {[
              'Universal Dictionary score = total hits + state spread + straight/boxed weight + repeated backtest term support + family support.',
              'Personal Dictionary score = hit count + straight weight + boxed weight + state strength + repeated backtest state support + recency + family support.',
              'Straight hits are weighted more heavily than boxed hits.',
              'Repeated best-term and best-state backtest signals boost live candidates.',
              'Family memory creates additional promotion support when related boxed families repeat.',
            ].map((item) => (
              <div key={item} className="journal-card-flat">{item}</div>
            ))}
          </div>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Universal Dictionary Candidates</h1>
            <p>Terms most ready to be promoted strongly into universal learning memory.</p>
          </div>

          {filteredTerms.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {filteredTerms.slice(0, 15).map((row: any) => (
                <div key={row.term} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <div><strong>Term:</strong> {row.term}</div>
                    <div><strong>Tier:</strong> {row.promotionTier}</div>
                    <div><strong>Score:</strong> {row.promotionScore}</div>
                    <div><strong>Hits:</strong> {row.totalHits}</div>
                    <div><strong>States:</strong> {row.stateCount}</div>
                    <div><strong>Numbers:</strong> {row.numberCount}</div>
                    <div><strong>Backtest Term Boost:</strong> {row.backtestTermBoost}</div>
                    <div><strong>Family Boost:</strong> {row.familyBoost}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No universal promotion candidates found.</p>
          )}
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Personal Dictionary Candidates</h1>
            <p>State-specific term-number patterns most ready for strong personal promotion.</p>
          </div>

          {filteredCombos.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {filteredCombos.slice(0, 20).map((row: any, index: number) => (
                <div key={`${row.term}-${row.number}-${row.state}-${index}`} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <div><strong>Term:</strong> {row.term}</div>
                    <div><strong>Number:</strong> {row.number}</div>
                    <div><strong>State:</strong> {row.state}</div>
                    <div><strong>Tier:</strong> {row.promotionTier}</div>
                    <div><strong>Score:</strong> {row.promotionScore}</div>
                    <div><strong>Game:</strong> {row.gameType}</div>
                    <div><strong>Backtest State Boost:</strong> {row.backtestStateBoost}</div>
                    <div><strong>Backtest Term Boost:</strong> {row.backtestTermBoost}</div>
                    <div><strong>Family Boost:</strong> {row.familyBoost}</div>
                    <div><strong>Recency Boost:</strong> {row.recencyBoost}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No personal promotion candidates found.</p>
          )}
        </section>
      </section>
    </main>
  );
}
