'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, Pin, Save, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listPinnedPlays, updatePinnedPlay } from '@/lib/firebase/firestore';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type PinStatus = 'pinned' | 'played' | 'won' | 'archived';

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function PinnedPlaysPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playDateFilter, setPlayDateFilter] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<'ALL' | PinStatus>('ALL');
  const [dreamerScopeFilter, setDreamerScopeFilter] = useState('ALL');
  const [savingId, setSavingId] = useState('');

  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [statusById, setStatusById] = useState<Record<string, PinStatus>>({});

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const result = await listPinnedPlays(user.uid);
        setRows(result);

        const notesState: Record<string, string> = {};
        const statusState: Record<string, PinStatus> = {};

        for (const row of result) {
          notesState[row.id] = row.notes || '';
          statusState[row.id] = (row.status || 'pinned') as PinStatus;
        }

        setNotesById(notesState);
        setStatusById(statusState);
      } catch (err) {
        console.error(err);
        setError('Could not load pinned plays.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const visibleScopes = useMemo(() => {
    return unique(rows.map(row => row.dreamerScope || 'ALL')).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows
      .filter(row => !playDateFilter || row.playDate === playDateFilter)
      .filter(row => statusFilter === 'ALL' || row.status === statusFilter)
      .filter(row => dreamerScopeFilter === 'ALL' || row.dreamerScope === dreamerScopeFilter)
      .sort((a, b) => {
        if ((a.playDate || '') !== (b.playDate || '')) return (b.playDate || '').localeCompare(a.playDate || '');
        if ((a.score || 0) !== (b.score || 0)) return (b.score || 0) - (a.score || 0);
        return (a.label || '').localeCompare(b.label || '');
      });
  }, [rows, playDateFilter, statusFilter, dreamerScopeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();

    for (const row of filteredRows) {
      const key = row.playType || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    return [
      { key: 'agreement', label: 'Strong Agreements' },
      { key: 'boxed', label: 'Boxed Plays' },
      { key: 'straight', label: 'Straight Plays' },
      { key: 'watch', label: 'Watch Only' },
    ].map(section => ({
      ...section,
      rows: map.get(section.key) || [],
    }));
  }, [filteredRows]);

  async function saveRow(rowId: string) {
    if (!user) return;

    try {
      setSavingId(rowId);
      setError('');
      setMessage('');

      await updatePinnedPlay(rowId, {
        status: statusById[rowId],
        notes: notesById[rowId] || '',
      });

      const refreshed = await listPinnedPlays(user.uid);
      setRows(refreshed);
      setMessage('Pinned play updated.');
    } catch (err) {
      console.error(err);
      setError('Could not update pinned play.');
    } finally {
      setSavingId('');
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
            <h1>Pinned Plays</h1>
            <p>
              Your daily shortlist of pinned families and numbers from the Forecast Board.
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
                value={playDateFilter}
                onChange={e => setPlayDateFilter(e.target.value)}
              />
            </div>

            <div>
              <label className="journal-label">Status</label>
              <select
                className="journal-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'ALL' | PinStatus)}
              >
                <option value="ALL">All</option>
                <option value="pinned">pinned</option>
                <option value="played">played</option>
                <option value="won">won</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div>
              <label className="journal-label">Dreamer Scope</label>
              <select
                className="journal-select"
                value={dreamerScopeFilter}
                onChange={e => setDreamerScopeFilter(e.target.value)}
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

          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPlayDateFilter(todayIso());
                setStatusFilter('ALL');
                setDreamerScopeFilter('ALL');
              }}
            >
              Reset Filters
            </button>
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
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading pinned plays...</p>
          </section>
        ) : filteredRows.length === 0 ? (
          <section className="journal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
              <Sparkles size={18} />
              <strong>No pinned plays in this view yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Pin items from the Forecast Board to build your daily shortlist.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '20px' }}>
            {grouped.map(section => (
              <article key={section.key} className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '14px' }}>
                  <BookmarkCheck size={18} />
                  <strong style={{ fontSize: '22px' }}>{section.label}</strong>
                </div>

                {section.rows.length === 0 ? (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    Nothing pinned in this section for the current filters.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '14px' }}>
                    {section.rows.map(row => (
                      <div key={row.id} className="journal-card-flat">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                              <Pin size={16} />
                              <strong style={{ fontSize: '18px' }}>{row.label}</strong>
                            </div>

                            <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                              {row.number ? `Number: ${row.number}` : `Family: ${row.familyKey || '—'}`}
                            </div>
                            <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                              Scope: {row.dreamerScope} • State: {row.state} • Date: {row.playDate}
                            </div>
                          </div>

                          <div className="journal-card-flat" style={{ minWidth: '140px', textAlign: 'center' }}>
                            <div className="journal-label">Score</div>
                            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {row.score || 0}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: '14px' }}>
                          <div>
                            <label className="journal-label">Status</label>
                            <select
                              className="journal-select"
                              value={statusById[row.id] || 'pinned'}
                              onChange={e =>
                                setStatusById(current => ({
                                  ...current,
                                  [row.id]: e.target.value as PinStatus,
                                }))
                              }
                            >
                              <option value="pinned">pinned</option>
                              <option value="played">played</option>
                              <option value="won">won</option>
                              <option value="archived">archived</option>
                            </select>
                          </div>

                          <div>
                            <label className="journal-label">Notes</label>
                            <textarea
                              className="journal-textarea"
                              rows={3}
                              value={notesById[row.id] || ''}
                              onChange={e =>
                                setNotesById(current => ({
                                  ...current,
                                  [row.id]: e.target.value,
                                }))
                              }
                              placeholder="Add notes about why you pinned this, results, or outcome..."
                            />
                          </div>
                        </div>

                        <div style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={savingId === row.id}
                            onClick={() => saveRow(row.id)}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Save size={14} />
                              {savingId === row.id ? 'Saving...' : 'Save Update'}
                            </span>
                          </button>
                        </div>

                        {row.reasons?.length ? (
                          <div className="journal-card-flat" style={{ marginTop: '12px' }}>
                            <div className="journal-label">Reasons</div>
                            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-light)' }}>
                              {row.reasons.map((reason: string) => (
                                <li key={reason} style={{ marginBottom: '6px' }}>
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
