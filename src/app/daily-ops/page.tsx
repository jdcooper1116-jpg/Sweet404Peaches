'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Download,
  Printer,
  Sparkles,
  Target,
} from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listLotteryResults,
  listPinnedPlays,
  updatePinnedPlay,
} from '@/lib/firebase/firestore';
import { makeFamilyKey } from '@/lib/sync/numberFamilies';

type PinStatus = 'pinned' | 'played' | 'won' | 'archived';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeResultValue(row: any): string {
  return String(row?.normalizedResult || row?.result || '').trim();
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map(row =>
      row
        .map(value => {
          const safe = String(value ?? '');
          if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
            return `"${safe.replace(/"/g, '""')}"`;
          }
          return safe;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DailyOpsPage() {
  const { user, loading } = useAuth();

  const [results, setResults] = useState<any[]>([]);
  const [pins, setPins] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState('');
  const [playDate, setPlayDate] = useState(todayIso());
  const [selectedState, setSelectedState] = useState('GA');
  const [scopeFilter, setScopeFilter] = useState('ALL');

  useEffect(() => {
    async function load() {
      if (!user) {
        setResults([]);
        setPins([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [resultRows, pinRows] = await Promise.all([
          listLotteryResults(user.uid, 1000),
          listPinnedPlays(user.uid),
        ]);

        setResults(resultRows);
        setPins(pinRows);
      } catch (err) {
        console.error(err);
        setError('Could not load Daily Ops data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const visibleScopes = useMemo(() => {
    return unique(pins.map(row => row.dreamerScope || 'ALL')).sort();
  }, [pins]);

  const filteredResults = useMemo(() => {
    return results
      .filter(row => row.date === playDate)
      .filter(row => row.state === selectedState)
      .sort((a, b) => {
        if ((a.gameType || '') !== (b.gameType || '')) {
          return String(a.gameType || '').localeCompare(String(b.gameType || ''));
        }
        return String(a.drawTime || '').localeCompare(String(b.drawTime || ''));
      });
  }, [results, playDate, selectedState]);

  const filteredPins = useMemo(() => {
    return pins
      .filter(row => row.playDate === playDate)
      .filter(row => row.state === selectedState)
      .filter(row => scopeFilter === 'ALL' || row.dreamerScope === scopeFilter)
      .sort((a, b) => {
        if ((a.playType || '') !== (b.playType || '')) {
          return String(a.playType || '').localeCompare(String(b.playType || ''));
        }
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
  }, [pins, playDate, selectedState, scopeFilter]);

  const suggestions = useMemo(() => {
    return filteredPins
      .map(pin => {
        const sameGameResults = filteredResults.filter(
          result => result.gameType === pin.gameType
        );

        const matches = sameGameResults.filter(result => {
          const resultValue = normalizeResultValue(result);
          if (!resultValue) return false;

          if (pin.playType === 'straight' && pin.number) {
            return resultValue === pin.number;
          }

          if (pin.familyKey) {
            return makeFamilyKey(resultValue) === pin.familyKey;
          }

          return false;
        });

        if (!matches.length) return null;

        return {
          pin,
          matches,
          suggestedStatus: 'won' as PinStatus,
          reason:
            pin.playType === 'straight'
              ? 'Exact straight match found in imported results.'
              : 'Matching boxed/family result found in imported results.',
        };
      })
      .filter(Boolean) as Array<{
      pin: any;
      matches: any[];
      suggestedStatus: PinStatus;
      reason: string;
    }>;
  }, [filteredPins, filteredResults]);

  async function refreshPins() {
    if (!user) return;
    const refreshed = await listPinnedPlays(user.uid);
    setPins(refreshed);
  }

  async function applySuggestion(pinId: string, status: PinStatus) {
    try {
      setSavingId(pinId);
      setError('');
      setMessage('');
      await updatePinnedPlay(pinId, { status });
      await refreshPins();
      setMessage('Pinned play outcome updated.');
    } catch (err) {
      console.error(err);
      setError('Could not update pinned play outcome.');
    } finally {
      setSavingId('');
    }
  }

  async function applyAllSuggestions() {
    if (!suggestions.length) return;

    try {
      setSavingId('ALL');
      setError('');
      setMessage('');

      for (const item of suggestions) {
        await updatePinnedPlay(item.pin.id, { status: item.suggestedStatus });
      }

      await refreshPins();
      setMessage(`Applied ${suggestions.length} win suggestion(s).`);
    } catch (err) {
      console.error(err);
      setError('Could not apply all suggestions.');
    } finally {
      setSavingId('');
    }
  }

  function exportPlaySlip() {
    const rows = [
      ['playDate', 'state', 'dreamerScope', 'playType', 'label', 'number', 'familyKey', 'gameType', 'score', 'status'],
      ...filteredPins.map(row => [
        row.playDate || '',
        row.state || '',
        row.dreamerScope || '',
        row.playType || '',
        row.label || '',
        row.number || '',
        row.familyKey || '',
        row.gameType || '',
        String(row.score || ''),
        row.status || '',
      ]),
    ];

    downloadCsv(`pinned_plays_${playDate}_${selectedState}.csv`, rows);
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
            <h1>Daily Ops</h1>
            <p>
              Run the daily workflow: review imported results, evaluate pinned plays,
              apply outcome suggestions, and export or print the play slip.
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
              <label className="journal-label">Play Date</label>
              <input
                type="date"
                className="journal-input"
                value={playDate}
                onChange={e => setPlayDate(e.target.value)}
              />
            </div>

            <div>
              <label className="journal-label">State</label>
              <input
                className="journal-input"
                value={selectedState}
                onChange={e => setSelectedState(e.target.value.toUpperCase())}
                placeholder="GA"
              />
            </div>

            <div>
              <label className="journal-label">Dreamer Scope</label>
              <select
                className="journal-select"
                value={scopeFilter}
                onChange={e => setScopeFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {visibleScopes.map(scope => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
            <button type="button" className="btn-secondary" onClick={exportPlaySlip}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Download size={14} />
                Export Play Slip CSV
              </span>
            </button>

            <button type="button" className="btn-secondary" onClick={() => window.print()}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={14} />
                Print Play Slip
              </span>
            </button>

            <Link href="/results/import" className="btn-secondary">
              Go to Results Import
            </Link>

            {suggestions.length ? (
              <button
                type="button"
                className="btn-primary"
                disabled={savingId === 'ALL'}
                onClick={applyAllSuggestions}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={14} />
                  {savingId === 'ALL' ? 'Applying...' : 'Apply All Win Suggestions'}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPlayDate(todayIso());
                setSelectedState('GA');
                setScopeFilter('ALL');
              }}
            >
              Reset Filters
            </button>
          </div>
        </section>

        {message ? (
          <div
            className="journal-card-flat"
            style={{
              borderColor: '#cfe5c8',
              background: '#f5fbf2',
              color: '#315a2b',
            }}
          >
            {message}
          </div>
        ) : null}

        {error ? (
          <div
            className="journal-card-flat"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </div>
        ) : null}

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading Daily Ops...</p>
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div
                style={{
                  display: 'grid',
                  gap: '12px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                }}
              >
                <div>
                  <div className="journal-label">Imported Results</div>
                  <div>{filteredResults.length}</div>
                </div>
                <div>
                  <div className="journal-label">Pinned Plays</div>
                  <div>{filteredPins.length}</div>
                </div>
                <div>
                  <div className="journal-label">Win Suggestions</div>
                  <div>{suggestions.length}</div>
                </div>
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Activity size={18} />
                <strong>Imported Results for {playDate} / {selectedState}</strong>
              </div>

              {filteredResults.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No imported results found for this date and state yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {filteredResults.map(result => (
                    <div key={`${result.id}`} className="journal-card-flat">
                      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <div>
                          <div className="journal-label">Game</div>
                          <div>{result.gameType}</div>
                        </div>
                        <div>
                          <div className="journal-label">Draw Time</div>
                          <div>{result.drawTime}</div>
                        </div>
                        <div>
                          <div className="journal-label">Result</div>
                          <div>{normalizeResultValue(result) || '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Target size={18} />
                <strong>Outcome Suggestions</strong>
              </div>

              {suggestions.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No auto win suggestions found for this view yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {suggestions.map(item => (
                    <article key={item.pin.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '18px', marginBottom: '8px' }}>
                            {item.pin.label}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Suggested status: <strong>{item.suggestedStatus}</strong>
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                            {item.reason}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '8px' }}>
                            Matched results: {item.matches.map(row => `${row.gameType} ${row.drawTime} ${normalizeResultValue(row)}`).join(' • ')}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={savingId === item.pin.id}
                          onClick={() => applySuggestion(item.pin.id, item.suggestedStatus)}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={14} />
                            {savingId === item.pin.id ? 'Applying...' : 'Apply Suggestion'}
                          </span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Current Play Slip</strong>
              </div>

              {filteredPins.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No pinned plays for this date/state/scope yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredPins.map(row => (
                    <article key={row.id} className="journal-card-flat">
                      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <div>
                          <div className="journal-label">Type</div>
                          <div>{row.playType}</div>
                        </div>
                        <div>
                          <div className="journal-label">Label</div>
                          <div>{row.label}</div>
                        </div>
                        <div>
                          <div className="journal-label">Number</div>
                          <div>{row.number || '—'}</div>
                        </div>
                        <div>
                          <div className="journal-label">Family</div>
                          <div>{row.familyKey || '—'}</div>
                        </div>
                        <div>
                          <div className="journal-label">Game</div>
                          <div>{row.gameType}</div>
                        </div>
                        <div>
                          <div className="journal-label">Score</div>
                          <div>{row.score || 0}</div>
                        </div>
                        <div>
                          <div className="journal-label">Status</div>
                          <div>{row.status}</div>
                        </div>
                      </div>
                    </article>
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
