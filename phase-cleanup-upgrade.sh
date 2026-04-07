#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

python3 - <<'PY'
from pathlib import Path

# -----------------------------
# Patch firestore.ts
# -----------------------------
firestore_path = Path("src/lib/firebase/firestore.ts")
text = firestore_path.read_text()

if "export async function deleteLotteryResultById" not in text:
    text += """

export async function deleteLotteryResultById(resultId: string) {
  await deleteDoc(doc(db, COLLECTIONS.lotteryResults, resultId));
}

export async function deletePinnedPlayById(pinnedPlayId: string) {
  await deleteDoc(doc(db, COLLECTIONS.pinnedPlays, pinnedPlayId));
}

export async function bulkDeleteTestDataByDreamer(dreamerId: string, dreamerName?: string) {
  const batch = writeBatch(db);

  const dreamerRef = doc(db, COLLECTIONS.dreamers, dreamerId);
  batch.delete(dreamerRef);

  const dreamsSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamEntries), where('dreamerId', '==', dreamerId))
  );
  dreamsSnap.forEach(d => batch.delete(d.ref));

  const windowsSnap = await getDocs(
    query(collection(db, COLLECTIONS.activeDreamWindows), where('dreamerId', '==', dreamerId))
  );
  windowsSnap.forEach(d => batch.delete(d.ref));

  const hitsSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamHits), where('dreamerId', '==', dreamerId))
  );
  hitsSnap.forEach(d => batch.delete(d.ref));

  const personalSnap = await getDocs(
    query(collection(db, COLLECTIONS.personalHitMappings), where('dreamerId', '==', dreamerId))
  );
  personalSnap.forEach(d => batch.delete(d.ref));

  const pinnedByScopeSnap = await getDocs(
    query(collection(db, COLLECTIONS.pinnedPlays), where('dreamerScope', '==', dreamerName || dreamerId))
  );
  pinnedByScopeSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

export async function bulkDeleteTestDataByDate(date: string) {
  const batch = writeBatch(db);

  const dreamsSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamEntries), where('dreamDate', '==', date))
  );
  dreamsSnap.forEach(d => batch.delete(d.ref));

  const windowsByStartSnap = await getDocs(
    query(collection(db, COLLECTIONS.activeDreamWindows), where('activeStart', '==', date))
  );
  windowsByStartSnap.forEach(d => batch.delete(d.ref));

  const windowsByEndSnap = await getDocs(
    query(collection(db, COLLECTIONS.activeDreamWindows), where('activeEnd', '==', date))
  );
  windowsByEndSnap.forEach(d => batch.delete(d.ref));

  const hitsByDateSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamHits), where('drawDate', '==', date))
  );
  hitsByDateSnap.forEach(d => batch.delete(d.ref));

  const resultsSnap = await getDocs(
    query(collection(db, COLLECTIONS.lotteryResults), where('date', '==', date))
  );
  resultsSnap.forEach(d => batch.delete(d.ref));

  const pinnedSnap = await getDocs(
    query(collection(db, COLLECTIONS.pinnedPlays), where('playDate', '==', date))
  );
  pinnedSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}
"""
    firestore_path.write_text(text)

