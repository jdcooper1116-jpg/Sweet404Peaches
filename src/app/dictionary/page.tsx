'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookType, Plus, Upload, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type RawTermRow = {
  id: string; ownerUid: string; termLabel: string; normalizedTerm: string;
  number: string; gameType: string; source: string; dreamerId: string;
  dreamerName: string; dreamDate: string; sourceDreamEntryId: string;
  backtestDreamId: string; hasHit: boolean; hitCount: number;
  createdAt: string | null; updatedAt: string | null;
};

// One card per term (+ dreamerId scope)
type TermCard = {
  cardKey: string; termLabel: string; dreamerId: string; dreamerName: string;
  cash3: string[]; cash4: string[];
  hasHit: boolean; totalHitCount: number;
  sources: string[]; dreamDates: string[]; mappingCount: number;
};

type DreamerOption = { id: string; displayName: string };

// ─── Group raw rows into TermCards ────────────────────────────────────────────

function buildTermCards(rows: RawTermRow[]): TermCard[] {
  const map = new Map<string, TermCard>();
  for (const row of rows) {
    const key = (row.dreamerId || '') + '::' + (row.termLabel || '').trim().toLowerCase();
    let card = map.get(key);
    if (!card) {
      card = {
        cardKey: key, termLabel: row.termLabel || '',
        dreamerId: row.dreamerId || '', dreamerName: row.dreamerName || '',
        cash3: [], cash4: [], hasHit: false, totalHitCount: 0,
        sources: [], dreamDates: [], mappingCount: 0,
      };
      map.set(key, card);
    }
    const num = String(row.number ?? '').trim();
    if (num) {
      if (row.gameType === 'cash4') { if (!card.cash4.includes(num)) card.cash4.push(num); }
      else                          { if (!card.cash3.includes(num)) card.cash3.push(num); }
    }
    if (row.hasHit)   card.hasHit = true;
    if (row.hitCount) card.totalHitCount += row.hitCount;
    if (row.source    && !card.sources.includes(row.source))       card.sources.push(row.source);
    if (row.dreamDate && !card.dreamDates.includes(row.dreamDate)) card.dreamDates.push(row.dreamDate);
    card.mappingCount++;
  }
  return Array.from(map.values())
    .map(c => ({ ...c, cash3: [...c.cash3].sort(), cash4: [...c.cash4].sort() }))
    .sort((a, b) => a.termLabel.localeCompare(b.termLabel));
}

// ─── Alphabetisation helpers ──────────────────────────────────────────────────

function termFirstLetter(term: string): string {
  const ch = term.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
}

function slugifyTerm(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}


// ─── Batch parser (dual-format) ───────────────────────────────────────────────

type BatchRow = { termLabel: string; number: string; gameType: 'cash3'|'cash4'; note: string };

type ParsedBatchResult = {
  rows:           BatchRow[];   // valid, deduped
  termCount:      number;
  cash3Count:     number;
  cash4Count:     number;
  invalidSkipped: number;
  invalidTokens:  string[];
};

// Headings like "A–C", "D–H", "O–Z" or "A", "B" alone on a line — skip
const HEADING_RE = /^[A-Z](\s*[–\-]\s*[A-Z])?[.\s]*$/;

// A separator in dreambook format: —  or  -  surrounded by optional spaces
const DB_SEP_RE  = /^(.*?)\s*[—\-–:]\s*(.+)$/;

