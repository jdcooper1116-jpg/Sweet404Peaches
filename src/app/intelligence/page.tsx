'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brain, Pin, Sparkles, Target, Trophy, WandSparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  createPinnedPlay,
  listActiveDreamWindows,
  listDreamEntries,
  listDreamers,
  listPersonalHitMappings,
  listPinnedPlays,
} from '@/lib/firebase/firestore';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';
import {
  buildAutoPinSuggestions,
  buildDreamerReliabilityStats,
  buildDuplicateSignals,
  buildStateWeightStats,
  buildTermStrengthStats,
} from '@/lib/intelligence/scoring';
import { US_STATES } from '@/lib/types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function IntelligencePage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [pins, setPins] = useState<any[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [dreamerScope, setDreamerScope] = useState('ALL');
  const [selectedState, setSelectedState] = useState('GA');
  const [playDate, setPlayDate] = useState(todayIso());
  const [pageLoading, setPageLoading] = useState(true);
  const [pinningKey, setPinningKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setWindows([]);
        setMemory([]);
        setPins([]);
        setDreamers([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [dreamRows, windowRows, memoryRows, pinRows, dreamerRows] = await Promise.all([
          listDreamEntries(user.uid),
          listActiveDreamWindows(user.uid),
          listPersonalHitMappings(user.uid),
          listPinnedPlays(user.uid),
          listDreamers(user.uid),
        ]);

        setDreams(dreamRows);
        setWindows(windowRows);
        setMemory(memoryRows);
        setPins(pinRows);
        setDreamers(dreamerRows);
      } catch (err) {
        console.error(err);
        setError('Could not load Intelligence Hub data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) void load();
  }, [user, loading]);

  const visibleDreamerScopes = useMemo(() => {
    const names = new Set<string>();
    names.add('ALL');
    for (const row of windows) if (row.dreamerName) names.add(row.dreamerName);
    for (const row of dreamers) if (row.displayName) names.add(row.displayName);
    for (const row of pins) if (row.dreamerScope) names.add(row.dreamerScope);
    return Array.from(names).sort();
  }, [windows, dreamers, pins]);

  const filteredWindows = useMemo(() => {
    return dreamerScope === 'ALL'
      ? windows
      : windows.filter((row: any) => row.dreamerName === dreamerScope || row.dreamerId === dreamerScope);
  }, [windows, dreamerScope]);

  const filteredMemory = useMemo(() => {
    return dreamerScope === 'ALL'
      ? memory
      : memory.filter((row: any) => row.dreamerName === dreamerScope || row.dreamerId === dreamerScope);
  }, [memory, dreamerScope]);

  const hotFamilies = useMemo(() => summarizeNumberFamilies(filteredWindows, filteredMemory), [filteredWindows, filteredMemory]);
  const termStrengthRows = useMemo(() => buildTermStrengthStats(filteredMemory), [filteredMemory]);
  const dreamerReliabilityRows = useMemo(() => buildDreamerReliabilityStats(pins), [pins]);
  const stateWeightRows = useMemo(() => buildStateWeightStats(filteredMemory), [filteredMemory]);
  const duplicateSignals = useMemo(() => buildDuplicateSignals(dreams, filteredMemory), [dreams, filteredMemory]);

  const autoPinSuggestions = useMemo(() => {
    return buildAutoPinSuggestions({
      hotFamilies,
      filteredMemory,
      selectedState,
      dreamerScope,
      reliabilityRows: dreamerReliabilityRows,
    });
  }, [hotFamilies, filteredMemory, selectedState, dreamerScope, dreamerReliabilityRows]);

  async function pinSuggestion(row: any) {
    if (!user) return;

    try {
      setPinningKey(row.key);
      setMessage('');
      setError('');

      await createPinnedPlay(user.uid, {
        playDate,
        dreamerScope,
        state: selectedState,
        playType: row.playType,
        label: row.label,
        number: row.number,
        familyKey: row.familyKey,
        gameType: row.gameType,
        score: row.score,
        reasons: row.reasons,
        notes: '',
      });

      setMessage(`Pinned: ${row.label}`);
    } catch (err) {
      console.error(err);
      setError('Could not pin suggestion.');
    } finally {
      setPinningKey('');
    }
  }

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
            <h1>Intelligence Hub</h1>
            <p>
              Final intelligence layer for auto-suggested pins, term strength,
              dreamer reliability, state weighting, and duplicate cleanup signals.
            </p>
          </div>
        </section>

        <section className="journal-card-flat">
          <div
            style={{
              display: 'grid',
              gap: '16px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div>
              <label className="journal-label">Dreamer Scope</label>
              <select className="journal-select" value={dreamerScope} onChange={e => setDreamerScope(e.target.value)}>
                {visibleDreamerScopes.map(scope => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="journal-label">State Focus</label>
              <select className="journal-select" value={selectedState} onChange={e => setSelectedState(e.target.value)}>
                {US_STATES.map(state => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="journal-label">Play Date</label>
              <input type="date" className="journal-input" value={playDate} onChange={e => setPlayDate(e.target.value)} />
            </div>
          </div>
        </section>

        {message ? (
          <div className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </div>
        ) : null}

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading intelligence...</p>
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div><div className="journal-label">Hot Families</div><div>{hotFamilies.length}</div></div>
                <div><div className="journal-label">Auto-Suggest Pins</div><div>{autoPinSuggestions.length}</div></div>
                <div><div className="journal-label">Strong Terms</div><div>{termStrengthRows.length}</div></div>
                <div><div className="journal-label">Duplicate Alerts</div><div>{duplicateSignals.length}</div></div>
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <WandSparkles size={18} />
                <strong>Auto-Suggested Pins</strong>
              </div>

              {autoPinSuggestions.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No auto-pin suggestions in this scope yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {autoPinSuggestions.slice(0, 16).map((row, index) => (
                    <article key={row.key} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '20px', marginBottom: '8px' }}>
                            #{index + 1} — {row.label}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Type: {row.playType} • State: {row.state}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                            {row.number ? `Number: ${row.number}` : `Family: ${row.familyKey || '—'}`}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: '10px' }}>
                          <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                            <div className="journal-label">Score</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {row.score}
                            </div>
                          </div>

                          <button type="button" className="btn-primary" disabled={pinningKey === row.key} onClick={() => pinSuggestion(row)}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Pin size={14} />
                              {pinningKey === row.key ? 'Pinning...' : 'Pin Suggestion'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ marginTop: '12px' }}>
                        <div className="journal-label">Reasons</div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-light)' }}>
                          {row.reasons.map(reason => (
                            <li key={reason} style={{ marginBottom: '6px' }}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Target size={18} />
                <strong>Strongest Terms</strong>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {termStrengthRows.slice(0, 12).map(row => (
                  <div key={row.term} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      <div><div className="journal-label">Term</div><div>{row.term}</div></div>
                      <div><div className="journal-label">Total Hits</div><div>{row.totalHits}</div></div>
                      <div><div className="journal-label">Strongest State</div><div>{row.strongestState}</div></div>
                      <div><div className="journal-label">Unique Numbers</div><div>{row.uniqueNumbers}</div></div>
                      <div><div className="journal-label">Score</div><div>{row.score}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Trophy size={18} />
                <strong>Dreamer Reliability</strong>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {dreamerReliabilityRows.slice(0, 12).map(row => (
                  <div key={row.dreamerScope} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      <div><div className="journal-label">Scope</div><div>{row.dreamerScope}</div></div>
                      <div><div className="journal-label">Pins</div><div>{row.totalPins}</div></div>
                      <div><div className="journal-label">Won</div><div>{row.won}</div></div>
                      <div><div className="journal-label">Win Rate</div><div>{(row.winRate * 100).toFixed(1)}%</div></div>
                      <div><div className="journal-label">Score</div><div>{row.score.toFixed(1)}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Brain size={18} />
                <strong>State Weighting</strong>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {stateWeightRows.slice(0, 12).map(row => (
                  <div key={row.state} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      <div><div className="journal-label">State</div><div>{row.state}</div></div>
                      <div><div className="journal-label">Total Hits</div><div>{row.totalHits}</div></div>
                      <div><div className="journal-label">Unique Terms</div><div>{row.uniqueTerms}</div></div>
                      <div><div className="journal-label">Unique Numbers</div><div>{row.uniqueNumbers}</div></div>
                      <div><div className="journal-label">Score</div><div>{row.score}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Duplicate Cleanup Signals</strong>
              </div>

              {duplicateSignals.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No cleanup alerts detected in this scope.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {duplicateSignals.slice(0, 16).map((row, index) => (
                    <div key={`${row.kind}-${index}-${row.label}`} className="journal-card-flat">
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '8px' }}>
                        {row.label}
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                        {row.detail}
                      </div>
                      <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                        Score: {row.score} • Type: {row.kind}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