# -----------------------------
# Rewrite cleanup page
# -----------------------------
cleanup_page = Path("src/app/cleanup/page.tsx")
cleanup_page.write_text("""'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  bulkDeleteTestDataByDate,
  bulkDeleteTestDataByDreamer,
  deleteDreamEntryCascade,
  deleteDreamerCascade,
  deleteLotteryResultById,
  deletePinnedPlayById,
  listDreamEntries,
  listDreamers,
  listLotteryResults,
  listPinnedPlays,
} from '@/lib/firebase/firestore';

function formatDate(value: any) {
  try {
    if (!value) return '—';
    if (typeof value === 'string') return value;
    if (value?.toDate) return value.toDate().toLocaleString();
    return String(value);
  } catch {
    return '—';
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CleanupPage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [pins, setPins] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [dreamSearch, setDreamSearch] = useState('');
  const [dreamerSearch, setDreamerSearch] = useState('');
  const [resultSearch, setResultSearch] = useState('');
  const [pinSearch, setPinSearch] = useState('');
  const [bulkDreamerId, setBulkDreamerId] = useState('');
  const [bulkDate, setBulkDate] = useState(todayIso());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    if (!user) return;

    const [dreamRows, dreamerRows, resultRows, pinRows] = await Promise.all([
      listDreamEntries(user.uid),
      listDreamers(user.uid),
      listLotteryResults(user.uid, 1000),
      listPinnedPlays(user.uid),
    ]);

    setDreams(dreamRows);
    setDreamers(dreamerRows);
    setResults(resultRows);
    setPins(pinRows);
  }

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setDreamers([]);
        setResults([]);
        setPins([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        await refresh();
      } catch (err) {
        console.error(err);
        setError('Could not load cleanup data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredDreams = useMemo(() => {
    const q = dreamSearch.trim().toLowerCase();
    if (!q) return dreams;

    return dreams.filter((dream: any) => {
      const text = [
        dream.dreamerName,
        dream.dreamDate,
        dream.dreamText,
        dream.rawText,
        dream.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [dreams, dreamSearch]);

  const filteredDreamers = useMemo(() => {
    const q = dreamerSearch.trim().toLowerCase();
    if (!q) return dreamers;

    return dreamers.filter((dreamer: any) => {
      const text = [
        dreamer.displayName,
        dreamer.alias,
        dreamer.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [dreamers, dreamerSearch]);

  const filteredResults = useMemo(() => {
    const q = resultSearch.trim().toLowerCase();
    if (!q) return results;

    return results.filter((row: any) => {
      const text = [
        row.state,
        row.date,
        row.gameType,
        row.drawTime,
        row.normalizedResult,
        row.result,
        row.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [results, resultSearch]);

  const filteredPins = useMemo(() => {
    const q = pinSearch.trim().toLowerCase();
    if (!q) return pins;

    return pins.filter((row: any) => {
      const text = [
        row.label,
        row.number,
        row.familyKey,
        row.state,
        row.playDate,
        row.playType,
        row.dreamerScope,
        row.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [pins, pinSearch]);

  async function handleDeleteDream(dream: any) {
    if (!user) return;

    const ok = window.confirm(
      `Delete this dream for ${dream.dreamerName || 'Unknown'}?\\n\\nThis will also remove linked active windows and linked dream hits for this dream.`
    );
    if (!ok) return;

    try {
      setBusyKey(`dream-${dream.id}`);
      setMessage('');
      setError('');
      await deleteDreamEntryCascade(dream.id);
      await refresh();
      setMessage('Dream deleted.');
    } catch (err) {
      console.error(err);
      setError('Could not delete dream.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeleteDreamer(dreamer: any) {
    if (!user) return;

    const ok = window.confirm(
      `Delete dreamer "${dreamer.displayName || 'Unknown'}"?\\n\\nThis will also remove linked dreams, active windows, dream hits, and personal hit mappings for that dreamer.`
    );
    if (!ok) return;

    try {
      setBusyKey(`dreamer-${dreamer.id}`);
      setMessage('');
      setError('');
      await deleteDreamerCascade(dreamer.id);
      await refresh();
      setMessage('Dreamer and linked records deleted.');
    } catch (err) {
      console.error(err);
      setError('Could not delete dreamer.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeleteResult(row: any) {
    if (!user) return;

    const ok = window.confirm(
      `Delete imported result ${row.state || ''} ${row.date || ''} ${row.gameType || ''} ${row.drawTime || ''} ${row.normalizedResult || row.result || ''}?`
    );
    if (!ok) return;

    try {
      setBusyKey(`result-${row.id}`);
      setMessage('');
      setError('');
      await deleteLotteryResultById(row.id);
      await refresh();
      setMessage('Imported result deleted.');
    } catch (err) {
      console.error(err);
      setError('Could not delete imported result.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeletePin(row: any) {
    if (!user) return;

    const ok = window.confirm(`Delete pinned play "${row.label || row.id}"?`);
    if (!ok) return;

    try {
      setBusyKey(`pin-${row.id}`);
      setMessage('');
      setError('');
      await deletePinnedPlayById(row.id);
      await refresh();
      setMessage('Pinned play deleted.');
    } catch (err) {
      console.error(err);
      setError('Could not delete pinned play.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleBulkDreamerWipe() {
    if (!user || !bulkDreamerId) return;

    const dreamer = dreamers.find((d: any) => d.id === bulkDreamerId);
    const ok = window.confirm(
      `Bulk wipe all test data for "${dreamer?.displayName || bulkDreamerId}"?\\n\\nThis removes the dreamer plus linked dreams, windows, hits, personal mappings, and matching pinned plays for that dreamer scope.`
    );
    if (!ok) return;

    try {
      setBusyKey(`bulk-dreamer-${bulkDreamerId}`);
      setMessage('');
      setError('');
      await bulkDeleteTestDataByDreamer(bulkDreamerId, dreamer?.displayName);
      await refresh();
      setMessage('Bulk dreamer test data wipe complete.');
      setBulkDreamerId('');
    } catch (err) {
      console.error(err);
      setError('Could not bulk wipe dreamer test data.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleBulkDateWipe() {
    if (!user || !bulkDate) return;

    const ok = window.confirm(
      `Bulk wipe all test data for date ${bulkDate}?\\n\\nThis removes dreams on that date, windows ending/starting on that date, dream hits with that draw date, imported results on that date, and pinned plays for that play date.`
    );
    if (!ok) return;

    try {
      setBusyKey(`bulk-date-${bulkDate}`);
      setMessage('');
      setError('');
      await bulkDeleteTestDataByDate(bulkDate);
      await refresh();
      setMessage('Bulk date test data wipe complete.');
    } catch (err) {
      console.error(err);
      setError('Could not bulk wipe date test data.');
    } finally {
      setBusyKey('');
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
            <h1>Cleanup Tools</h1>
            <p>
              Remove testing dreams, dreamers, imported results, and pinned plays so the app reflects real data only.
            </p>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            borderColor: '#ead9ae',
            background: '#fff9eb',
            color: '#6f5620',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} />
            <strong>Use with care</strong>
          </div>
          <p style={{ margin: '10px 0 0 0' }}>
            These tools permanently remove records. Bulk wipes are meant for test data cleanup.
          </p>
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
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading cleanup tools...</p>
          </section>
        ) : (
          <>
            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Trash2 size={18} />
                <strong>Bulk Wipe Test Data</strong>
              </div>

              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                <div className="journal-card-flat">
                  <label className="journal-label">Bulk Wipe by Dreamer</label>
                  <select
                    className="journal-select"
                    value={bulkDreamerId}
                    onChange={e => setBulkDreamerId(e.target.value)}
                  >
                    <option value="">Select dreamer...</option>
                    {dreamers.map((dreamer: any) => (
                      <option key={dreamer.id} value={dreamer.id}>
                        {dreamer.displayName}
                      </option>
                    ))}
                  </select>

                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!bulkDreamerId || busyKey === `bulk-dreamer-${bulkDreamerId}`}
                      onClick={handleBulkDreamerWipe}
                      style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                    >
                      {busyKey === `bulk-dreamer-${bulkDreamerId}` ? 'Wiping...' : 'Bulk Wipe Dreamer Data'}
                    </button>
                  </div>
                </div>

                <div className="journal-card-flat">
                  <label className="journal-label">Bulk Wipe by Date</label>
                  <input
                    type="date"
                    className="journal-input"
                    value={bulkDate}
                    onChange={e => setBulkDate(e.target.value)}
                  />

                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!bulkDate || busyKey === `bulk-date-${bulkDate}`}
                      onClick={handleBulkDateWipe}
                      style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                    >
                      {busyKey === `bulk-date-${bulkDate}` ? 'Wiping...' : 'Bulk Wipe Date Data'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Dream Cleanup</strong>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Dreams</label>
                <input
                  className="journal-input"
                  value={dreamSearch}
                  onChange={e => setDreamSearch(e.target.value)}
                  placeholder="Search by dreamer, date, text..."
                />
              </div>

              {filteredDreams.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No dreams found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredDreams.map((dream: any) => (
                    <article key={dream.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {dream.dreamerName || 'Unknown Dreamer'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginBottom: '6px' }}>
                            Date: {dream.dreamDate || formatDate(dream.createdAt)}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            {(dream.dreamText || dream.rawText || '').slice(0, 180) || 'No preview available'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `dream-${dream.id}`}
                          onClick={() => handleDeleteDream(dream)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          {busyKey === `dream-${dream.id}` ? 'Deleting...' : 'Delete Dream'}
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
                <strong>Dreamer Cleanup</strong>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Dreamers</label>
                <input
                  className="journal-input"
                  value={dreamerSearch}
                  onChange={e => setDreamerSearch(e.target.value)}
                  placeholder="Search by name or alias..."
                />
              </div>

              {filteredDreamers.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No dreamers found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredDreamers.map((dreamer: any) => (
                    <article key={dreamer.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {dreamer.displayName || 'Unnamed Dreamer'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Alias: {dreamer.alias || '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `dreamer-${dreamer.id}`}
                          onClick={() => handleDeleteDreamer(dreamer)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          {busyKey === `dreamer-${dreamer.id}` ? 'Deleting...' : 'Delete Dreamer'}
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
                <strong>Imported Results Cleanup</strong>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Imported Results</label>
                <input
                  className="journal-input"
                  value={resultSearch}
                  onChange={e => setResultSearch(e.target.value)}
                  placeholder="Search by state, date, game, draw time, result..."
                />
              </div>

              {filteredResults.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No imported results found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredResults.map((row: any) => (
                    <article key={row.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {row.state || '—'} {row.date || '—'} {row.gameType || '—'} {row.drawTime || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Result: {row.normalizedResult || row.result || '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `result-${row.id}`}
                          onClick={() => handleDeleteResult(row)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          {busyKey === `result-${row.id}` ? 'Deleting...' : 'Delete Result'}
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
                <strong>Pinned Plays Cleanup</strong>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Pinned Plays</label>
                <input
                  className="journal-input"
                  value={pinSearch}
                  onChange={e => setPinSearch(e.target.value)}
                  placeholder="Search by label, number, family, state, date..."
                />
              </div>

              {filteredPins.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No pinned plays found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredPins.map((row: any) => (
                    <article key={row.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {row.label || 'Unnamed Pin'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Date: {row.playDate || '—'} • State: {row.state || '—'} • Type: {row.playType || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                            {row.number ? `Number: ${row.number}` : `Family: ${row.familyKey || '—'}`}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `pin-${row.id}`}
                          onClick={() => handleDeletePin(row)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          {busyKey === `pin-${row.id}` ? 'Deleting...' : 'Delete Pinned Play'}
                        </button>
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
""")

print("Cleanup upgrade applied.")
PY
