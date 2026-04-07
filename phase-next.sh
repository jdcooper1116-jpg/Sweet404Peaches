#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/firebase"
mkdir -p "$BACKUP_DIR/src/app/dreams"
mkdir -p "$BACKUP_DIR/src/app/dreamers"

[ -f src/lib/firebase/firestore.ts ] && cp src/lib/firebase/firestore.ts "$BACKUP_DIR/src/lib/firebase/firestore.ts"
[ -f src/app/dreams/new/page.tsx ] && cp src/app/dreams/new/page.tsx "$BACKUP_DIR/src/app/dreams/new.page.tsx.bak"
[ -f src/app/dreams/page.tsx ] && cp src/app/dreams/page.tsx "$BACKUP_DIR/src/app/dreams/page.tsx.bak"
[ -f src/app/dreamers/page.tsx ] && cp src/app/dreamers/page.tsx "$BACKUP_DIR/src/app/dreamers/page.tsx.bak"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("src/lib/firebase/firestore.ts")
text = p.read_text()

pattern = re.compile(
    r"export async function listDreamers\(ownerUid: string\): Promise<Dreamer\[\]> \{\n.*?\n\}",
    re.S,
)

replacement = """export async function listDreamers(ownerUid: string): Promise<Dreamer[]> {
  const q = query(
    collection(db, COLLECTIONS.dreamers),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<Dreamer>(d.id, d.data()));
}"""

new_text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("Could not patch listDreamers in src/lib/firebase/firestore.ts")

p.write_text(new_text)
print("Patched listDreamers in firestore.ts")
PY

mkdir -p src/app/dreams/new
cat > src/app/dreams/new/page.tsx <<'TSX'
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
        router.push('/dreams');
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
                If you select a saved dreamer, the dream will now be stored under
                that dreamer’s record. This is the first step toward each person
                having their own personalized dream journal layer.
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
                <strong>Archived Longer Numbers</strong>
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

            <div style={{ display: 'grid', gap: '14px' }}>
              {parseResult.termMappings.map(mapping => (
                <div key={mapping.term} className="journal-card-flat">
                  <div
                    style={{
                      fontWeight: 700,
                      color: 'var(--deep-plum)',
                      marginBottom: '10px',
                    }}
                  >
                    {mapping.term}
                  </div>

                  {mapping.relatedTerms.length ? (
                    <div
                      style={{
                        marginBottom: '10px',
                        fontSize: '13px',
                        color: 'var(--ink-light)',
                      }}
                    >
                      <strong>Related terms:</strong> {mapping.relatedTerms.join(', ')}
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                    <div>
                      <strong>Cash 3:</strong>{' '}
                      {mapping.cash3Numbers.length ? mapping.cash3Numbers.join(', ') : '—'}
                    </div>
                    <div>
                      <strong>Cash 4:</strong>{' '}
                      {mapping.cash4Numbers.length ? mapping.cash4Numbers.join(', ') : '—'}
                    </div>
                    <div>
                      <strong>Archived:</strong>{' '}
                      {mapping.archivedNumbers.length ? mapping.archivedNumbers.join(', ') : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
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
import { BookMarked, Plus, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listDreamEntries } from '@/lib/firebase/firestore';
import type { DreamEntry } from '@/lib/types';

export default function DreamsPage() {
  const { user, loading } = useAuth();
  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [dreamerFilter, setDreamerFilter] = useState('ALL');

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
      if (a.dreamDate !== b.dreamDate) return b.dreamDate.localeCompare(a.dreamDate);
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
              <h1>Dream Log</h1>
              <p>
                Your saved dream entries and active 7-day journal history, now
                filterable by dreamer.
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
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading dreams...</p>
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
              <strong>No dreams in this view yet</strong>
            </div>

            <p style={{ color: 'var(--ink-light)', margin: 0 }}>
              Save a dream entry and it will appear here.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '16px' }}>
            {filteredEntries.map(entry => (
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
                        fontSize: '12px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-muted)',
                        marginBottom: '8px',
                      }}
                    >
                      {entry.dreamDate} • {entry.dreamerName}
                    </div>

                    <h2
                      style={{
                        margin: 0,
                        fontSize: '22px',
                        color: 'var(--deep-plum)',
                        fontStyle: 'italic',
                      }}
                    >
                      {entry.isReviewed ? 'Parsed Dream Entry' : 'Dream Draft'}
                    </h2>
                  </div>

                  <div
                    className="journal-card-flat"
                    style={{
                      padding: '10px 12px',
                      minWidth: '210px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: 'var(--ink-muted)',
                        marginBottom: '6px',
                      }}
                    >
                      Active Window
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--ink)' }}>
                      {entry.activeWindowStart} → {entry.activeWindowEnd}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    marginTop: '16px',
                  }}
                >
                  <div className="journal-card-flat">
                    <div className="journal-label">Reviewed</div>
                    <div>{entry.isReviewed ? 'Yes' : 'No'}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Mapped Terms</div>
                    <div>{entry.termMappings.length}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">All Numbers</div>
                    <div>{entry.allNumbers.length}</div>
                  </div>
                </div>

                <p
                  style={{
                    marginTop: '16px',
                    marginBottom: '0',
                    color: 'var(--ink)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {entry.rawText.length > 320
                    ? `${entry.rawText.slice(0, 320)}...`
                    : entry.rawText}
                </p>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
TSX

echo "Phase script complete."
echo "Backups saved to: $BACKUP_DIR"
