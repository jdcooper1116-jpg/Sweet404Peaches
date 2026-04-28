'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookType, Plus, Upload, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type RawTermRow = {
  id:                 string;
  ownerUid:           string;
  termLabel:          string;
  normalizedTerm:     string;
  number:             string;
  gameType:           string;
  source:             string;
  dreamerId:          string;
  dreamerName:        string;
  dreamDate:          string;
  sourceDreamEntryId: string;
  backtestDreamId:    string;
  hasHit:             boolean;
  hitCount:           number;
  createdAt:          string | null;
  updatedAt:          string | null;
};

type GroupedRow = {
  groupKey:     string;
  termLabel:    string;
  number:       string;
  gameType:     string;
  dreamerId:    string;
  dreamerName:  string;
  hasHit:       boolean;
  hitCount:     number;
  mappingCount: number;
  sources:      string[];
  dreamDates:   string[];
  sourceDocIds: string[];
};

type DreamerOption = { id: string; displayName: string };

// ─── Group helper ─────────────────────────────────────────────────────────────

function groupRows(rows: RawTermRow[]): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  for (const row of rows) {
    const key = row.dreamerId + '::' + row.termLabel + '::' + row.number + '::' + row.gameType;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        groupKey:     key,
        termLabel:    row.termLabel,
        number:       row.number,
        gameType:     row.gameType,
        dreamerId:    row.dreamerId,
        dreamerName:  row.dreamerName,
        hasHit:       row.hasHit,
        hitCount:     row.hitCount,
        mappingCount: 1,
        sources:      row.source    ? [row.source]    : [],
        dreamDates:   row.dreamDate ? [row.dreamDate] : [],
        sourceDocIds: [row.id],
      });
    } else {
      g.mappingCount++;
      if (row.hasHit) g.hasHit = true;
      if (row.hitCount > g.hitCount) g.hitCount = row.hitCount;
      if (row.source    && !g.sources.includes(row.source))       g.sources.push(row.source);
      if (row.dreamDate && !g.dreamDates.includes(row.dreamDate)) g.dreamDates.push(row.dreamDate);
      g.sourceDocIds.push(row.id);
    }
  }
  return Array.from(map.values());
}

// ─── Batch parser ─────────────────────────────────────────────────────────────

type BatchRow = { termLabel: string; number: string; gameType: 'cash3' | 'cash4'; note: string };

function parseBatch(text: string): BatchRow[] {
  const rows: BatchRow[] = [];
  for (const line of text.split('\n')) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 3) continue;
    const [tl, num, gt, note = ''] = parts;
    if (!tl || !num) continue;
    rows.push({ termLabel: tl, number: num, gameType: gt === 'cash4' ? 'cash4' : 'cash3', note });
  }
  return rows;
}

