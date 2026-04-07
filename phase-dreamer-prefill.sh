#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/app/dreams/new"
mkdir -p "$BACKUP_DIR/src/app/dreamers"

[ -f src/app/dreams/new/page.tsx ] && cp src/app/dreams/new/page.tsx "$BACKUP_DIR/src/app/dreams/new/page.tsx.bak"
[ -f src/app/dreamers/page.tsx ] && cp src/app/dreamers/page.tsx "$BACKUP_DIR/src/app/dreamers/page.tsx.bak"

mkdir -p src/app/dreams/new
cat > src/app/dreams/new/page.tsx <<'TSX'
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpenText, Sparkles, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  buildDreamDateRange,
  createDreamEntry,
  createDreamEntryWithWindows,
  listDreamers,
  upsertOwnerProfile,
} from '@/lib/firebase/firestore';
import { parseDreamText } from '@/lib/parser/dreamParser';
import type { Dreamer, ParseResult } from '@/lib/types';

export default function NewDreamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const [dreamers, setDreamers] = useState<Dreamer[]>([]);
  const [dreamersLoading, setDreamersLoading] = useState(true);

  const [dreamDate, setDreamDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });

  const [selectedDreamerId, setSelectedDreamerId] = useState('owner-self');
  const [customDreamerName, setCustomDreamerName] = useState('Me');
  const [dreamText, setDreamText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  useEffect(() => {
    async function loadDreamers() {
      if (!user) {
        setDreamers([]);
        setDreamersLoading(false);
        return;
      }

      try {
        const rows = await listDreamers(user.uid);
        setDreamers(rows);
      } catch (err) {
        console.error(err);
      } finally {
        setDreamersLoading(false);
      }
    }

    if (!loading) {
      void loadDreamers();
    }
  }, [user, loading]);

  useEffect(() => {
    if (!dreamers.length) return;

    const queryDreamerId = searchParams.get('dreamerId');
    const queryDreamerName = searchParams.get('dreamerName');

    if (queryDreamerId) {
      const foundById = dreamers.find(d => d.id === queryDreamerId);
      if (foundById) {
        setSelectedDreamerId(foundById.id);
        return;
      }
    }

    if (queryDreamerName) {
      const foundByName = dreamers.find(
        d => d.displayName.toLowerCase() === queryDreamerName.toLowerCase()
      );
      if (foundByName) {
        setSelectedDreamerId(foundByName.id);
      }
    }
  }, [dreamers, searchParams]);

  const selectedDreamer = useMemo(() => {
    return dreamers.find(d => d.id === selectedDreamerId) ?? null;
  }, [dreamers, selectedDreamerId]);

  const effectiveDreamerId = selectedDreamer?.id ?? 'owner-self';
  const effectiveDreamerName =
    selectedDreamer?.displayName ?? (customDreamerName.trim() || 'Me');

  async function handleSaveDraft() {
    if (!user) {
      setError('You must be signed in to save a dream.');
      return;
    }

    if (!dreamText.trim()) {
      setError('Please enter your dream text first.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await upsertOwnerProfile(user.uid, {
        displayName: user.displayName || 'Sweet404Peaches Owner',
        email: user.email || '',
      });

      if (parseResult && parseResult.termMappings.length > 0) {
        await createDreamEntryWithWindows(user.uid, {
          dreamerId: effectiveDreamerId,
          dreamerName: effectiveDreamerName,
          rawText: dreamText,
          cleanedText: parseResult.cleanedText,
          dreamDate,
          termMappings: parseResult.termMappings,
          sourceType: 'manual',
          notes: '',
          isReviewed: true,
        });

        setMessage('Parsed dream saved with active 7-day windows.');
      } else {
        const range = buildDreamDateRange(dreamDate);

        await createDreamEntry(user.uid, {
          dreamerId: effectiveDreamerId,
          dreamerName: effectiveDreamerName,
          rawText: dreamText,
          cleanedText: dreamText.trim(),
          dreamDate,
          termMappings: [],
          allNumbers: [],
          activeWindowStart: range.start,
          activeWindowEnd: range.end,
          sourceType: 'manual',
          notes: '',
          isReviewed: false,
        });

        setMessage('Draft saved to Firestore.');
      }

      setDreamText('');
      setParseResult(null);

      setTimeout(() => {
        router.push(`/dreams?dreamer=${encodeURIComponent(effectiveDreamerName)}`);
      }, 900);
    } catch (err) {
      console.error(err);
      setError('Could not save dream. Check Firestore setup and permissions.');
    } finally {
      setSaving(false);
    }
  }

  function handleParseDream() {
    if (!dreamText.trim()) {
      setError('Please enter your dream text first.');
      setParseResult(null);
      return;
    }

    setError('');
    setMessage('');
    setParseResult(parseDreamText(dreamText));
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
              <h1>New Dream Entry</h1>
              <p>
                Capture the dream exactly as it came. You can save it under
                yourself or under a saved dreamer.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreamers" className="btn-secondary">
                Manage Dreamers
              </Link>
              <Link href="/dashboard" className="btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '18px',
              color: 'var(--deep-plum)',
            }}
          >
            <BookOpenText size={20} />
            <strong>Dream Intake</strong>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              void handleSaveDraft();
            }}
            style={{ display: 'grid', gap: '18px' }}
          >
            <div>
              <label className="journal-label" htmlFor="dreamerSelect">
                Saved Dreamer
              </label>
              <select
                id="dreamerSelect"
                className="journal-select"
                value={selectedDreamerId}
                onChange={e => setSelectedDreamerId(e.target.value)}
                disabled={dreamersLoading}
              >
                <option value="owner-self">Me / Owner Journal</option>
                {dreamers.map(dreamer => (
                  <option key={dreamer.id} value={dreamer.id}>
                    {dreamer.displayName}
                  </option>
                ))}
              </select>
            </div>

            {selectedDreamer ? (
              <div className="journal-card-flat">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                    color: 'var(--deep-plum)',
                  }}
                >
                  <Users size={16} />
                  <strong>Selected Dreamer Profile</strong>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  }}
                >
                  <div>
                    <div className="journal-label">Name</div>
                    <div>{selectedDreamer.displayName}</div>
                  </div>

                  <div>
                    <div className="journal-label">Alias</div>
                    <div>{selectedDreamer.alias || '—'}</div>
                  </div>

                  <div>
                    <div className="journal-label">Preferred States</div>
                    <div>{selectedDreamer.preferredStates.join(', ')}</div>
                  </div>

                  <div>
                    <div className="journal-label">Preferred Games</div>
                    <div>{selectedDreamer.preferredGames.join(', ')}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="journal-label" htmlFor="customDreamerName">
                  Dreamer Name for This Entry
                </label>
                <input
                  id="customDreamerName"
                  className="journal-input"
                  value={customDreamerName}
                  onChange={e => setCustomDreamerName(e.target.value)}
                  placeholder="Me"
                />
              </div>
            )}

            <div>
              <label className="journal-label" htmlFor="dreamDate">
                Dream Date
              </label>
              <input
                id="dreamDate"
                type="date"
                className="journal-input"
                value={dreamDate}
                onChange={e => setDreamDate(e.target.value)}
              />
            </div>

            <div>
              <label className="journal-label" htmlFor="dreamText">
                Dream Text
              </label>
              <textarea
                id="dreamText"
                className="journal-textarea"
                rows={14}
                value={dreamText}
                onChange={e => setDreamText(e.target.value)}
                placeholder="Example: Dreamed of a red car accident with a surfboard on top..."
              />
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

            <div
              className="journal-card-flat"
              style={{
                display: 'grid',
                gap: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--deep-plum)',
                }}
              >
                <Sparkles size={16} />
                <strong>Dreamer-Aware Saving</strong>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: 'var(--ink-light)',
                  lineHeight: 1.6,
                }}
              >
                If you select a saved dreamer, the dream will be stored under
                that dreamer’s record and return to that dreamer’s journal view.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : parseResult ? 'Save Parsed Dream' : 'Save Draft'}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleParseDream}
              >
                Parse Dream
              </button>
            </div>
          </form>
        </section>

        {parseResult ? (
          <section className="journal-card" style={{ display: 'grid', gap: '20px' }}>
            <div className="page-header">
              <h1>Parse Preview</h1>
              <p>These are the extracted terms and number candidates from your dream.</p>
            </div>

            <div
              style={{
                display: 'grid',
                gap: '16px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              }}
            >
              <div className="journal-card-flat">
                <strong>Cash 3</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                  {parseResult.cash3Numbers.length
                    ? parseResult.cash3Numbers.join(', ')
                    : 'No Cash 3 numbers found'}
                </p>
              </div>

              <div className="journal-card-flat">
                <strong>Cash 4</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                  {parseResult.cash4Numbers.length
                    ? parseResult.cash4Numbers.join(', ')
                    : 'No Cash 4 numbers found'}
                </p>
              </div>

              <div className="journal-card-flat">
                <strong>Archived / Symbolic Numbers</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>
                  {parseResult.archivedNumbers.length
                    ? parseResult.archivedNumbers.join(', ')
                    : 'None'}
                </p>
              </div>
            </div>

            <div className="journal-card-flat">
              <strong>Extracted Terms</strong>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '12px',
                }}
              >
                {parseResult.termMappings.length ? (
                  parseResult.termMappings.map(mapping => (
                    <span
                      key={mapping.term}
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
                  ))
                ) : (
                  <span style={{ color: 'var(--ink-light)' }}>
                    No terms found
                  </span>
                )}
              </div>
            </div>
          </section>
        ) : null}
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

                    <Link
                      href={`/dreams/new?dreamerId=${encodeURIComponent(dreamer.id)}&dreamerName=${encodeURIComponent(dreamer.displayName)}`}
                      className="btn-secondary"
                    >
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

echo "Dreamer prefill batch complete."
echo "Backups saved to: $BACKUP_DIR"
