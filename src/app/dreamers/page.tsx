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
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
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
