#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/firebase"
mkdir -p "$BACKUP_DIR/src/app/dictionary"
mkdir -p "$BACKUP_DIR/src/app/fell-before"

[ -f src/lib/firebase/firestore.ts ] && cp src/lib/firebase/firestore.ts "$BACKUP_DIR/src/lib/firebase/firestore.ts.bak"
[ -f src/app/dictionary/page.tsx ] && cp src/app/dictionary/page.tsx "$BACKUP_DIR/src/app/dictionary/page.tsx.bak"
[ -f src/app/fell-before/page.tsx ] && cp src/app/fell-before/page.tsx "$BACKUP_DIR/src/app/fell-before/page.tsx.bak"

python3 - <<'PY'
from pathlib import Path
import re

p = Path("src/lib/firebase/firestore.ts")
text = p.read_text()

# Ensure COLLECTIONS.termNumberMappings exists
if "termNumberMappings" not in text:
    m = re.search(r"const COLLECTIONS\s*=\s*\{", text)
    if not m:
        raise SystemExit("Could not find COLLECTIONS in firestore.ts")
    insert_pos = m.end()
    text = text[:insert_pos] + "\n  termNumberMappings: 'termNumberMappings'," + text[insert_pos:]

# Ensure helpers exist
if "export async function listTermNumberMappings" not in text:
    text += """

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

p.write_text(text)
print("Patched firestore.ts successfully.")
PY

mkdir -p src/app/dictionary
cat > src/app/dictionary/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookType, Plus, Sparkles, Upload } from 'lucide-react';
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

function parseUniversalBatch(raw: string) {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const rows: Array<{
    termLabel: string;
    number: string;
    gameType: 'cash3' | 'cash4';
    note: string;
  }> = [];

  for (const line of lines) {
    const parts = line.includes('\t')
      ? line.split('\t').map(p => p.trim())
      : line.includes('|')
      ? line.split('|').map(p => p.trim())
      : line.split(',').map(p => p.trim());

    if (parts.length < 3) continue;

    const [termLabel, number, gameTypeRaw, noteRaw] = parts;
    const gameType =
      gameTypeRaw?.toLowerCase() === 'cash4' ? 'cash4' : 'cash3';

    if (!termLabel || !number) continue;

    rows.push({
      termLabel,
      number,
      gameType,
      note: noteRaw || '',
    });
  }

  return rows;
}

export default function DictionaryPage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [manualRows, setManualRows] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [termLabel, setTermLabel] = useState('');
  const [number, setNumber] = useState('');
  const [gameType, setGameType] = useState<'cash3' | 'cash4'>('cash3');
  const [note, setNote] = useState('');
  const [batchText, setBatchText] = useState('');

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

  async function refreshManualRows() {
    if (!user) return;
    const refreshed = await listTermNumberMappings(user.uid);
    setManualRows(refreshed);
  }

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

      await refreshManualRows();

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

  async function handleBatchAdd() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    const rows = parseUniversalBatch(batchText);
    if (!rows.length) {
      setError('No valid batch rows found.');
      return;
    }

    setBatchSaving(true);
    setError('');
    setMessage('');

    try {
      for (const row of rows) {
        await createTermNumberMapping(user.uid, {
          termLabel: row.termLabel,
          number: row.number,
          gameType: row.gameType,
          source: 'manual',
          confidenceBasis: row.note,
          rawContext: row.note,
        });
      }

      await refreshManualRows();
      setBatchText('');
      setMessage(`Saved ${rows.length} universal dictionary row(s).`);
    } catch (err) {
      console.error(err);
      setError('Could not save universal batch upload.');
    } finally {
      setBatchSaving(false);
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
              Auto-built from uploaded dreams and parsed mappings, with single and batch manual add support.
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
              <input className="journal-input" value={termLabel} onChange={e => setTermLabel(e.target.value)} placeholder="cat, car, mother..." />
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
              <input className="journal-input" value={note} onChange={e => setNote(e.target.value)} placeholder="optional note about source" />
            </div>

            <div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Dictionary Entry'}
              </button>
            </div>
          </form>
        </section>

        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
            <Upload size={18} />
            <strong>Batch Add</strong>
          </div>

          <p style={{ marginTop: 0, color: 'var(--ink-light)' }}>
            One row per line: <strong>term,number,gameType,note(optional)</strong>
          </p>

          <textarea
            className="journal-textarea"
            rows={8}
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            placeholder={'cat,802,cash3,paper journal\ncar,2915,cash4,old notebook'}
          />

          <div style={{ marginTop: '12px' }}>
            <button type="button" className="btn-primary" onClick={handleBatchAdd} disabled={batchSaving}>
              {batchSaving ? 'Saving Batch...' : 'Save Batch Upload'}
            </button>
          </div>
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
import { BookMarked, Plus, Sparkles, Upload } from 'lucide-react';
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

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function parsePersonalBatch(raw: string) {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const rows: Array<{
    dreamerName: string;
    termLabel: string;
    number: string;
    gameType: 'cash3' | 'cash4';
    state: string;
    hitType: 'straight' | 'boxed';
    count: number;
  }> = [];

  for (const line of lines) {
    const parts = line.includes('\t')
      ? line.split('\t').map(p => p.trim())
      : line.includes('|')
      ? line.split('|').map(p => p.trim())
      : line.split(',').map(p => p.trim());

    if (parts.length < 6) continue;

    const [dreamerName, termLabel, number, gameTypeRaw, state, hitTypeRaw, countRaw] = parts;

    rows.push({
      dreamerName,
      termLabel,
      number,
      gameType: gameTypeRaw?.toLowerCase() === 'cash4' ? 'cash4' : 'cash3',
      state: (state || 'GA').toUpperCase(),
      hitType: hitTypeRaw?.toLowerCase() === 'boxed' ? 'boxed' : 'straight',
      count: Math.max(1, Number(countRaw || 1) || 1),
    });
  }

  return rows;
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

  const [batchText, setBatchText] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);

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

  const groupedItems = useMemo(() => {
    const subset =
      dreamerFilter === 'ALL'
        ? items
        : items.filter((item: any) => item.dreamerName === dreamerFilter);

    const groups = new Map<string, any[]>();

    for (const item of subset) {
      if (!groups.has(item.dreamerName)) {
        groups.set(item.dreamerName, []);
      }
      groups.get(item.dreamerName)!.push(item);
    }

    return Array.from(groups.entries())
      .map(([dreamerName, rows]) => ({
        dreamerName,
        rows: [...rows].sort((a: any, b: any) => {
          if ((a.hitCount || 0) !== (b.hitCount || 0)) return (b.hitCount || 0) - (a.hitCount || 0);
          if (a.termLabel !== b.termLabel) return a.termLabel.localeCompare(b.termLabel);
          return a.number.localeCompare(b.number);
        }),
      }))
      .sort((a, b) => a.dreamerName.localeCompare(b.dreamerName));
  }, [items, dreamerFilter]);

  async function refreshItems() {
    if (!user) return;
    const refreshed = await listPersonalHitMappings(user.uid);
    setItems(refreshed);
  }

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
        (selectedDreamer?.displayName ?? manualDreamerName.trim()) || 'Me';

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

      await refreshItems();

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

  async function handleBatchAdd() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    const rows = parsePersonalBatch(batchText);
    if (!rows.length) {
      setError('No valid batch rows found.');
      return;
    }

    setBatchSaving(true);
    setError('');
    setMessage('');

    try {
      for (const row of rows) {
        const matchedDreamer =
          dreamers.find((d: any) =>
            d.displayName.toLowerCase() === row.dreamerName.toLowerCase() ||
            (d.alias && d.alias.toLowerCase() === row.dreamerName.toLowerCase())
          ) ?? null;

        const effectiveDreamerId = matchedDreamer?.id ?? 'owner-self';
        const effectiveDreamerName = matchedDreamer?.displayName ?? row.dreamerName;

        for (let i = 0; i < row.count; i += 1) {
          await upsertPersonalHitMapping(user.uid, {
            dreamerId: effectiveDreamerId,
            dreamerName: effectiveDreamerName,
            termLabel: row.termLabel,
            number: row.number,
            gameType: row.gameType,
            hitType: row.hitType,
            state: row.state,
            drawTime: 'unknown',
            drawDate: makeToday(),
            sourceDreamEntryId: 'manual-batch',
            daysFromDream: 0,
            sameDay: false,
          });
        }
      }

      await refreshItems();
      setBatchText('');
      setMessage(`Saved ${rows.length} personal dictionary batch row(s).`);
    } catch (err) {
      console.error(err);
      setError('Could not save personal dictionary batch upload.');
    } finally {
      setBatchSaving(false);
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
              Personalized dream dictionaries by dreamer. Only proven numbers that actually hit belong here.
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

            <div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Personal Entry'}
              </button>
            </div>
          </form>
        </section>

        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
            <Upload size={18} />
            <strong>Batch Add to Personal Dictionary</strong>
          </div>

          <p style={{ marginTop: 0, color: 'var(--ink-light)' }}>
            One row per line: <strong>dreamer,term,number,gameType,state,hitType,count(optional)</strong>
          </p>

          <textarea
            className="journal-textarea"
            rows={8}
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            placeholder={'Jamala,car,802,cash3,GA,boxed,4\nMama,cat,123,cash3,SC,straight,2'}
          />

          <div style={{ marginTop: '12px' }}>
            <button type="button" className="btn-primary" onClick={handleBatchAdd} disabled={batchSaving}>
              {batchSaving ? 'Saving Batch...' : 'Save Batch Upload'}
            </button>
          </div>
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

        <section className="journal-card-flat">
          <label className="journal-label">Filter by Dreamer</label>
          <select className="journal-select" value={dreamerFilter} onChange={e => setDreamerFilter(e.target.value)}>
            <option value="ALL">All Dreamers</option>
            {unique(items.map((item: any) => item.dreamerName)).sort().map((name: any) => (
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
        ) : groupedItems.length === 0 ? (
          <section className="journal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
              <Sparkles size={18} />
              <strong>No proven hits yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Save hit matches or batch upload older proven hits to build this dreamer dictionary.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '20px' }}>
            {groupedItems.map(group => (
              <article key={group.dreamerName} className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '16px' }}>
                  <BookMarked size={18} />
                  <strong style={{ fontSize: '22px' }}>{group.dreamerName} Dictionary</strong>
                </div>

                <div style={{ display: 'grid', gap: '14px' }}>
                  {group.rows.map((item: any, index: number) => (
                    <div key={item.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '18px', marginBottom: '8px' }}>
                            #{index + 1} — {item.termLabel}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Number: {item.number}
                          </div>
                        </div>

                        <div className="journal-card-flat" style={{ minWidth: '140px', textAlign: 'center' }}>
                          <div className="journal-label">Rank / Hits</div>
                          <div style={{ fontSize: '26px', color: 'var(--deep-plum)', fontWeight: 700 }}>
                            {item.hitCount || 0}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '14px' }}>
                        <div>
                          <div className="journal-label">State</div>
                          <div>{item.state}</div>
                        </div>

                        <div>
                          <div className="journal-label">Game</div>
                          <div>{item.gameType}</div>
                        </div>

                        <div>
                          <div className="journal-label">Hit Type</div>
                          <div>{item.hitType}</div>
                        </div>
                      </div>
                    </div>
                  ))}
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

echo "Dictionary fixes batch complete."
echo "Backups saved to: $BACKUP_DIR"
