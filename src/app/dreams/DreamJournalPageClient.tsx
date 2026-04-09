'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookMarked, NotebookPen, Plus, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listDreamEntries } from '@/lib/firebase/firestore';
import type { DreamEntry } from '@/lib/types';

function formatPosted(value: any): string {
  try {
    if (!value) return 'Unknown';
    const date =
      typeof value?.toDate === 'function'
        ? value.toDate()
        : new Date(value);
    return date.toLocaleString();
  } catch {
    return 'Unknown';
  }
}

export default function DreamsPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [dreamerFilter, setDreamerFilter] = useState('ALL');

  useEffect(() => {
    const queryDreamer = searchParams.get('dreamer');
    if (queryDreamer) {
      setDreamerFilter(queryDreamer);
    }
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setEntries([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const rows = await listDreamEntries(user.uid);
        setEntries(rows);
      } catch (err) {
        console.error(err);
        setError('Could not load dream entries from Firestore.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const dreamerNames = useMemo(() => {
    return Array.from(new Set(entries.map(e => e.dreamerName))).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const subset =
      dreamerFilter === 'ALL'
        ? entries
        : entries.filter(entry => entry.dreamerName === dreamerFilter);

    return [...subset].sort((a, b) => {
      const aPosted =
        typeof a.uploadedAt?.toDate === 'function'
          ? a.uploadedAt.toDate().getTime()
          : 0;
      const bPosted =
        typeof b.uploadedAt?.toDate === 'function'
          ? b.uploadedAt.toDate().getTime()
          : 0;

      if (aPosted !== bPosted) return bPosted - aPosted;
      return a.dreamerName.localeCompare(b.dreamerName);
    });
  }, [entries, dreamerFilter]);

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
              <h1>Dream Journal</h1>
              <p>
                A journal-style view of dreams, posted time, mapped terms, and
                parsed numbers. Filter by dreamer to view a personalized journal.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreamers" className="btn-secondary">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} />
                  Manage Dreamers
                </span>
              </Link>

              <Link href="/dreams/new" className="btn-primary">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={16} />
                  New Dream
                </span>
              </Link>
            </div>
          </div>
        </section>

        <section className="journal-card-flat">
          <label className="journal-label" htmlFor="dreamerFilter">
            Filter by Dreamer
          </label>
          <select
            id="dreamerFilter"
            className="journal-select"
            value={dreamerFilter}
            onChange={e => setDreamerFilter(e.target.value)}
          >
            <option value="ALL">All Dreamers</option>
            {dreamerNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading journal...</p>
          </section>
        ) : error ? (
          <section
            className="journal-card"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : filteredEntries.length === 0 ? (
          <section className="journal-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
                color: 'var(--deep-plum)',
              }}
            >
              <BookMarked size={18} />
              <strong>No journal entries in this view yet</strong>
            </div>

            <p style={{ color: 'var(--ink-light)', margin: 0 }}>
              Save a dream entry and it will appear here.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '18px' }}>
            {filteredEntries.map(entry => {
              const cash3 = Array.from(
                new Set(entry.termMappings.flatMap(m => m.cash3Numbers || []))
              );
              const cash4 = Array.from(
                new Set(entry.termMappings.flatMap(m => m.cash4Numbers || []))
              );
              const archived = Array.from(
                new Set(entry.termMappings.flatMap(m => m.archivedNumbers || []))
              );

              return (
                <article key={entry.id} className="journal-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '16px',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          color: 'var(--deep-plum)',
                          marginBottom: '8px',
                        }}
                      >
                        <NotebookPen size={18} />
                        <strong style={{ fontSize: '22px' }}>{entry.dreamerName}</strong>
                      </div>

                      <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                        Posted: {formatPosted(entry.uploadedAt)}
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                        Dream Date: {entry.dreamDate}
                      </div>
                    </div>

                    <div
                      className="journal-card-flat"
                      style={{ minWidth: '220px', textAlign: 'center' }}
                    >
                      <div className="journal-label">Active Timeframe</div>
                      <div style={{ fontSize: '15px', color: 'var(--ink)' }}>
                        {entry.activeWindowStart} → {entry.activeWindowEnd}
                      </div>
                    </div>
                  </div>

                  <div className="journal-card-flat" style={{ marginTop: '18px' }}>
                    <div className="journal-label">Dream Entry</div>
                    <div
                      style={{
                        marginTop: '10px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.8,
                        color: 'var(--ink)',
                      }}
                    >
                      {entry.rawText}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: '12px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      marginTop: '16px',
                    }}
                  >
                    <div className="journal-card-flat">
                      <div className="journal-label">Cash 3 Numbers</div>
                      <div style={{ color: 'var(--ink-light)' }}>
                        {cash3.length ? cash3.join(', ') : 'None'}
                      </div>
                    </div>

                    <div className="journal-card-flat">
                      <div className="journal-label">Cash 4 Numbers</div>
                      <div style={{ color: 'var(--ink-light)' }}>
                        {cash4.length ? cash4.join(', ') : 'None'}
                      </div>
                    </div>

                    <div className="journal-card-flat">
                      <div className="journal-label">Archived / Symbolic</div>
                      <div style={{ color: 'var(--ink-light)' }}>
                        {archived.length ? archived.join(', ') : 'None'}
                      </div>
                    </div>
                  </div>

                  {entry.termMappings.length ? (
                    <div className="journal-card-flat" style={{ marginTop: '16px' }}>
                      <div className="journal-label">Mapped Terms</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                        {entry.termMappings.map(mapping => (
                          <span
                            key={`${entry.id}-${mapping.term}`}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '999px',
                              background: 'rgba(201,168,76,0.14)',
                              border: '1px solid rgba(201,168,76,0.35)',
                              color: 'var(--deep-plum)',
                              fontSize: '14px',
                            }}
                          >
                            {mapping.term}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="journal-card-flat" style={{ marginTop: '16px' }}>
                      <div className="journal-label">Mapped Terms</div>
                      <div style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                        No parsed term mappings yet.
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}
