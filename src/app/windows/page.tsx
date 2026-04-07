'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, NotebookText, Sparkles } from 'lucide-react';
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

export default function ActiveWindowsPage() {
  const { user, loading } = useAuth();
  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

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
        setError('Could not load active dream windows.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const activeEntries = useMemo(() => {
    return [...entries]
      .filter(entry => entry.activeWindowStart && entry.activeWindowEnd)
      .sort((a, b) => {
        if (a.activeWindowStart !== b.activeWindowStart) {
          return b.activeWindowStart.localeCompare(a.activeWindowStart);
        }
        return a.dreamerName.localeCompare(b.dreamerName);
      });
  }, [entries]);

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
            <h1>Active Dream Windows</h1>
            <p>
              One journal card per dream entry, showing when it was posted and
              the full active timeframe.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Loading active windows...
            </p>
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
        ) : activeEntries.length === 0 ? (
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
              <Sparkles size={18} />
              <strong>No active dream windows yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Parse and save a dream first, and its active timeframe will appear here.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '16px' }}>
            {activeEntries.map(entry => (
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
                      <NotebookText size={18} />
                      <strong style={{ fontSize: '20px' }}>{entry.dreamerName}</strong>
                    </div>

                    <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                      Posted: {formatPosted(entry.uploadedAt)}
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

                <div
                  style={{
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    marginTop: '18px',
                  }}
                >
                  <div className="journal-card-flat">
                    <div className="journal-label">Mapped Terms</div>
                    <div>{entry.termMappings.length}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Tracked Numbers</div>
                    <div>{entry.allNumbers.length}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Status</div>
                    <div>{entry.isReviewed ? 'Parsed & Active' : 'Draft Window'}</div>
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
                ) : null}
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
