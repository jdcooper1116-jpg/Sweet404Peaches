'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  bulkDeleteManualDictionaryEntries,
  bulkDeletePersonalHitMappingsByDate,
  bulkDeletePersonalHitMappingsByDreamer,
  bulkDeleteTestDataByDate,
  bulkDeleteTestDataByDreamer,
  deleteDreamEntryCascade,
  deleteDreamerCascade,
  deleteLotteryResultById,
  deletePersonalHitMappingById,
  deletePinnedPlayById,
  deleteTermNumberMappingById,
  listDreamEntries,
  listDreamers,
  listLotteryResults,
  listPersonalHitMappings,
  listPinnedPlays,
  listTermNumberMappings,
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
  const [personalMappings, setPersonalMappings] = useState<any[]>([]);
  const [dictionaryMappings, setDictionaryMappings] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [dreamSearch, setDreamSearch] = useState('');
  const [dreamerSearch, setDreamerSearch] = useState('');
  const [resultSearch, setResultSearch] = useState('');
  const [pinSearch, setPinSearch] = useState('');
  const [personalSearch, setPersonalSearch] = useState('');
  const [dictionarySearch, setDictionarySearch] = useState('');
  const [bulkDreamerId, setBulkDreamerId] = useState('');
  const [bulkDate, setBulkDate] = useState(todayIso());
  const [mappingDreamerId, setMappingDreamerId] = useState('');
  const [mappingDate, setMappingDate] = useState(todayIso());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    if (!user) return;

    const [
      dreamRows,
      dreamerRows,
      resultRows,
      pinRows,
      personalRows,
      dictionaryRows,
    ] = await Promise.all([
      listDreamEntries(user.uid),
      listDreamers(user.uid),
      listLotteryResults(user.uid, 1000),
      listPinnedPlays(user.uid),
      listPersonalHitMappings(user.uid),
      listTermNumberMappings(user.uid),
    ]);

    setDreams(dreamRows);
    setDreamers(dreamerRows);
    setResults(resultRows);
    setPins(pinRows);
    setPersonalMappings(personalRows);
    setDictionaryMappings(dictionaryRows);
  }

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setDreamers([]);
        setResults([]);
        setPins([]);
        setPersonalMappings([]);
        setDictionaryMappings([]);
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

  const filteredPersonalMappings = useMemo(() => {
    const q = personalSearch.trim().toLowerCase();
    if (!q) return personalMappings;

    return personalMappings.filter((row: any) => {
      const text = [
        row.dreamerName,
        row.termLabel,
        row.number,
        row.state,
        row.gameType,
        row.hitType,
        row.drawDate,
        row.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [personalMappings, personalSearch]);

  const filteredDictionaryMappings = useMemo(() => {
    const q = dictionarySearch.trim().toLowerCase();
    if (!q) return dictionaryMappings;

    return dictionaryMappings.filter((row: any) => {
      const text = [
        row.termLabel,
        row.number,
        row.gameType,
        row.source,
        row.confidenceBasis,
        row.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [dictionaryMappings, dictionarySearch]);

  async function runAction(key: string, action: () => Promise<void>, success: string, failure: string) {
    try {
      setBusyKey(key);
      setMessage('');
      setError('');
      await action();
      await refresh();
      setMessage(success);
    } catch (err) {
      console.error(err);
      setError(failure);
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeleteDream(dream: any) {
    const ok = window.confirm(
      `Delete this dream for ${dream.dreamerName || 'Unknown'}?\n\nThis also removes linked active windows and linked dream hits for this dream.`
    );
    if (!ok) return;

    await runAction(
      `dream-${dream.id}`,
      () => deleteDreamEntryCascade(dream.id),
      'Dream deleted.',
      'Could not delete dream.'
    );
  }

  async function handleDeleteDreamer(dreamer: any) {
    const ok = window.confirm(
      `Delete dreamer "${dreamer.displayName || 'Unknown'}"?\n\nThis also removes linked dreams, active windows, dream hits, and personal hit mappings for that dreamer.`
    );
    if (!ok) return;

    await runAction(
      `dreamer-${dreamer.id}`,
      () => deleteDreamerCascade(dreamer.id),
      'Dreamer and linked records deleted.',
      'Could not delete dreamer.'
    );
  }

  async function handleDeleteResult(row: any) {
    const ok = window.confirm(
      `Delete imported result ${row.state || ''} ${row.date || ''} ${row.gameType || ''} ${row.drawTime || ''} ${row.normalizedResult || row.result || ''}?`
    );
    if (!ok) return;

    await runAction(
      `result-${row.id}`,
      () => deleteLotteryResultById(row.id),
      'Imported result deleted.',
      'Could not delete imported result.'
    );
  }

  async function handleDeletePin(row: any) {
    const ok = window.confirm(`Delete pinned play "${row.label || row.id}"?`);
    if (!ok) return;

    await runAction(
      `pin-${row.id}`,
      () => deletePinnedPlayById(row.id),
      'Pinned play deleted.',
      'Could not delete pinned play.'
    );
  }

  async function handleDeletePersonalMapping(row: any) {
    const ok = window.confirm(
      `Delete personal hit mapping "${row.termLabel} → ${row.number}" for ${row.dreamerName || 'Unknown'}?`
    );
    if (!ok) return;

    await runAction(
      `personal-${row.id}`,
      () => deletePersonalHitMappingById(row.id),
      'Personal hit mapping deleted.',
      'Could not delete personal hit mapping.'
    );
  }

  async function handleDeleteDictionaryMapping(row: any) {
    const ok = window.confirm(
      `Delete dictionary row "${row.termLabel} → ${row.number}"?`
    );
    if (!ok) return;

    await runAction(
      `dictionary-${row.id}`,
      () => deleteTermNumberMappingById(row.id),
      'Dictionary row deleted.',
      'Could not delete dictionary row.'
    );
  }

  async function handleBulkDreamerWipe() {
    if (!bulkDreamerId) return;
    const dreamer = dreamers.find((d: any) => d.id === bulkDreamerId);

    const ok = window.confirm(
      `Bulk wipe all test data for "${dreamer?.displayName || bulkDreamerId}"?\n\nThis removes the dreamer plus linked dreams, windows, hits, personal mappings, and matching pinned plays for that dreamer scope.`
    );
    if (!ok) return;

    await runAction(
      `bulk-dreamer-${bulkDreamerId}`,
      () => bulkDeleteTestDataByDreamer(bulkDreamerId, dreamer?.displayName),
      'Bulk dreamer test data wipe complete.',
      'Could not bulk wipe dreamer test data.'
    );

    setBulkDreamerId('');
  }

  async function handleBulkDateWipe() {
    if (!bulkDate) return;

    const ok = window.confirm(
      `Bulk wipe all test data for date ${bulkDate}?\n\nThis removes dreams on that date, windows ending/starting on that date, dream hits with that draw date, imported results on that date, and pinned plays for that play date.`
    );
    if (!ok) return;

    await runAction(
      `bulk-date-${bulkDate}`,
      () => bulkDeleteTestDataByDate(bulkDate),
      'Bulk date test data wipe complete.',
      'Could not bulk wipe date test data.'
    );
  }

  async function handleBulkPersonalByDreamer() {
    if (!mappingDreamerId) return;
    const dreamer = dreamers.find((d: any) => d.id === mappingDreamerId);

    const ok = window.confirm(
      `Delete all personal hit mappings for "${dreamer?.displayName || mappingDreamerId}"?\n\nThis clears As They Fell Before and removes a major Forecast source for that dreamer.`
    );
    if (!ok) return;

    await runAction(
      `bulk-personal-dreamer-${mappingDreamerId}`,
      () => bulkDeletePersonalHitMappingsByDreamer(mappingDreamerId, dreamer?.displayName),
      'Personal hit mappings wiped for selected dreamer.',
      'Could not bulk wipe personal hit mappings by dreamer.'
    );

    setMappingDreamerId('');
  }

  async function handleBulkPersonalByDate() {
    if (!mappingDate) return;

    const ok = window.confirm(
      `Delete all personal hit mappings with draw date ${mappingDate}?`
    );
    if (!ok) return;

    await runAction(
      `bulk-personal-date-${mappingDate}`,
      () => bulkDeletePersonalHitMappingsByDate(mappingDate),
      'Personal hit mappings wiped for selected date.',
      'Could not bulk wipe personal hit mappings by date.'
    );
  }

  async function handleBulkManualDictionaryWipe() {
    const ok = window.confirm(
      `Delete all manual dictionary rows?\n\nThis clears manual Universal Dictionary test entries.`
    );
    if (!ok) return;

    await runAction(
      'bulk-manual-dictionary',
      () => bulkDeleteManualDictionaryEntries(),
      'Manual dictionary entries wiped.',
      'Could not bulk wipe manual dictionary entries.'
    );
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
              Remove testing dreams, dreamers, imported results, pinned plays, personal hit mappings, and manual dictionary rows.
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
                <Trash2 size={18} />
                <strong>As They Fell Before Cleanup</strong>
              </div>

              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: '14px' }}>
                <div className="journal-card-flat">
                  <label className="journal-label">Bulk Wipe Personal Mappings by Dreamer</label>
                  <select
                    className="journal-select"
                    value={mappingDreamerId}
                    onChange={e => setMappingDreamerId(e.target.value)}
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
                      disabled={!mappingDreamerId || busyKey === `bulk-personal-dreamer-${mappingDreamerId}`}
                      onClick={handleBulkPersonalByDreamer}
                      style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                    >
                      {busyKey === `bulk-personal-dreamer-${mappingDreamerId}` ? 'Wiping...' : 'Wipe Dreamer Mappings'}
                    </button>
                  </div>
                </div>

                <div className="journal-card-flat">
                  <label className="journal-label">Bulk Wipe Personal Mappings by Date</label>
                  <input
                    type="date"
                    className="journal-input"
                    value={mappingDate}
                    onChange={e => setMappingDate(e.target.value)}
                  />

                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!mappingDate || busyKey === `bulk-personal-date-${mappingDate}`}
                      onClick={handleBulkPersonalByDate}
                      style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                    >
                      {busyKey === `bulk-personal-date-${mappingDate}` ? 'Wiping...' : 'Wipe Date Mappings'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Personal Hit Mappings</label>
                <input
                  className="journal-input"
                  value={personalSearch}
                  onChange={e => setPersonalSearch(e.target.value)}
                  placeholder="Search by dreamer, term, number, state, date..."
                />
              </div>

              {filteredPersonalMappings.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No personal hit mappings found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredPersonalMappings.map((row: any) => (
                    <article key={row.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {row.dreamerName || 'Unknown'} — {row.termLabel || '—'} → {row.number || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            {row.state || '—'} • {row.gameType || '—'} • {row.hitType || '—'} • {row.drawDate || '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `personal-${row.id}`}
                          onClick={() => handleDeletePersonalMapping(row)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          {busyKey === `personal-${row.id}` ? 'Deleting...' : 'Delete Mapping'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Trash2 size={18} />
                <strong>Universal Dictionary Cleanup</strong>
              </div>

              <div className="journal-card-flat" style={{ marginBottom: '14px' }}>
                <label className="journal-label">Bulk Wipe Manual Dictionary Rows</label>
                <div style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busyKey === 'bulk-manual-dictionary'}
                    onClick={handleBulkManualDictionaryWipe}
                    style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                  >
                    {busyKey === 'bulk-manual-dictionary' ? 'Wiping...' : 'Wipe All Manual Dictionary Rows'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Dictionary Rows</label>
                <input
                  className="journal-input"
                  value={dictionarySearch}
                  onChange={e => setDictionarySearch(e.target.value)}
                  placeholder="Search by term, number, game type, source..."
                />
              </div>

              {filteredDictionaryMappings.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No dictionary rows found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredDictionaryMappings.map((row: any) => (
                    <article key={row.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {row.termLabel || '—'} → {row.number || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            {row.gameType || '—'} • source: {row.source || '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `dictionary-${row.id}`}
                          onClick={() => handleDeleteDictionaryMapping(row)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          {busyKey === `dictionary-${row.id}` ? 'Deleting...' : 'Delete Dictionary Row'}
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
