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
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
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