function parseBatch(text: string): ParsedBatchResult {
  const seenKeys  = new Set<string>();
  const rows:      BatchRow[]  = [];
  const badTokens: string[]    = [];
  let invalidSkipped = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (HEADING_RE.test(line)) continue;   // skip section headings

    // ── Format A: dreambook   term — n, n, n  ────────────────────────────────
    const dbMatch = DB_SEP_RE.exec(line);

    // Distinguish Format B (CSV) from Format A:
    //   If the line has 3+ comma-parts and part[1] looks purely numeric → CSV
    const csvParts  = line.split(',').map(p => p.trim());
    // CSV requires field[2] to be exactly 'cash3' or 'cash4' — prevents dreambook
    // lines ("yard — 366, 360, …") from being misrouted because field[1] looks numeric.
    const looksCSV  = csvParts.length >= 3 && /^\d+$/.test(csvParts[1]) && /^cash[34]$/.test(csvParts[2]);

    if (!looksCSV && dbMatch) {
      // ── Format A ────────────────────────────────────────────────────────────
      const termLabel = dbMatch[1].trim();
      if (!termLabel) continue;

      const numberPart = dbMatch[2];
      const tokens     = numberPart.split(/[\s,;\/]+/).map(t => t.trim()).filter(Boolean);

      for (const tok of tokens) {
        if (/^\d{3}$/.test(tok)) {
          const key = termLabel.toLowerCase() + '::' + tok + '::cash3';
          if (!seenKeys.has(key)) { seenKeys.add(key); rows.push({ termLabel, number: tok, gameType: 'cash3', note: '' }); }
        } else if (/^\d{4}$/.test(tok)) {
          const key = termLabel.toLowerCase() + '::' + tok + '::cash4';
          if (!seenKeys.has(key)) { seenKeys.add(key); rows.push({ termLabel, number: tok, gameType: 'cash4', note: '' }); }
        } else {
          // Ignore tokens that are clearly part of the term description
          if (/\d/.test(tok)) { invalidSkipped++; badTokens.push(tok); }
        }
      }
    } else if (looksCSV) {
      // ── Format B: term,number,gameType[,note] ───────────────────────────────
      const [tl, num, gt, note = ''] = csvParts;
      if (!tl || !num) continue;
      const gameType: 'cash3'|'cash4' = gt === 'cash4' ? 'cash4' : 'cash3';
      const key = tl.toLowerCase() + '::' + num + '::' + gameType;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        rows.push({ termLabel: tl, number: num, gameType, note });
      }
    }
  }

  const termCount  = new Set(rows.map(r => r.termLabel.toLowerCase())).size;
  const cash3Count = rows.filter(r => r.gameType === 'cash3').length;
  const cash4Count = rows.filter(r => r.gameType === 'cash4').length;

  return { rows, termCount, cash3Count, cash4Count, invalidSkipped, invalidTokens: [...new Set(badTokens)] };
}

function srcLabel(s: string) {
  if (s === 'parsed')                  return 'Dream Parse';
  if (s === 'manual')                  return 'Manual';
  if (s === 'historical-dream-intake') return 'Historical Intake';
  if (s === 'dreambook')               return 'Dreambook';
  return s || '—';
}

// ─── Number chip ──────────────────────────────────────────────────────────────

