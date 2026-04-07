#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/app/windows"
mkdir -p "$BACKUP_DIR/src/app/dreams"
mkdir -p "$BACKUP_DIR/src/app/dreamers"

[ -f src/app/windows/page.tsx ] && cp src/app/windows/page.tsx "$BACKUP_DIR/src/app/windows/page.tsx.bak"
[ -f src/app/dreams/page.tsx ] && cp src/app/dreams/page.tsx "$BACKUP_DIR/src/app/dreams/page.tsx.bak"
[ -f src/app/dreamers/page.tsx ] && cp src/app/dreamers/page.tsx "$BACKUP_DIR/src/app/dreamers/page.tsx.bak"

mkdir -p src/app/windows
cat > src/app/windows/page.tsx <<'TSX'
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
TSX

mkdir -p src/app/dreams
cat > src/app/dreams/page.tsx <<'TSX'
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
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
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
TSX

mkdir -p src/app/dreamers
cat > src/app/dreamers/page.tsx <<'TSX'
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { createDreamer, listDreamers } from '@/lib/firebase/firestore';
import type { Dreamer, GameType, DrawTime } from '@/lib/types';

const ALL_DRAW_TIMES: DrawTime[] = ['midday', 'evening', 'night'];

export default function DreamersPage() {
  const { user, loading } = useAuth();

  const [dreamers, setDreamers] = useState<Dreamer[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [alias, setAlias] = useState('');
  const [preferredStates, setPreferredStates] = useState('GA');
  const [preferredGames, setPreferredGames] = useState<GameType[]>(['cash3', 'cash4']);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreamers([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const rows = await listDreamers(user.uid);
        setDreamers(rows);
      } catch (err) {
        console.error(err);
        setError('Could not load dreamers.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const sortedDreamers = useMemo(() => {
    return [...dreamers].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [dreamers]);

  function toggleGame(game: GameType) {
    setPreferredGames(current =>
      current.includes(game)
        ? current.filter(g => g !== game)
        : [...current, game]
    );
  }

  async function handleCreateDreamer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter a dreamer name.');
      return;
    }

    if (!preferredGames.length) {
      setError('Select at least one preferred game.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const states = preferredStates
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);

      await createDreamer(user.uid, {
        displayName: displayName.trim(),
        alias: alias.trim() || undefined,
        avatarUrl: undefined,
        preferredStates: states.length ? states : ['GA'],
        preferredGames,
        preferredDrawTimes: ALL_DRAW_TIMES,
        isGuest,
        notes: '',
      });

      const rows = await listDreamers(user.uid);
      setDreamers(rows);

      setDisplayName('');
      setAlias('');
      setPreferredStates('GA');
      setPreferredGames(['cash3', 'cash4']);
      setIsGuest(false);

      setMessage('Dreamer saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save dreamer.');
    } finally {
      setSaving(false);
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
            <h1>Dreamers</h1>
            <p>
              Add and manage the people whose dreams you want to track inside
              Sweet404Peaches.
            </p>
          </div>
        </section>

        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              color: 'var(--deep-plum)',
            }}
          >
            <Plus size={18} />
            <strong>Add Dreamer</strong>
          </div>

          <form onSubmit={handleCreateDreamer} style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label className="journal-label" htmlFor="displayName">
                Display Name
              </label>
              <input
                id="displayName"
                className="journal-input"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Example: Jamala, Mama, Dream Partner"
              />
            </div>

            <div>
              <label className="journal-label" htmlFor="alias">
                Alias
              </label>
              <input
                id="alias"
                className="journal-input"
                value={alias}
                onChange={e => setAlias(e.target.value)}
                placeholder="Optional nickname"
              />
            </div>

            <div>
              <label className="journal-label" htmlFor="preferredStates">
                Preferred States
              </label>
              <input
                id="preferredStates"
                className="journal-input"
                value={preferredStates}
                onChange={e => setPreferredStates(e.target.value)}
                placeholder="GA, FL, SC"
              />
            </div>

            <div>
              <div className="journal-label">Preferred Games</div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={preferredGames.includes('cash3')}
                    onChange={() => toggleGame('cash3')}
                  />
                  <span>cash3</span>
                </label>

                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={preferredGames.includes('cash4')}
                    onChange={() => toggleGame('cash4')}
                  />
                  <span>cash4</span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={isGuest}
                  onChange={e => setIsGuest(e.target.checked)}
                />
                <span>Mark as guest dreamer</span>
              </label>
            </div>

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

            <div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Dreamer'}
              </button>
            </div>
          </form>
        </section>

        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              color: 'var(--deep-plum)',
            }}
          >
            <Users size={18} />
            <strong>Saved Dreamers</strong>
          </div>

          {pageLoading ? (
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading dreamers...</p>
          ) : sortedDreamers.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              No dreamers saved yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {sortedDreamers.map(dreamer => (
                <article key={dreamer.id} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '12px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    <div>
                      <div className="journal-label">Name</div>
                      <div>{dreamer.displayName}</div>
                    </div>

                    <div>
                      <div className="journal-label">Alias</div>
                      <div>{dreamer.alias || '—'}</div>
                    </div>

                    <div>
                      <div className="journal-label">States</div>
                      <div>{dreamer.preferredStates.join(', ')}</div>
                    </div>

                    <div>
                      <div className="journal-label">Games</div>
                      <div>{dreamer.preferredGames.join(', ')}</div>
                    </div>

                    <div>
                      <div className="journal-label">Type</div>
                      <div>{dreamer.isGuest ? 'Guest' : 'Saved'}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                    <Link
                      href={`/dreams?dreamer=${encodeURIComponent(dreamer.displayName)}`}
                      className="btn-secondary"
                    >
                      Open Journal
                    </Link>

                    <Link href="/dreams/new" className="btn-secondary">
                      New Dream for Dreamer
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
TSX

echo "Journal cleanup batch complete."
echo "Backups saved to: $BACKUP_DIR"
