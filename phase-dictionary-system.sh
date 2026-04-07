#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/firebase"
mkdir -p "$BACKUP_DIR/src/app/dictionary"
mkdir -p "$BACKUP_DIR/src/app/fell-before"
mkdir -p "$BACKUP_DIR/src/app/playlists"
mkdir -p "$BACKUP_DIR/src/components/layout"

[ -f src/lib/firebase/firestore.ts ] && cp src/lib/firebase/firestore.ts "$BACKUP_DIR/src/lib/firebase/firestore.ts.bak"
[ -f src/app/dictionary/page.tsx ] && cp src/app/dictionary/page.tsx "$BACKUP_DIR/src/app/dictionary/page.tsx.bak"
[ -f src/app/fell-before/page.tsx ] && cp src/app/fell-before/page.tsx "$BACKUP_DIR/src/app/fell-before/page.tsx.bak"
[ -f src/app/playlists/page.tsx ] && cp src/app/playlists/page.tsx "$BACKUP_DIR/src/app/playlists/page.tsx.bak"
[ -f src/components/layout/Sidebar.tsx ] && cp src/components/layout/Sidebar.tsx "$BACKUP_DIR/src/components/layout/Sidebar.tsx.bak"

python3 - <<'PY'
from pathlib import Path

p = Path("src/lib/firebase/firestore.ts")
text = p.read_text()

append_block = """

export async function listTermNumberMappings(ownerUid: string): Promise<any[]> {
  const q = query(
    collection(db, COLLECTIONS.termNumberMappings),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<any>(d.id, d.data()));
}

export async function createTermNumberMapping(ownerUid: string, input: {
  termLabel: string;
  number: string;
  gameType: 'cash3' | 'cash4';
  source?: 'dreambook' | 'manual' | 'parsed';
  confidenceBasis?: string;
  rawContext?: string;
}) {
  const now = Timestamp.now();

  const payload = {
    ownerUid,
    termId: '',
    termLabel: input.termLabel,
    number: input.number,
    gameType: input.gameType,
    source: input.source ?? 'manual',
    confidenceBasis: input.confidenceBasis ?? '',
    rawContext: input.rawContext ?? '',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, COLLECTIONS.termNumberMappings), payload);
  return ref.id;
}
"""

if "export async function listTermNumberMappings" not in text:
    text += append_block
    p.write_text(text)
    print("Appended term dictionary helpers to firestore.ts")
else:
    print("Term dictionary helpers already present; skipped append")
PY

mkdir -p src/app/dictionary
cat > src/app/dictionary/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookType, Plus, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  createTermNumberMapping,
  listDreamEntries,
  listTermNumberMappings,
} from '@/lib/firebase/firestore';

