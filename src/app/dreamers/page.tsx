'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type DreamerRow = {
  id:                string;
  displayName:       string;
  alias?:            string;
  preferredStates:   string[];
  preferredGames:    string[];
  preferredDrawTimes?: string[];
  isGuest?:          boolean;
  notes?:            string;
};

type GameType = 'cash3' | 'cash4';
const ALL_DRAW_TIMES = ['midday', 'evening', 'night'];

// Synthetic owner-self entry — always shown even if no Firestore doc exists
const OWNER_SELF: DreamerRow = {
  id:              'owner-self',
  displayName:     'Owner / Self',
  preferredStates: [],
  preferredGames:  ['cash3', 'cash4'],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DreamersPage() {
  const { user, loading: authLoading } = useAuth();

  const [dreamers,    setDreamers]    = useState<DreamerRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [message,     setMessage]     = useState('');

  // Create-dreamer form state
  const [displayName,     setDisplayName]     = useState('');
  const [alias,           setAlias]           = useState('');
  const [preferredStates, setPreferredStates] = useState('GA');
  const [preferredGames,  setPreferredGames]  = useState<GameType[]>(['cash3', 'cash4']);
  const [isGuest,         setIsGuest]         = useState(false);

  // ── Load dreamers from server route ─────────────────────────────────────────
  async function loadDreamers() {
    if (!user) { setPageLoading(false); return; }
    try {
      setError('');
      const res  = await fetch(`/api/dreamers?ownerUid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load dreamers.');
      setDreamers(Array.isArray(data.dreamers) ? data.dreamers : []);
    } catch (err) {
      console.error(err);
      setError('Could not load dreamers.');
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) void loadDreamers();
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted, with owner-self prepended
  const allRows: DreamerRow[] = useMemo(() => {
    const sorted = [...dreamers].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    // Only prepend OWNER_SELF synthetic card if there's no real dreamer doc with id=owner-self
    const hasOwnerSelfDoc = sorted.some(d => d.id === 'owner-self');
    return hasOwnerSelfDoc ? sorted : [OWNER_SELF, ...sorted];
  }, [dreamers]);

  // ── Create dreamer via server route ─────────────────────────────────────────
  function toggleGame(game: GameType) {
    setPreferredGames(cur =>
      cur.includes(game) ? cur.filter(g => g !== game) : [...cur, game]
    );
  }

  async function handleCreateDreamer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user)             { setError('You must be signed in.');             return; }
    if (!displayName.trim()) { setError('Please enter a dreamer name.');       return; }
    if (!preferredGames.length) { setError('Select at least one game.');       return; }

    setSaving(true); setError(''); setMessage('');
    try {
      const states = preferredStates
        .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

      const res = await fetch('/api/dreamers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ownerUid:            user.uid,
          displayName:         displayName.trim(),
          alias:               alias.trim() || undefined,
          preferredStates:     states.length ? states : ['GA'],
          preferredGames,
          preferredDrawTimes:  ALL_DRAW_TIMES,
          isGuest,
          notes:               '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save dreamer.');

      setMessage('Dreamer saved.');
      setDisplayName(''); setAlias(''); setPreferredStates('GA');
      setPreferredGames(['cash3', 'cash4']); setIsGuest(false);
      void loadDreamers();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not save dreamer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background:
        'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), ' +
        'radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), ' +
        'linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
    }}>
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        {/* Header */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Dreamers</h1>
            <p>Manage everyone whose dreams you track. Each dreamer has their own personal As They Fell Before dictionary and dream history.</p>
          </div>
        </section>

        {/* Create dreamer */}
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--deep-plum)' }}>
            <Plus size={18} />
            <strong>Add Dreamer</strong>
          </div>

          <form onSubmit={handleCreateDreamer} style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div>
                <label className="journal-label" htmlFor="displayName">Display Name</label>
                <input id="displayName" className="journal-input" value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Jamala, Mama, Dream Partner" />
              </div>
              <div>
                <label className="journal-label" htmlFor="alias">Alias (optional)</label>
                <input id="alias" className="journal-input" value={alias}
                  onChange={e => setAlias(e.target.value)} placeholder="Optional nickname" />
              </div>
              <div>
                <label className="journal-label" htmlFor="prefStates">Preferred States</label>
                <input id="prefStates" className="journal-input" value={preferredStates}
                  onChange={e => setPreferredStates(e.target.value)} placeholder="GA, FL, SC" />
              </div>
            </div>

            <div>
              <div className="journal-label">Preferred Games</div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
                {(['cash3', 'cash4'] as GameType[]).map(g => (
                  <label key={g} style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={preferredGames.includes(g)} onChange={() => toggleGame(g)} />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={isGuest} onChange={e => setIsGuest(e.target.checked)} />
                <span>Mark as guest dreamer</span>
              </label>
            </div>

            {message && <div className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>{message}</div>}
            {error   && <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</div>}

            <div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Dreamer'}
              </button>
            </div>
          </form>
        </section>

        {/* Dreamer list */}
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--deep-plum)' }}>
            <Users size={18} />
            <strong>Saved Dreamers</strong>
          </div>

          {pageLoading ? (
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading dreamers…</p>
          ) : allRows.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>No dreamers saved yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {allRows.map(dreamer => {
                const isOwnerSelf = dreamer.id === 'owner-self';
                const idParam     = encodeURIComponent(dreamer.id);

                return (
                  <article key={dreamer.id} className="journal-card-flat">
                    {/* Profile row */}
                    <div style={{
                      display: 'grid', gap: '10px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      marginBottom: '14px',
                    }}>
                      <div>
                        <div className="journal-label">Name</div>
                        <div style={{ fontWeight: 700 }}>
                          {dreamer.displayName}
                          {isOwnerSelf && (
                            <span style={{
                              marginLeft: '8px', fontSize: '10px', fontWeight: 700,
                              padding: '2px 7px', borderRadius: '8px',
                              background: 'rgba(108,120,255,0.18)', color: '#b0b8ff',
                            }}>Owner</span>
                          )}
                        </div>
                      </div>

                      {dreamer.alias && (
                        <div>
                          <div className="journal-label">Alias</div>
                          <div>{dreamer.alias}</div>
                        </div>
                      )}

                      <div>
                        <div className="journal-label">Preferred States</div>
                        <div>{dreamer.preferredStates?.join(', ') || '—'}</div>
                      </div>

                      <div>
                        <div className="journal-label">Preferred Games</div>
                        <div>{dreamer.preferredGames?.join(', ') || '—'}</div>
                      </div>

                      <div>
                        <div className="journal-label">Type</div>
                        <div>{isOwnerSelf ? 'Owner' : dreamer.isGuest ? 'Guest' : 'Saved'}</div>
                      </div>
                    </div>

                    {/* Quick links */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Link
                        href={`/dreams?dreamerId=${idParam}`}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        Dreams
                      </Link>
                      <Link
                        href={`/dreams/new?dreamerId=${idParam}`}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        New Dream
                      </Link>
                      <Link
                        href={`/windows?dreamerId=${idParam}`}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        Windows
                      </Link>
                      <Link
                        href={`/hits?dreamerId=${idParam}`}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        Hits
                      </Link>
                      <Link
                        href={`/fell-before?dreamerId=${idParam}`}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        As They Fell Before
                      </Link>
                      <Link
                        href={`/dictionary?dreamerId=${idParam}`}
                        className="btn-secondary"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        Dictionary
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

      </section>
    </main>
  );
}