function NumberChip({ n, game }: { n: string; game: 'cash3'|'cash4' }) {
  const isC3 = game === 'cash3';
  return (
    <span style={{
      fontFamily: 'monospace', fontWeight: 700, fontSize: '14px',
      background:   isC3 ? 'rgba(255,107,74,0.16)' : 'rgba(160,144,255,0.16)',
      border:       `1px solid ${isC3 ? 'rgba(255,107,74,0.32)' : 'rgba(160,144,255,0.32)'}`,
      color:        isC3 ? '#ff8a6a' : '#a090ff',
      borderRadius: '8px', padding: '4px 10px', letterSpacing: '0.06em',
    }}>{n}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DictionaryPage() {
  const { user } = useAuth();

  const [rawRows,  setRawRows]  = useState<RawTermRow[]>([]);
  const [dreamers, setDreamers] = useState<DreamerOption[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [selectedDreamerId, setSelectedDreamerId] = useState('');
  const [searchTerm,        setSearchTerm]        = useState('');
  const [searchNumber,      setSearchNumber]      = useState('');
  const [gameFilter,        setGameFilter]        = useState<'all'|'cash3'|'cash4'>('all');
  const [hitFilter,         setHitFilter]         = useState<'all'|'hit'|'nohit'>('all');

  // Manual-add form
  const [termLabel, setTermLabel] = useState('');
  const [number,    setNumber]    = useState('');
  const [gameType,  setGameType]  = useState<'cash3'|'cash4'>('cash3');
  const [note,      setNote]      = useState('');
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');
  const [saveErr,   setSaveErr]   = useState('');

  // Batch-add
  const [batchText,    setBatchText]    = useState('');
  const [batchSaving,  setBatchSaving]  = useState(false);
  const [batchMsg,     setBatchMsg]     = useState('');
  const [batchErr,     setBatchErr]     = useState('');
  const [batchPreview, setBatchPreview] = useState<ParsedBatchResult | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/dreamers?ownerUid=' + encodeURIComponent(user.uid))
      .then(r => r.json())
      .then(d => { if (d.ok) setDreamers(d.dreamers ?? []); })
      .catch(err => console.error('dreamers:', err));
  }, [user]);

  async function loadTerms(did?: string) {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const activeDid = did !== undefined ? did : selectedDreamerId;
      const qs = new URLSearchParams({ ownerUid: user.uid });
      if (activeDid) qs.set('dreamerId', activeDid);
      qs.set('includeHits', 'true');  // dictionary page needs hit enrichment
      const res  = await fetch('/api/dictionary/terms?' + qs.toString());
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      setRawRows(Array.isArray(data.terms) ? data.terms : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
      setError(isQuota
        ? 'Firebase quota exhausted. Dictionary may be incomplete. Try again later or use a dreamer filter to reduce results.'
        : msg);
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadTerms(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDreamerChange(did: string) {
    setSelectedDreamerId(did);
    void loadTerms(did);
  }

  const termCards = useMemo(() => buildTermCards(rawRows), [rawRows]);

  const filtered = useMemo(() => {
    const qt = searchTerm.trim().toLowerCase();
    const qn = searchNumber.trim();
    return termCards.filter(c => {
      if (qt && !c.termLabel.toLowerCase().includes(qt))               return false;
      if (qn && !c.cash3.some(n => n.includes(qn)) && !c.cash4.some(n => n.includes(qn))) return false;
      if (gameFilter === 'cash3' && !c.cash3.length)                   return false;
      if (gameFilter === 'cash4' && !c.cash4.length)                   return false;
      if (hitFilter  === 'hit'   && !c.hasHit)                         return false;
      if (hitFilter  === 'nohit' &&  c.hasHit)                         return false;
      return true;
    });
  }, [termCards, searchTerm, searchNumber, gameFilter, hitFilter]);

  const totalHit = termCards.filter(c => c.hasHit).length;
  const dreamerLabel = selectedDreamerId === '' ? 'All Dreamers'
    : selectedDreamerId === 'owner-self' ? 'Owner / Self'
    : dreamers.find(d => d.id === selectedDreamerId)?.displayName ?? selectedDreamerId;

  // Alphabetised view
  const filteredLetters = useMemo(() =>
    Array.from(new Set(filtered.map(c => termFirstLetter(c.termLabel)))).sort(),
  [filtered]);

  const filteredByLetter = useMemo(() => {
    const map = new Map<string, TermCard[]>();
    for (const c of filtered) {
      const l = termFirstLetter(c.termLabel);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(c);
    }
    return map;
  }, [filtered]);

  // Manual add — route untouched
  async function handleManualAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user)             { setSaveErr('Sign in required.');   return; }
    if (!termLabel.trim()) { setSaveErr('Term is required.');   return; }
    if (!number.trim())    { setSaveErr('Number is required.'); return; }
    setSaving(true); setSaveMsg(''); setSaveErr('');
    try {
      const res = await fetch('/api/dictionary/terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid: user.uid, dreamerId: selectedDreamerId || 'owner-self',
          termLabel: termLabel.trim(), number: number.trim(), gameType, source: 'manual', note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed.');
      setSaveMsg('Saved: ' + data.termLabel + ' → ' + data.number + ' (' + data.gameType + ')');
      setTermLabel(''); setNumber(''); setNote('');
      void loadTerms();
    } catch (err) { setSaveErr(err instanceof Error ? err.message : 'Could not save entry.'); }
    finally { setSaving(false); }
  }

  // Preview — parse without saving
  function handlePreviewBatch() {
    setBatchMsg(''); setBatchErr('');
    if (!batchText.trim()) { setBatchPreview(null); return; }
    const result = parseBatch(batchText);
    setBatchPreview(result);
  }

  // Save — dedup against existing rawRows, save only new rows
  async function handleBatchAdd() {
    if (!user) { setBatchErr('Sign in required.'); return; }

    const parsed = parseBatch(batchText);
    if (!parsed.rows.length) {
      setBatchErr(
        parsed.invalidSkipped > 0
          ? `No valid rows found. ${parsed.invalidSkipped} token(s) skipped: ${parsed.invalidTokens.slice(0, 5).join(', ')}`
          : 'No valid rows. Paste dreambook lines (term — 123, 456) or CSV (term,number,gameType).'
      );
      return;
    }

    // Build existing key set from loaded rawRows to skip duplicates
    const activeDid   = selectedDreamerId || 'owner-self';
    const existingKeys = new Set(
      rawRows.map(r =>
        (r.termLabel || '').toLowerCase() + '::' + (r.number || '') + '::' + (r.gameType || '') + '::' + (r.dreamerId || '')
      )
    );

    const toSave:    BatchRow[] = [];
    let duplicateSkipped = 0;
    for (const row of parsed.rows) {
      const key = row.termLabel.toLowerCase() + '::' + row.number + '::' + row.gameType + '::' + activeDid;
      if (existingKeys.has(key)) { duplicateSkipped++; }
      else                       { toSave.push(row); }
    }

    if (!toSave.length) {
      setBatchMsg(
        `All ${parsed.rows.length} row(s) already exist in the dictionary — nothing new to save.` +
        (parsed.invalidSkipped > 0 ? ` (${parsed.invalidSkipped} invalid token(s) skipped)` : '')
      );
      setBatchPreview(parsed);
      return;
    }

    setBatchSaving(true); setBatchMsg(''); setBatchErr('');
    let saved = 0; const errs: string[] = [];

    try {
      for (const row of toSave) {
        const res = await fetch('/api/dictionary/terms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerUid:  user.uid,
            dreamerId: activeDid,
            termLabel: row.termLabel,
            number:    row.number,
            gameType:  row.gameType,
            source:    'manual',
            note:      row.note,
          }),
        });
        const d = await res.json();
        if (d.ok) saved++;
        else errs.push(`${row.termLabel}/${row.number}: ${d.error}`);
      }

      const parts: string[] = [`Saved ${saved} of ${toSave.length} new row(s).`];
      if (duplicateSkipped  > 0) parts.push(`${duplicateSkipped} duplicate(s) skipped.`);
      if (parsed.invalidSkipped > 0) parts.push(`${parsed.invalidSkipped} invalid token(s) ignored.`);
      if (errs.length        > 0) parts.push(`Errors: ${errs.slice(0, 3).join('; ')}`);
      setBatchMsg(parts.join(' '));

      if (saved > 0) { setBatchText(''); setBatchPreview(null); void loadTerms(); }
    } catch (err) {
      setBatchErr(err instanceof Error ? err.message : 'Batch save failed.');
    } finally {
      setBatchSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="page-header">
            <h1>Universal Dream Dictionary</h1>
            <p>All mapped term–number relationships. Each term card shows Cash 3 and Cash 4 numbers as chips — whether or not they have hit.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/fell-before" className="btn-secondary">As They Fell Before</Link>
            <Link href="/windows"     className="btn-secondary">Active Windows</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {([
          ['Terms',      termCards.length,            '#a090ff'],
          ['With Hit',   totalHit,                    '#60e09a'],
          ['No Hit Yet', termCards.length - totalHit, 'rgba(255,255,255,0.55)'],
          ['Showing',    filtered.length,              '#ff6b4a'],
        ] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '18px', padding: '14px 18px' }}>
            <strong style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.05em', display: 'block', lineHeight: 1, color, fontFamily: 'system-ui,sans-serif' }}>{val}</strong>
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <section className="journal-card-flat" style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamerSel">Dreamer Scope</label>
            <select id="dreamerSel" className="journal-select" value={selectedDreamerId} onChange={e => handleDreamerChange(e.target.value)}>
              <option value="">All Dreamers</option>
              <option value="owner-self">Owner / Self</option>
              {dreamers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="gameFil">Game Type</label>
            <select id="gameFil" className="journal-select" value={gameFilter} onChange={e => setGameFilter(e.target.value as typeof gameFilter)}>
              <option value="all">All Games</option>
              <option value="cash3">Cash 3 only</option>
              <option value="cash4">Cash 4 only</option>
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="hitFil">Hit Status</label>
            <select id="hitFil" className="journal-select" value={hitFilter} onChange={e => setHitFilter(e.target.value as typeof hitFilter)}>
              <option value="all">All</option>
              <option value="hit">Has Hit Memory</option>
              <option value="nohit">No Hit Yet</option>
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="stSearch">Search Term</label>
            <input id="stSearch" className="journal-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="car, sister, ocean…" />
          </div>
          <div>
            <label className="journal-label" htmlFor="snSearch">Search Number</label>
            <input id="snSearch" className="journal-input" value={searchNumber} onChange={e => setSearchNumber(e.target.value)} placeholder="089, 856…" style={{ fontFamily: 'monospace' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
            Scope: <strong style={{ color: 'rgba(255,255,255,0.65)', marginLeft: '5px' }}>{dreamerLabel}</strong>
          </div>
        </div>
      </section>

      {/* Manual add */}
      <section className="journal-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: '#a090ff' }}>
          <Plus size={18} strokeWidth={1.8} />
          <strong style={{ fontFamily: 'system-ui,sans-serif', fontWeight: 800 }}>Manual Add</strong>
        </div>
        <form onSubmit={handleManualAdd} style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))' }}>
            <div>
              <label className="journal-label">Term</label>
              <input className="journal-input" value={termLabel} onChange={e => setTermLabel(e.target.value)} placeholder="ocean, car…" />
            </div>
            <div>
              <label className="journal-label">Number</label>
              <input className="journal-input" value={number} onChange={e => setNumber(e.target.value)} placeholder="089" style={{ fontFamily: 'monospace' }} />
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)', marginTop: '3px' }}>Leading zeros preserved</div>
            </div>
            <div>
              <label className="journal-label">Game</label>
              <select className="journal-select" value={gameType} onChange={e => setGameType(e.target.value as 'cash3'|'cash4')}>
                <option value="cash3">Cash 3</option>
                <option value="cash4">Cash 4</option>
              </select>
            </div>
            <div>
              <label className="journal-label">Note</label>
              <input className="journal-input" value={note} onChange={e => setNote(e.target.value)} placeholder="optional" />
            </div>
          </div>
          {saveMsg && <div style={{ padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(96,224,154,0.28)', background: 'rgba(96,224,154,0.08)', color: '#60e09a', fontSize: '13px' }}>{saveMsg}</div>}
          {saveErr && <div style={{ padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090', fontSize: '13px' }}>{saveErr}</div>}
          <button type="submit" className="btn-primary" disabled={saving} style={{ width: 'fit-content' }}>
            {saving ? 'Saving…' : 'Save Dictionary Entry'}
          </button>
        </form>
      </section>

      {/* Batch add */}
      <section className="journal-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#a090ff' }}>
          <Upload size={18} strokeWidth={1.8} />
          <strong style={{ fontFamily: 'system-ui,sans-serif', fontWeight: 800 }}>Batch Add</strong>
        </div>

        {/* Format hints */}
        <div style={{ display: 'grid', gap: '6px', marginBottom: '12px', fontSize: '12px' }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>
            Accepted formats
          </div>
          <div style={{ display: 'grid', gap: '4px' }}>
            <code style={{ background: 'rgba(255,255,255,0.07)', padding: '4px 8px', borderRadius: 6, fontSize: '12px', fontFamily: 'monospace', color: '#ff8a6a' }}>
              yard / birds in yard cluster — 366, 360, 015, 0187, 1875
            </code>
            <code style={{ background: 'rgba(255,255,255,0.07)', padding: '4px 8px', borderRadius: 6, fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.50)' }}>
              ocean,089,cash3,note  ← legacy CSV also works
            </code>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: '11px', lineHeight: 1.6 }}>
            3-digit tokens → Cash 3 · 4-digit tokens → Cash 4 · leading zeros preserved · section headings (A–Z) ignored
          </div>
        </div>

        <textarea
          className="journal-textarea"
          rows={7}
          value={batchText}
          onChange={e => { setBatchText(e.target.value); setBatchPreview(null); setBatchMsg(''); setBatchErr(''); }}
          placeholder={'yard / birds in yard cluster — 366, 360, 281, 015, 0187, 1875\nyellow — 801, 135, 372, 306, 700, 3406, 4519\nzoo — 708, 612, 329, 840, 8351'}
          style={{ fontFamily: 'monospace', fontSize: '13px' }}
        />

        {/* Preview panel — shown after Parse click */}
        {batchPreview && (
          <div style={{ marginTop: '10px', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', display: 'grid', gap: '10px' }}>
            <div style={{ fontWeight: 800, fontSize: '12px', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>
              Preview
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {([
                [`${batchPreview.termCount} term${batchPreview.termCount !== 1 ? 's' : ''}`,  '#a090ff'],
                [`${batchPreview.cash3Count} Cash 3`,                                          '#ff8a6a'],
                [`${batchPreview.cash4Count} Cash 4`,                                          '#a090ff'],
                [`${batchPreview.rows.length} total rows`,                                     '#60e09a'],
              ] as [string, string][]).map(([label, color]) => (
                <span key={label} style={{ padding: '4px 11px', borderRadius: '999px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: '12px', fontWeight: 700, color, fontFamily: 'system-ui,sans-serif' }}>
                  {label}
                </span>
              ))}
              {batchPreview.invalidSkipped > 0 && (
                <span style={{ padding: '4px 11px', borderRadius: '999px', background: 'rgba(255,204,80,0.12)', border: '1px solid rgba(255,204,80,0.28)', fontSize: '12px', fontWeight: 700, color: '#ffcc50', fontFamily: 'system-ui,sans-serif' }}>
                  {batchPreview.invalidSkipped} invalid skipped
                </span>
              )}
            </div>
            {batchPreview.invalidTokens.length > 0 && (
              <div style={{ fontSize: '11px', color: 'rgba(255,204,80,0.70)', fontFamily: 'monospace' }}>
                Ignored: {batchPreview.invalidTokens.slice(0, 8).join(', ')}{batchPreview.invalidTokens.length > 8 ? ` +${batchPreview.invalidTokens.length - 8} more` : ''}
              </div>
            )}
            {batchPreview.rows.length === 0 && (
              <div style={{ fontSize: '12px', color: '#ff9090' }}>No valid rows found — check format.</div>
            )}
          </div>
        )}

        {batchMsg && <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(96,224,154,0.28)', background: 'rgba(96,224,154,0.08)', color: '#60e09a', fontSize: '13px' }}>{batchMsg}</div>}
        {batchErr && <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090', fontSize: '13px' }}>{batchErr}</div>}

        <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary"
            onClick={handlePreviewBatch}
            disabled={!batchText.trim()}
            style={{ minHeight: '40px' }}>
            Preview Parse
          </button>
          <button type="button" className="btn-primary"
            onClick={handleBatchAdd}
            disabled={batchSaving || !batchText.trim()}
            style={{ minHeight: '40px' }}>
            {batchSaving
              ? 'Saving…'
              : batchPreview && batchPreview.rows.length > 0
                ? `Save ${batchPreview.rows.length} Row${batchPreview.rows.length !== 1 ? 's' : ''}`
                : 'Save Batch Upload'}
          </button>
        </div>
      </section>

      {/* State */}
      {loading && <section className="journal-card"><p style={{ margin: 0, color: 'rgba(255,255,255,0.55)' }}>Loading dictionary…</p></section>}
      {!loading && error && <div style={{ padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>{error}</div>}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#a090ff' }}>
            <Sparkles size={18} />
            <strong>{termCards.length === 0 ? 'No dictionary terms yet' : 'No matches for current filters'}</strong>
          </div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.50)' }}>
            {termCards.length === 0 ? 'Parse a dream or add manual entries to populate the dictionary.' : 'Try broadening search or clearing filters.'}
          </p>
        </section>
      )}

      {/* A–Z jump strip — only shown when no filters shrink to single letter */}
      {!loading && !error && filteredLetters.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {filteredLetters.map(l => (
            <a key={l} href={`#dict-${l}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#a090ff', fontWeight: 800, fontSize: '13px', textDecoration: 'none',
                fontFamily: 'system-ui,sans-serif',
              }}
            >{l}</a>
          ))}
        </div>
      )}

      {/* Alphabetised dictionary */}
      {!loading && !error && filteredLetters.length > 0 && filteredLetters.map(letter => {
        const letterCards = (filteredByLetter.get(letter) ?? [])
          .slice()
          .sort((a, b) => a.termLabel.localeCompare(b.termLabel));
        if (!letterCards.length) return null;

        return (
          <section key={letter} id={`dict-${letter}`} style={{ display: 'grid', gap: '2px' }}>

            {/* Letter heading — coordinates with As They Fell Before */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '10px' }}>
              <span style={{
                fontSize: 'clamp(2.2rem,4vw,3.6rem)', fontWeight: 900,
                letterSpacing: '-0.06em', lineHeight: 1,
                color: '#a090ff', fontFamily: 'system-ui,sans-serif',
              }}>{letter}</span>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
                {letterCards.length} term{letterCards.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Term entries */}
            <div style={{ display: 'grid', gap: '10px' }}>
              {letterCards.map(card => (
                <article
                  key={card.cardKey}
                  id={`term-${slugifyTerm(card.termLabel)}`}
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: `1px solid ${card.hasHit ? 'rgba(96,224,154,0.22)' : 'rgba(255,255,255,0.09)'}`,
                    borderLeft: `3px solid ${card.hasHit ? '#60e09a' : 'rgba(255,255,255,0.10)'}`,
                    borderRadius: '16px',
                    padding: '16px 18px',
                    display: 'grid',
                    gap: '10px',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  {/* Term word + badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <strong style={{
                        fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.02em',
                        fontFamily: 'system-ui,sans-serif', color: '#ffffff',
                      }}>
                        {card.termLabel}
                      </strong>
                      {card.dreamerName && selectedDreamerId === '' && (
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'rgba(160,144,255,0.12)', border: '1px solid rgba(160,144,255,0.22)',
                          color: '#a090ff',
                        }}>{card.dreamerName}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      {card.hasHit
                        ? <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(96,224,154,0.14)', border: '1px solid rgba(96,224,154,0.28)', color: '#60e09a', fontFamily: 'system-ui,sans-serif' }}>✓ Hit</span>
                        : <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.30)', fontFamily: 'system-ui,sans-serif' }}>No hit yet</span>
                      }
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', fontFamily: 'system-ui,sans-serif' }}>
                        {(card.cash3.length + card.cash4.length)} num{(card.cash3.length + card.cash4.length) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Cash 3 row */}
                  {card.cash3.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 800, color: '#ff6b4a',
                        textTransform: 'uppercase', letterSpacing: '0.10em',
                        fontFamily: 'system-ui,sans-serif', minWidth: '48px', flexShrink: 0,
                      }}>Cash 3</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {card.cash3.map(n => <NumberChip key={n} n={n} game="cash3" />)}
                      </div>
                    </div>
                  )}

                  {/* Cash 4 row */}
                  {card.cash4.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 800, color: '#a090ff',
                        textTransform: 'uppercase', letterSpacing: '0.10em',
                        fontFamily: 'system-ui,sans-serif', minWidth: '48px', flexShrink: 0,
                      }}>Cash 4</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {card.cash4.map(n => <NumberChip key={n} n={n} game="cash4" />)}
                      </div>
                    </div>
                  )}

                  {/* Meta — sources / dates in muted footer */}
                  {(card.sources.length > 0 || card.dreamDates.length > 0) && (
                    <div style={{
                      display: 'flex', gap: '14px', flexWrap: 'wrap',
                      fontSize: '11px', color: 'rgba(255,255,255,0.28)',
                      borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px',
                    }}>
                      {card.sources.length > 0 && (
                        <span>{card.sources.map(srcLabel).join(' · ')}</span>
                      )}
                      {card.dreamDates.length > 0 && (
                        <span>
                          {card.dreamDates.slice().sort().slice(0, 2).join(', ')}
                          {card.dreamDates.length > 2 ? ` +${card.dreamDates.length - 2} more` : ''}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}

    </div>
  );
}