function srcLabel(s: string) {
  if (s === 'parsed')                  return 'Dream Parse';
  if (s === 'manual')                  return 'Manual';
  if (s === 'historical-dream-intake') return 'Historical Intake';
  if (s === 'dreambook')               return 'Dreambook';
  return s || '—';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DictionaryPage() {
  const { user } = useAuth();

  const [rawRows,  setRawRows]  = useState<RawTermRow[]>([]);
  const [dreamers, setDreamers] = useState<DreamerOption[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [selectedDreamerId, setSelectedDreamerId] = useState('');

  const [searchTerm,   setSearchTerm]   = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [gameFilter,   setGameFilter]   = useState<'all'|'cash3'|'cash4'>('all');
  const [hitFilter,    setHitFilter]    = useState<'all'|'hit'|'nohit'>('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [termLabel, setTermLabel] = useState('');
  const [number,    setNumber]    = useState('');
  const [gameType,  setGameType]  = useState<'cash3'|'cash4'>('cash3');
  const [note,      setNote]      = useState('');
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');
  const [saveErr,   setSaveErr]   = useState('');

  const [batchText,   setBatchText]   = useState('');
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchMsg,    setBatchMsg]    = useState('');
  const [batchErr,    setBatchErr]    = useState('');

  // Load dreamers
  useEffect(() => {
    if (!user) return;
    fetch('/api/dreamers?ownerUid=' + encodeURIComponent(user.uid))
      .then(r => r.json())
      .then(d => { if (d.ok) setDreamers(d.dreamers ?? []); })
      .catch(err => console.error('dreamers:', err));
  }, [user]);

  // Load terms
  async function loadTerms(did?: string) {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const activeDid = did !== undefined ? did : selectedDreamerId;
      const qs = new URLSearchParams({ ownerUid: user.uid });
      if (activeDid) qs.set('dreamerId', activeDid);
      const res  = await fetch('/api/dictionary/terms?' + qs.toString());
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      setRawRows(Array.isArray(data.terms) ? data.terms : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dictionary.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTerms(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDreamerChange(did: string) {
    setSelectedDreamerId(did);
    void loadTerms(did);
  }

  // Group + filter
  const grouped = useMemo(() => groupRows(rawRows), [rawRows]);

  const uniqueSources = useMemo(() => {
    const s = new Set<string>();
    for (const g of grouped) for (const src of g.sources) if (src) s.add(src);
    return Array.from(s).sort();
  }, [grouped]);

  const filtered = useMemo(() => {
    const qt = searchTerm.trim().toLowerCase();
    const qn = searchNumber.trim();
    return grouped.filter(g => {
      if (qt && !g.termLabel.toLowerCase().includes(qt))              return false;
      if (qn && !g.number.includes(qn))                               return false;
      if (gameFilter !== 'all' && g.gameType !== gameFilter)           return false;
      if (hitFilter  === 'hit'   && !g.hasHit)                        return false;
      if (hitFilter  === 'nohit' &&  g.hasHit)                        return false;
      if (sourceFilter !== 'all' && !g.sources.includes(sourceFilter)) return false;
      return true;
    });
  }, [grouped, searchTerm, searchNumber, gameFilter, hitFilter, sourceFilter]);

  // Manual add
  async function handleManualAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) { setSaveErr('Sign in required.'); return; }
    if (!termLabel.trim()) { setSaveErr('Term is required.');   return; }
    if (!number.trim())    { setSaveErr('Number is required.'); return; }
    setSaving(true); setSaveMsg(''); setSaveErr('');
    try {
      const res = await fetch('/api/dictionary/terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid: user.uid,
          dreamerId: selectedDreamerId || 'owner-self',
          termLabel: termLabel.trim(),
          number: number.trim(),   // string — leading zeros preserved
          gameType,
          source: 'manual',
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed.');
      setSaveMsg('Saved: ' + data.termLabel + ' → ' + data.number + ' (' + data.gameType + ')');
      setTermLabel(''); setNumber(''); setNote('');
      void loadTerms();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Could not save entry.');
    } finally { setSaving(false); }
  }

  // Batch add
  async function handleBatchAdd() {
    if (!user) { setBatchErr('Sign in required.'); return; }
    const rows = parseBatch(batchText);
    if (!rows.length) { setBatchErr('No valid rows. Format: term,number,gameType[,note]'); return; }
    setBatchSaving(true); setBatchMsg(''); setBatchErr('');
    let saved = 0; const errs: string[] = [];
    try {
      for (const row of rows) {
        const res = await fetch('/api/dictionary/terms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerUid: user.uid,
            dreamerId: selectedDreamerId || 'owner-self',
            termLabel: row.termLabel, number: row.number,
            gameType: row.gameType, source: 'manual', note: row.note,
          }),
        });
        const d = await res.json();
        if (d.ok) saved++; else errs.push(row.termLabel + '/' + row.number + ': ' + d.error);
      }
      setBatchMsg('Saved ' + saved + ' of ' + rows.length + ' row(s).' + (errs.length ? ' Errors: ' + errs.join('; ') : ''));
      if (saved > 0) { setBatchText(''); void loadTerms(); }
    } catch (err) {
      setBatchErr(err instanceof Error ? err.message : 'Batch save failed.');
    } finally { setBatchSaving(false); }
  }

  const totalGroups = grouped.length;
  const totalHit    = grouped.filter(g => g.hasHit).length;
  const dreamerLabel = selectedDreamerId === '' ? 'All Dreamers'
    : selectedDreamerId === 'owner-self' ? 'Owner / Self'
    : dreamers.find(d => d.id === selectedDreamerId)?.displayName ?? selectedDreamerId;

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        {/* Header */}
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="page-header">
              <h1>Universal Dream Dictionary</h1>
              <p>All mapped term–number relationships from parsed dreams, historical backtests, and manual entries. Includes terms whether or not they have hit. Dreamer hit memories are kept separate.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/fell-before" className="btn-secondary">As They Fell Before</Link>
              <Link href="/windows"     className="btn-secondary">Active Windows</Link>
            </div>
          </div>
        </section>

        {/* Totals */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {([
            ['Unique Mappings', totalGroups],
            ['With Hit Memory', totalHit],
            ['No Hit Yet', totalGroups - totalHit],
            ['Showing', filtered.length],
            ['Scope', dreamerLabel],
          ] as [string, string|number][]).map(([label, val]) => (
            <div key={label}>
              <div className="journal-label">{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.7rem' : '0.92rem', fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </section>

        {/* Filters */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label className="journal-label" htmlFor="dreamerSel">Dreamer Scope</label>
              <select id="dreamerSel" className="journal-select" value={selectedDreamerId}
                onChange={e => handleDreamerChange(e.target.value)}>
                <option value="">All Dreamers</option>
                <option value="owner-self">Owner / Self</option>
                {dreamers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="gameFil">Game Type</label>
              <select id="gameFil" className="journal-select" value={gameFilter}
                onChange={e => setGameFilter(e.target.value as typeof gameFilter)}>
                <option value="all">All Games</option>
                <option value="cash3">Cash 3</option>
                <option value="cash4">Cash 4</option>
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="hitFil">Hit Status</label>
              <select id="hitFil" className="journal-select" value={hitFilter}
                onChange={e => setHitFilter(e.target.value as typeof hitFilter)}>
                <option value="all">All</option>
                <option value="hit">Has Hit Memory</option>
                <option value="nohit">No Hit Yet</option>
              </select>
            </div>
            <div>
              <label className="journal-label" htmlFor="srcFil">Source</label>
              <select id="srcFil" className="journal-select" value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}>
                <option value="all">All Sources</option>
                {uniqueSources.map(s => <option key={s} value={s}>{srcLabel(s)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label className="journal-label" htmlFor="stSearch">Search Term</label>
              <input id="stSearch" className="journal-input" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)} placeholder="car, sister, ocean…" />
            </div>
            <div>
              <label className="journal-label" htmlFor="snSearch">Search Number</label>
              <input id="snSearch" className="journal-input" value={searchNumber}
                onChange={e => setSearchNumber(e.target.value)} placeholder="089, 856…"
                style={{ fontFamily: 'monospace' }} />
            </div>
          </div>
        </section>

        {/* Manual add */}
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
            <Plus size={18} /><strong>Manual Add</strong>
          </div>
          <form onSubmit={handleManualAdd} style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <div>
                <label className="journal-label">Term</label>
                <input className="journal-input" value={termLabel}
                  onChange={e => setTermLabel(e.target.value)} placeholder="ocean, car…" />
              </div>
              <div>
                <label className="journal-label">Number</label>
                <input className="journal-input" value={number}
                  onChange={e => setNumber(e.target.value)} placeholder="089"
                  style={{ fontFamily: 'monospace' }} />
                <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '3px' }}>
                  3 digits cash3 · 4 digits cash4 · leading zeros preserved
                </div>
              </div>
              <div>
                <label className="journal-label">Game</label>
                <select className="journal-select" value={gameType}
                  onChange={e => setGameType(e.target.value as 'cash3'|'cash4')}>
                  <option value="cash3">cash3</option>
                  <option value="cash4">cash4</option>
                </select>
              </div>
              <div>
                <label className="journal-label">Note</label>
                <input className="journal-input" value={note}
                  onChange={e => setNote(e.target.value)} placeholder="optional" />
              </div>
            </div>
            {saveMsg && <div className="journal-card-flat" style={{ borderColor:'#cfe5c8',background:'#f5fbf2',color:'#315a2b' }}>{saveMsg}</div>}
            {saveErr && <div className="journal-card-flat" style={{ borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{saveErr}</div>}
            <button type="submit" className="btn-primary" disabled={saving} style={{ width: 'fit-content' }}>
              {saving ? 'Saving…' : 'Save Dictionary Entry'}
            </button>
          </form>
        </section>

        {/* Batch */}
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
            <Upload size={18} /><strong>Batch Add</strong>
          </div>
          <p style={{ margin: '0 0 8px', color: 'var(--ink-light)', fontSize: '13px' }}>
            One row per line: <code style={{ background:'rgba(255,255,255,0.08)',padding:'1px 5px',borderRadius:4,fontSize:'12px' }}>term,number,gameType,note</code>
          </p>
          <textarea className="journal-textarea" rows={5} value={batchText}
            onChange={e => setBatchText(e.target.value)}
            placeholder={'ocean,089,cash3,paper journal\ncar,2915,cash4,old notebook'}
            style={{ fontFamily: 'monospace', fontSize: '13px' }} />
          {batchMsg && <div className="journal-card-flat" style={{ marginTop:'8px',borderColor:'#cfe5c8',background:'#f5fbf2',color:'#315a2b' }}>{batchMsg}</div>}
          {batchErr && <div className="journal-card-flat" style={{ marginTop:'8px',borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{batchErr}</div>}
          <div style={{ marginTop: '10px' }}>
            <button type="button" className="btn-primary" onClick={handleBatchAdd} disabled={batchSaving}>
              {batchSaving ? 'Saving batch…' : 'Save Batch Upload'}
            </button>
          </div>
        </section>

        {loading && <section className="journal-card"><p>Loading dictionary…</p></section>}
        {error   && <section className="journal-card-flat" style={{borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f'}}>{error}</section>}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <section className="journal-card">
            <div style={{ display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px',color:'var(--deep-plum)'}}>
              <Sparkles size={18} />
              <strong>{grouped.length === 0 ? 'No dictionary terms yet' : 'No matches for current filters'}</strong>
            </div>
            <p style={{ margin:0, color:'var(--ink-light)'}}>
              {grouped.length === 0
                ? 'Parse a dream or add manual entries to populate the dictionary.'
                : 'Try broadening search or clearing filters.'}
            </p>
          </section>
        )}

        {/* Dictionary rows */}
        {filtered.length > 0 && (
          <section style={{ display: 'grid', gap: '10px' }}>
            {filtered.map(item => (
              <article key={item.groupKey} className="journal-card"
                style={{ borderLeft: item.hasHit ? '3px solid #4a7c59' : '3px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:'14px', flexWrap:'wrap', alignItems:'flex-start' }}>
                  {/* Left: term → number game badge */}
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'7px', color:'var(--deep-plum)' }}>
                      <BookType size={15} />
                      <strong style={{ fontSize:'17px' }}>{item.termLabel}</strong>
                    </div>
                    {item.number && <>
                      <span style={{ color:'rgba(255,255,255,0.2)' }}>→</span>
                      <span style={{
                        fontFamily:'monospace', fontSize:'17px', fontWeight:700,
                        color: item.hasHit ? '#6dbf8a' : 'var(--ink)',
                      }}>{item.number}</span>
                    </>}
                    {item.gameType && (
                      <span style={{
                        padding:'2px 7px', borderRadius:'7px', fontSize:'10px', fontWeight:700,
                        background: item.gameType==='cash3' ? 'rgba(108,120,255,0.16)' : 'rgba(228,192,123,0.16)',
                        color:      item.gameType==='cash3' ? '#b0b8ff' : '#d4a95a',
                      }}>{item.gameType}</span>
                    )}
                  </div>
                  {/* Right: hit badge */}
                  {item.hasHit ? (
                    <span style={{
                      padding:'3px 11px', borderRadius:'14px', fontSize:'11px', fontWeight:700,
                      background:'rgba(74,124,89,0.2)', border:'1px solid rgba(74,124,89,0.4)', color:'#6dbf8a',
                    }}>✓ {item.hitCount} hit{item.hitCount!==1?'s':''}</span>
                  ) : (
                    <span style={{
                      padding:'3px 11px', borderRadius:'14px', fontSize:'11px',
                      background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.28)',
                    }}>No hit yet</span>
                  )}
                </div>

                {/* Metadata */}
                <div style={{ display:'grid', gap:'6px', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', marginTop:'12px', fontSize:'12.5px' }}>
                  <div>
                    <div className="journal-label">Dreamer</div>
                    <div>{item.dreamerName || item.dreamerId || '—'}</div>
                  </div>
                  <div>
                    <div className="journal-label">Sources</div>
                    <div>{item.sources.map(srcLabel).join(', ') || '—'}</div>
                  </div>
                  <div>
                    <div className="journal-label">Dream Dates</div>
                    <div style={{ fontSize:'11px' }}>
                      {item.dreamDates.length
                        ? item.dreamDates.slice().sort().slice(0,3).join(', ') +
                          (item.dreamDates.length>3 ? ' +' + (item.dreamDates.length-3) : '')
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="journal-label">Mappings</div>
                    <div>{item.mappingCount}</div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

    </div>
  );
}