type DictionaryRow = {
  term: string;
  gameType: 'cash3' | 'cash4' | 'mixed';
  numbers: string[];
  sources: string[];
  frequency: number;
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function DictionaryPage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [manualRows, setManualRows] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [termLabel, setTermLabel] = useState('');
  const [number, setNumber] = useState('');
  const [gameType, setGameType] = useState<'cash3' | 'cash4'>('cash3');
  const [note, setNote] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setManualRows([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [dreamRows, termRows] = await Promise.all([
          listDreamEntries(user.uid),
          listTermNumberMappings(user.uid),
        ]);

        setDreams(dreamRows);
        setManualRows(termRows);
      } catch (err) {
        console.error(err);
        setError('Could not load the universal dream dictionary.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const dictionaryRows = useMemo<DictionaryRow[]>(() => {
    const map = new Map<string, DictionaryRow>();

    for (const dream of dreams) {
      for (const mapping of dream.termMappings || []) {
        const term = mapping.term;
        const allNumbers = [
          ...(mapping.cash3Numbers || []),
          ...(mapping.cash4Numbers || []),
          ...(mapping.archivedNumbers || []),
        ];

        for (const value of allNumbers) {
          const key = term.toLowerCase();
          const inferredGameType =
            /^\d{3}$/.test(value) ? 'cash3' :
            /^\d{4}$/.test(value) ? 'cash4' :
            'mixed';

          if (!map.has(key)) {
            map.set(key, {
              term,
              gameType: inferredGameType,
              numbers: [],
              sources: [],
              frequency: 0,
            });
          }

          const item = map.get(key)!;
          item.numbers.push(value);
          item.sources.push(`parsed:${dream.dreamerName}`);
          item.frequency += 1;

          if (item.gameType !== inferredGameType) {
            item.gameType = 'mixed';
          }
        }
      }
    }

    for (const row of manualRows) {
      const term = row.termLabel;
      const key = term.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          term,
          gameType: row.gameType,
          numbers: [],
          sources: [],
          frequency: 0,
        });
      }

      const item = map.get(key)!;
      item.numbers.push(row.number);
      item.sources.push(`manual`);
      item.frequency += 1;

      if (item.gameType !== row.gameType) {
        item.gameType = 'mixed';
      }
    }

    return Array.from(map.values())
      .map(item => ({
        ...item,
        numbers: unique(item.numbers).sort(),
        sources: unique(item.sources),
      }))
      .sort((a, b) => {
        if (a.frequency !== b.frequency) return b.frequency - a.frequency;
        return a.term.localeCompare(b.term);
      });
  }, [dreams, manualRows]);

  async function handleManualAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!termLabel.trim() || !number.trim()) {
      setError('Please enter both a term and a number.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createTermNumberMapping(user.uid, {
        termLabel: termLabel.trim(),
        number: number.trim(),
        gameType,
        source: 'manual',
        confidenceBasis: note.trim(),
        rawContext: note.trim(),
      });

      const refreshed = await listTermNumberMappings(user.uid);
      setManualRows(refreshed);

      setTermLabel('');
      setNumber('');
      setGameType('cash3');
      setNote('');
      setMessage('Manual dictionary entry saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save manual dictionary entry.');
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
            <h1>Universal Dream Dictionary</h1>
            <p>
              Auto-built from uploaded dreams and parsed mappings, with manual add
              support for your older paper records.
            </p>
          </div>
        </section>

        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
            <Plus size={18} />
            <strong>Manual Add</strong>
          </div>

          <form onSubmit={handleManualAdd} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <label className="journal-label">Term</label>
              <input className="journal-input" value={termLabel} onChange={e => setTermLabel(e.target.value)} placeholder="cat, car, mother, wedding..." />
            </div>

            <div>
              <label className="journal-label">Number</label>
              <input className="journal-input" value={number} onChange={e => setNumber(e.target.value)} placeholder="802" />
            </div>

            <div>
              <label className="journal-label">Game Type</label>
              <select className="journal-select" value={gameType} onChange={e => setGameType(e.target.value as 'cash3' | 'cash4')}>
                <option value="cash3">cash3</option>
                <option value="cash4">cash4</option>
              </select>
            </div>

            <div>
              <label className="journal-label">Note</label>
              <input className="journal-input" value={note} onChange={e => setNote(e.target.value)} placeholder="optional note about paper journal source" />
            </div>

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

            <div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Dictionary Entry'}
              </button>
            </div>
          </form>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading dictionary...</p>
          </section>
        ) : dictionaryRows.length === 0 ? (
          <section className="journal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
              <Sparkles size={18} />
              <strong>No dictionary terms yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Parse dreams or add manual term-number entries to populate the dictionary.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '14px' }}>
            {dictionaryRows.map(item => (
              <article key={item.term.toLowerCase()} className="journal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                      <BookType size={18} />
                      <strong style={{ fontSize: '20px' }}>{item.term}</strong>
                    </div>
                    <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                      Numbers: {item.numbers.join(', ') || 'None'}
                    </div>
                  </div>

                  <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                    <div className="journal-label">Frequency</div>
                    <div style={{ fontSize: '28px', color: 'var(--deep-plum)', fontWeight: 700 }}>
                      {item.frequency}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '16px' }}>
                  <div className="journal-card-flat">
                    <div className="journal-label">Game Type</div>
                    <div>{item.gameType}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Source Types</div>
                    <div>{item.sources.join(', ')}</div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
TSX

mkdir -p src/app/fell-before
cat > src/app/fell-before/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookMarked, Plus, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listDreamers,
  listPersonalHitMappings,
  upsertPersonalHitMapping,
} from '@/lib/firebase/firestore';

function makeToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function FellBeforePage() {
  const { user, loading } = useAuth();

  const [dreamers, setDreamers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [dreamerFilter, setDreamerFilter] = useState('ALL');

  const [manualDreamerId, setManualDreamerId] = useState('owner-self');
  const [manualDreamerName, setManualDreamerName] = useState('Me');
  const [termLabel, setTermLabel] = useState('');
  const [number, setNumber] = useState('');
  const [gameType, setGameType] = useState<'cash3' | 'cash4'>('cash3');
  const [state, setState] = useState('GA');
  const [hitType, setHitType] = useState<'straight' | 'boxed'>('straight');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreamers([]);
        setItems([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [dreamerRows, memoryRows] = await Promise.all([
          listDreamers(user.uid),
          listPersonalHitMappings(user.uid),
        ]);

        setDreamers(dreamerRows);
        setItems(memoryRows);
      } catch (err) {
        console.error(err);
        setError('Could not load As They Fell Before.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredItems = useMemo(() => {
    const subset =
      dreamerFilter === 'ALL'
        ? items
        : items.filter((item: any) => item.dreamerName === dreamerFilter);

    return [...subset].sort((a: any, b: any) => {
      if ((a.hitCount || 0) !== (b.hitCount || 0)) return (b.hitCount || 0) - (a.hitCount || 0);
      if (a.termLabel !== b.termLabel) return a.termLabel.localeCompare(b.termLabel);
      return a.number.localeCompare(b.number);
    });
  }, [items, dreamerFilter]);

  async function handleManualAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!termLabel.trim() || !number.trim() || !state.trim()) {
      setError('Please complete dreamer, term, number, and state.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const selectedDreamer =
        dreamers.find((d: any) => d.id === manualDreamerId) ?? null;

      const effectiveDreamerName =
        selectedDreamer?.displayName ?? manualDreamerName.trim() || 'Me';

      await upsertPersonalHitMapping(user.uid, {
        dreamerId: selectedDreamer?.id ?? 'owner-self',
        dreamerName: effectiveDreamerName,
        termLabel: termLabel.trim(),
        number: number.trim(),
        gameType,
        hitType,
        state: state.trim().toUpperCase(),
        drawTime: 'unknown',
        drawDate: makeToday(),
        sourceDreamEntryId: 'manual',
        daysFromDream: 0,
        sameDay: false,
      });

      const refreshed = await listPersonalHitMappings(user.uid);
      setItems(refreshed);

      setTermLabel('');
      setNumber('');
      setGameType('cash3');
      setState('GA');
      setHitType('straight');
      setMessage('Personal hit dictionary entry saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save personal dictionary entry.');
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
            <h1>As They Fell Before</h1>
            <p>
              Personalized hit dictionaries by dreamer. Only proven numbers live here.
            </p>
          </div>
        </section>

        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
            <Plus size={18} />
            <strong>Manual Add to Personal Dictionary</strong>
          </div>

          <form onSubmit={handleManualAdd} style={{ display: 'grid', gap: '14px' }}>
            <div>
              <label className="journal-label">Dreamer</label>
              <select className="journal-select" value={manualDreamerId} onChange={e => setManualDreamerId(e.target.value)}>
                <option value="owner-self">Me / Owner Journal</option>
                {dreamers.map((dreamer: any) => (
                  <option key={dreamer.id} value={dreamer.id}>
                    {dreamer.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="journal-label">Term</label>
              <input className="journal-input" value={termLabel} onChange={e => setTermLabel(e.target.value)} placeholder="cat" />
            </div>

            <div>
              <label className="journal-label">Number</label>
              <input className="journal-input" value={number} onChange={e => setNumber(e.target.value)} placeholder="802" />
            </div>

            <div>
              <label className="journal-label">Game Type</label>
              <select className="journal-select" value={gameType} onChange={e => setGameType(e.target.value as 'cash3' | 'cash4')}>
                <option value="cash3">cash3</option>
                <option value="cash4">cash4</option>
              </select>
            </div>

            <div>
              <label className="journal-label">State</label>
              <input className="journal-input" value={state} onChange={e => setState(e.target.value)} placeholder="GA" />
            </div>

            <div>
              <label className="journal-label">Hit Type</label>
              <select className="journal-select" value={hitType} onChange={e => setHitType(e.target.value as 'straight' | 'boxed')}>
                <option value="straight">straight</option>
                <option value="boxed">boxed</option>
              </select>
            </div>

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

            <div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Personal Entry'}
              </button>
            </div>
          </form>
        </section>

        <section className="journal-card-flat">
          <label className="journal-label">Filter by Dreamer</label>
          <select className="journal-select" value={dreamerFilter} onChange={e => setDreamerFilter(e.target.value)}>
            <option value="ALL">All Dreamers</option>
            {Array.from(new Set(items.map((item: any) => item.dreamerName))).sort().map((name: any) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading personalized dictionary...</p>
          </section>
        ) : filteredItems.length === 0 ? (
          <section className="journal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
              <Sparkles size={18} />
              <strong>No proven hits yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Save hit matches or manually add proven hits to build this dictionary.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '14px' }}>
            {filteredItems.map((item: any, index: number) => (
              <article key={item.id} className="journal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                      <BookMarked size={18} />
                      <strong style={{ fontSize: '20px' }}>#{index + 1} — {item.termLabel}</strong>
                    </div>
                    <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                      Dreamer: {item.dreamerName}
                    </div>
                  </div>

                  <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                    <div className="journal-label">Rank / Hit Count</div>
                    <div style={{ fontSize: '28px', color: 'var(--deep-plum)', fontWeight: 700 }}>
                      {item.hitCount || 0}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '16px' }}>
                  <div className="journal-card-flat">
                    <div className="journal-label">Number</div>
                    <div>{item.number}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">State</div>
                    <div>{item.state}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Game</div>
                    <div>{item.gameType}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Hit Type</div>
                    <div>{item.hitType}</div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
TSX

mkdir -p src/app/playlists
cat > src/app/playlists/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listDreamers,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import { US_STATES } from '@/lib/types';

type PlaylistRow = {
  state: string;
  numbers: string[];
  terms: string[];
  score: number;
  hitCount: number;
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function PlaylistsPage() {
  const { user, loading } = useAuth();
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState('GA');
  const [dreamerFilter, setDreamerFilter] = useState('ALL');
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreamers([]);
        setMemory([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [dreamerRows, memoryRows] = await Promise.all([
          listDreamers(user.uid),
          listPersonalHitMappings(user.uid),
        ]);

        setDreamers(dreamerRows);
        setMemory(memoryRows);
      } catch (err) {
        console.error(err);
        setError('Could not load state playlists.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredMemory = useMemo(() => {
    return dreamerFilter === 'ALL'
      ? memory
      : memory.filter((row: any) => row.dreamerName === dreamerFilter);
  }, [memory, dreamerFilter]);

  const playlistMap = useMemo(() => {
    const map = new Map<string, PlaylistRow>();

    for (const state of US_STATES) {
      map.set(state, {
        state,
        numbers: [],
        terms: [],
        score: 0,
        hitCount: 0,
      });
    }

    for (const row of filteredMemory) {
      if (!map.has(row.state)) continue;
      const item = map.get(row.state)!;
      item.numbers.push(row.number);
      item.terms.push(row.termLabel);
      item.hitCount += row.hitCount || 0;
    }

    for (const item of map.values()) {
      item.numbers = unique(item.numbers).sort();
      item.terms = unique(item.terms).sort();
      item.score = item.hitCount * 10 + item.numbers.length * 4 + item.terms.length * 3;
    }

    return map;
  }, [filteredMemory]);

  const selected = playlistMap.get(selectedState);

  const rankedStates = useMemo(() => {
    return Array.from(playlistMap.values())
      .filter(item => item.hitCount > 0 || item.numbers.length > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.state.localeCompare(b.state);
      });
  }, [playlistMap]);

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
            <h1>State Specific Playlists</h1>
            <p>
              Built from proven hit history only. This is where playable state lists should come from.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading playlists...</p>
          </section>
        ) : error ? (
          <section className="journal-card" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div>
                  <label className="journal-label">Dreamer Filter</label>
                  <select className="journal-select" value={dreamerFilter} onChange={e => setDreamerFilter(e.target.value)}>
                    <option value="ALL">All Dreamers</option>
                    {dreamers.map((dreamer: any) => (
                      <option key={dreamer.id} value={dreamer.displayName}>
                        {dreamer.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="journal-label">State</label>
                  <select className="journal-select" value={selectedState} onChange={e => setSelectedState(e.target.value)}>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {selected ? (
              <section className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--deep-plum)' }}>
                  <MapPinned size={18} />
                  <strong style={{ fontSize: '22px' }}>{selected.state} Proven Playlist</strong>
                </div>

                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                  <div className="journal-card-flat">
                    <div className="journal-label">Hit Count</div>
                    <div>{selected.hitCount}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Playlist Score</div>
                    <div>{selected.score}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '16px', marginTop: '18px' }}>
                  <div className="journal-card-flat">
                    <div className="journal-label">Numbers With Proven History</div>
                    <div style={{ color: 'var(--ink-light)' }}>
                      {selected.numbers.length ? selected.numbers.join(', ') : 'None'}
                    </div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Terms Connected to Hits</div>
                    <div style={{ color: 'var(--ink-light)' }}>
                      {selected.terms.length ? selected.terms.join(', ') : 'None'}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Ranked States From Proven Hit History</strong>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {rankedStates.length ? rankedStates.map(item => (
                  <div key={item.state} className="journal-card-flat">
                    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                      <div>
                        <div className="journal-label">State</div>
                        <div>{item.state}</div>
                      </div>
                      <div>
                        <div className="journal-label">Hit Count</div>
                        <div>{item.hitCount}</div>
                      </div>
                      <div>
                        <div className="journal-label">Numbers</div>
                        <div>{item.numbers.length}</div>
                      </div>
                      <div>
                        <div className="journal-label">Score</div>
                        <div>{item.score}</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    No proven state playlists yet.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
TSX

cat > src/components/layout/Sidebar.tsx <<'TSX'
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  BookOpen,
  BookText,
  BookType,
  CalendarRange,
  Download,
  Flame,
  LayoutDashboard,
  MapPinned,
  MessageCircleHeart,
  MoonStar,
  ReceiptText,
  SearchCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import GlobalChatDock from '@/components/chat/GlobalChatDock';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dreams', label: 'Dream Journal', icon: BookText },
  { href: '/dreams/new', label: 'New Dream', icon: BookOpen },
  { href: '/dreamers', label: 'Dreamers', icon: Users },
  { href: '/dictionary', label: 'Universal Dictionary', icon: BookType },
  { href: '/windows', label: 'Active Windows', icon: CalendarRange },
  { href: '/results', label: 'Results Log', icon: ReceiptText },
  { href: '/results/import', label: 'Results Import', icon: Download },
  { href: '/hits', label: 'Hit Scanner', icon: SearchCheck },
  { href: '/fell-before', label: 'As They Fell Before', icon: BookMarked },
  { href: '/hot-numbers', label: 'Hot Families', icon: Flame },
  { href: '/playlists', label: 'State Playlists', icon: MapPinned },
  { href: '/universal-scope', label: 'Universal Scope', icon: Sparkles },
  { href: '/chat', label: 'Chat', icon: MessageCircleHeart },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '280px',
        minHeight: '100vh',
        padding: '24px 18px',
        borderRight: '1px solid var(--border-muted)',
        background:
          'linear-gradient(180deg, rgba(250,247,242,0.98) 0%, rgba(242,237,228,0.95) 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div className="journal-card-flat">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <MoonStar size={22} color="var(--deep-plum)" />
          <div>
            <div style={{ fontSize: '24px', fontStyle: 'italic', color: 'var(--deep-plum)', lineHeight: 1 }}>
              Sweet404Peaches
            </div>
            <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', marginTop: '6px' }}>
              Where Dreams Leave Numbers
            </div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink-light)', lineHeight: 1.5 }}>
          Your private dream journal for symbols, numbers, synchronicity, and future tracking.
        </p>
      </div>

      <nav className="journal-card-flat" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '4px' }}>
          Journal Navigation
        </div>

        {navItems.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderRadius: '12px',
                padding: '12px 14px',
                border: active ? '1px solid rgba(201,168,76,0.55)' : '1px solid transparent',
                background: active ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.55)',
                color: active ? 'var(--deep-plum)' : 'var(--ink)',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <GlobalChatDock />

      <div className="journal-card-flat" style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--deep-plum)' }}>
          <Sparkles size={16} />
          <strong>Current Build Phase</strong>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink-light)', lineHeight: 1.5 }}>
          Dictionary and journal cleanup are ready. The next step would be deeper ranking and better dreamer-scoped forecasting.
        </p>
      </div>
    </aside>
  );
}
TSX

echo "Dictionary system batch complete."
echo "Backups saved to: $BACKUP_DIR"
