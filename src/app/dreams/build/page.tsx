'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  groupDictionaryTerms,
  parseBulkTerms,
  buildSaveEntryPayload,
  summarizeFellBeforeSupport,
  normalizeTermLabel,
  type SelectedTerm,
  type GroupedTerm,
  type FellSupportSummary,
  type ParsedBulkTerm,
} from '@/lib/intelligence/buildDream';

// ─── Visual helpers ───────────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50' : '#ff9090';
  return (
    <div style={{ padding:'12px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      <strong>{isIndex ? '⚠ Index required — ' : isQuota ? '⚠ Quota — ' : '⚠ '}</strong>
      {isIndex ? 'Create composite index in Firebase Console.' : isQuota ? 'Wait for quota reset.' : msg}
      <button type="button" onClick={() => setOpen(o => !o)} style={{ marginLeft:'8px', fontSize:'10px', opacity:0.6, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
        {open ? 'hide' : 'details'}
      </button>
      {open && <div style={{ marginTop:'4px', fontSize:'10px', fontFamily:'monospace', opacity:0.7, wordBreak:'break-all' }}>{msg}</div>}
    </div>
  );
}

function NumberChip({ n, game, onRemove }: { n: string; game: string; onRemove?: () => void }) {
  const c4 = game === 'cash4';
  return (
    <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'12px', padding:'2px 7px', borderRadius:'7px', display:'inline-flex', alignItems:'center', gap:'4px',
      background: c4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
      border:`1px solid ${c4 ? 'rgba(160,144,255,0.28)' : 'rgba(255,107,74,0.28)'}`,
      color: c4 ? '#a090ff' : '#ff8a6a' }}>
      {n}
      {onRemove && <button type="button" onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', fontSize:'10px', padding:0, lineHeight:1, opacity:0.65 }}>×</button>}
    </span>
  );
}

function StateChip({ state }: { state: string }) {
  return <span style={{ padding:'2px 6px', borderRadius:'6px', fontSize:'10px', fontWeight:800, background:'rgba(96,224,154,0.12)', border:'1px solid rgba(96,224,154,0.26)', color:'#60e09a', fontFamily:'system-ui,sans-serif' }}>{state}</span>;
}

function SH({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom:'12px' }}>
      <h2 style={{ margin:0, fontSize:'1.0rem', fontWeight:900, letterSpacing:'-0.02em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>{title}</h2>
      {sub && <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', marginTop:'2px' }}>{sub}</div>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BuildDreamPage() {
  const { user, loading: authLoading } = useAuth();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [dreamers,       setDreamers]       = useState<any[]>([]);
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [dictRows,       setDictRows]       = useState<any[]>([]);
  const [dictLoading,    setDictLoading]    = useState(true);
  const [dictError,      setDictError]      = useState('');

  // ── Dream setup ─────────────────────────────────────────────────────────────
  const [dreamerId,     setDreamerId]     = useState('owner-self');
  const [dreamerName,   setDreamerName]   = useState('');
  const [dreamDate,     setDreamDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [dreamTitle,    setDreamTitle]    = useState('');
  const [dreamNotes,    setDreamNotes]    = useState('');

  // ── Dictionary search ───────────────────────────────────────────────────────
  const [termSearch,    setTermSearch]    = useState('');
  const [gameFilter,    setGameFilter]    = useState<'all'|'cash3'|'cash4'>('all');
  const [evidenceOnly,  setEvidenceOnly]  = useState(false);

  // ── Selected terms ──────────────────────────────────────────────────────────
  const [selectedTerms, setSelectedTerms] = useState<SelectedTerm[]>([]);

  // ── Fell-before preview ─────────────────────────────────────────────────────
  const [fellPreview,   setFellPreview]   = useState<any[]>([]);
  const [fellLoading,   setFellLoading]   = useState(false);
  const [fellLoaded,    setFellLoaded]    = useState(false);

  // ── Bulk parser ──────────────────────────────────────────────────────────────
  const [bulkInput,    setBulkInput]    = useState('');
  const [bulkParsed,   setBulkParsed]   = useState<ParsedBulkTerm[]>([]);
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);
  const [bulkParsedAt, setBulkParsedAt] = useState(false);

  // ── Save ────────────────────────────────────────────────────────────────────
  const [saving,        setSaving]        = useState(false);
  const [saveResult,    setSaveResult]    = useState<any>(null);
  const [saveError,     setSaveError]     = useState('');

  // ── Load dreamers + profile ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const uid = encodeURIComponent(user.uid);
    Promise.all([
      fetch(`/api/dreamers?ownerUid=${uid}&limit=100`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/owner-profile?ownerUid=${uid}`).then(r => r.json()).catch(() => ({})),
    ]).then(([dd, pd]) => {
      if (dd.ok) setDreamers(dd.dreamers ?? []);
      if (pd.ok && pd.profile?.displayName) {
        setOwnerDisplayName(pd.profile.displayName);
        setDreamerName(pd.profile.displayName);
      }
    });
  }, [user]);

  // ── Load dictionary ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setDictLoading(true);
    const uid = encodeURIComponent(user.uid);
    fetch(`/api/dictionary/terms?ownerUid=${uid}&limit=500`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setDictRows(d.terms ?? []);
        else setDictError(d.error ?? 'Could not load dictionary.');
      })
      .catch(e => setDictError(String(e)))
      .finally(() => setDictLoading(false));
  }, [user]);

  // ── Group dictionary terms ──────────────────────────────────────────────────
  const allGrouped: GroupedTerm[] = useMemo(() => groupDictionaryTerms(dictRows), [dictRows]);

  // ── Filter terms for display ────────────────────────────────────────────────
  const filteredTerms = useMemo(() => {
    let terms = allGrouped;
    if (termSearch.trim()) {
      const q = termSearch.trim().toLowerCase();
      terms = terms.filter(t => t.termLabel.toLowerCase().includes(q) || t.normalizedTerm.includes(q));
    }
    if (gameFilter === 'cash3') terms = terms.filter(t => t.cash3Numbers.length > 0);
    if (gameFilter === 'cash4') terms = terms.filter(t => t.cash4Numbers.length > 0);
    if (evidenceOnly)           terms = terms.filter(t => t.hasFellBefore);
    return terms;
  }, [allGrouped, termSearch, gameFilter, evidenceOnly]);

  const selectedKeys = useMemo(() => new Set(selectedTerms.map(t => t.normalizedTerm)), [selectedTerms]);

  // ── Select / deselect a dictionary term ────────────────────────────────────
  function toggleTerm(group: GroupedTerm) {
    if (selectedKeys.has(group.normalizedTerm)) {
      setSelectedTerms(prev => prev.filter(t => t.normalizedTerm !== group.normalizedTerm));
    } else {
      setSelectedTerms(prev => [...prev, {
        term:          group.termLabel,
        normalizedTerm:group.normalizedTerm,
        cash3Numbers:  [...group.cash3Numbers],
        cash4Numbers:  [...group.cash4Numbers],
        source:        'dictionary',
      }]);
    }
    // Reset fell preview when selection changes
    setFellLoaded(false);
    setFellPreview([]);
  }

  // ── Remove a number from a selected term ────────────────────────────────────
  function removeNumber(termIdx: number, num: string, gt: 'cash3'|'cash4') {
    setSelectedTerms(prev => prev.map((t, i) => {
      if (i !== termIdx) return t;
      return {
        ...t,
        cash3Numbers: gt === 'cash3' ? t.cash3Numbers.filter(n => n !== num) : t.cash3Numbers,
        cash4Numbers: gt === 'cash4' ? t.cash4Numbers.filter(n => n !== num) : t.cash4Numbers,
      };
    }));
  }

  // ── Load fell-before preview ────────────────────────────────────────────────
  async function loadFellPreview() {
    if (!user || selectedTerms.length === 0) return;
    setFellLoading(true);
    const uid  = encodeURIComponent(user.uid);
    const all: any[] = [];
    // Fetch for each selected term individually (server-side term filter)
    await Promise.all(selectedTerms.slice(0, 5).map(async t => {
      try {
        const r = await fetch(`/api/fell-before?ownerUid=${uid}&term=${encodeURIComponent(t.term)}&limit=500`);
        const d = await r.json();
        if (d.ok) all.push(...(d.rows ?? []));
      } catch { /* non-fatal */ }
    }));
    setFellPreview(all);
    setFellLoaded(true);
    setFellLoading(false);
  }

  const fellSummary: FellSupportSummary[] = useMemo(() =>
    fellLoaded ? summarizeFellBeforeSupport(fellPreview, selectedTerms.map(t => t.term)) : [],
    [fellPreview, fellLoaded, selectedTerms]
  );


  // ── Merged numbers ───────────────────────────────────────────────────────────
  const { allCash3, allCash4 } = useMemo(() => {
    const c3 = new Set<string>();
    const c4 = new Set<string>();
    selectedTerms.forEach(t => { t.cash3Numbers.forEach(n => c3.add(n)); t.cash4Numbers.forEach(n => c4.add(n)); });
    return { allCash3: Array.from(c3), allCash4: Array.from(c4) };
  }, [selectedTerms]);

  // ── Dreamer change handler ──────────────────────────────────────────────────
  function handleDreamerChange(did: string) {
    setDreamerId(did);
    if (did === 'owner-self') {
      setDreamerName(ownerDisplayName || 'Owner / Self');
    } else {
      const found = dreamers.find((d: any) => d.id === did);
      setDreamerName(found?.displayName ?? did);
    }
  }

  // ── Save dream ───────────────────────────────────────────────────────────────
  const handleParse = () => {
    const result = parseBulkTerms(bulkInput) as any;
    setBulkParsed(result.terms ?? result.parsed ?? result.items ?? []);
    setBulkWarnings(result.warnings ?? []);
    setBulkParsedAt(true);
  };

  const handleClearParser = () => {
    setBulkInput('');
    setBulkParsed([]);
    setBulkWarnings([]);
    setBulkParsedAt(false);
  };

  const handleAddParsed = () => {
    if (!bulkParsed.length) return;

    const cleanTerm = (value: any) =>
      String(value ?? '').trim();

    const normalizeTerm = (value: any) =>
      cleanTerm(value)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');

    const uniqueStrings = (values: any[]) =>
      Array.from(new Set(
        (values ?? [])
          .map(v => String(v ?? '').trim())
          .filter(Boolean)
      ));

    setSelectedTerms((prev: any) => {
      const current = Array.isArray(prev) ? prev : [];
      const byTerm = new Map<string, any>();

      for (const item of current) {
        const key = normalizeTerm(item.normalizedTerm || item.term || item.termLabel);
        if (!key) continue;

        byTerm.set(key, {
          ...item,
          term: item.term ?? item.termLabel ?? key,
          normalizedTerm: item.normalizedTerm ?? key,
          cash3Numbers: uniqueStrings(item.cash3Numbers ?? []),
          cash4Numbers: uniqueStrings(item.cash4Numbers ?? []),
        });
      }

      for (const raw of bulkParsed as any[]) {
        const label = cleanTerm(raw.term ?? raw.termLabel ?? raw.label);
        const key = normalizeTerm(raw.normalizedTerm ?? label);
        if (!key || !label) continue;

        const nextCash3 = uniqueStrings(raw.cash3Numbers ?? raw.cash3 ?? []);
        const nextCash4 = uniqueStrings(raw.cash4Numbers ?? raw.cash4 ?? []);
        const existing = byTerm.get(key);

        if (existing) {
          byTerm.set(key, {
            ...existing,
            source: existing.source === 'dictionary' ? 'mixed' : (existing.source ?? 'mixed'),
            cash3Numbers: uniqueStrings([...(existing.cash3Numbers ?? []), ...nextCash3]),
            cash4Numbers: uniqueStrings([...(existing.cash4Numbers ?? []), ...nextCash4]),
          });
        } else {
          byTerm.set(key, {
            term: label,
            normalizedTerm: key,
            cash3Numbers: nextCash3,
            cash4Numbers: nextCash4,
            relatedTerms: [],
            archivedNumbers: [],
            lineContexts: raw.lineContexts ?? [],
            source: 'custom',
          });
        }
      }

      return Array.from(byTerm.values()) as any;
    });

    setBulkParsed([]);
    setBulkWarnings([]);
    setBulkParsedAt(false);
  };

  async function handleSave() {
    if (!user) return;
    if (!dreamDate) { setSaveError('Dream date is required.'); return; }
    if (selectedTerms.length === 0) { setSaveError('Select at least one term to build a dream.'); return; }

    setSaving(true); setSaveResult(null); setSaveError('');

    const payload = buildSaveEntryPayload({
      ownerUid:    user.uid,
      dreamerId,
      dreamerName: dreamerName || ownerDisplayName || 'Owner / Self',
      dreamDate,
      selectedTerms,
      notes:       dreamNotes,
      title:       dreamTitle,
    });

    try {
      const res  = await fetch('/api/dreams/save-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setSaveError(data.error ?? 'Save failed.'); return; }
      setSaveResult(data);
      // Reset for next dream
      setSelectedTerms([]);
      setDreamTitle('');
      setDreamNotes('');
      setFellLoaded(false); setFellPreview([]);
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setSaving(false); }
  }

  // ── Dreamer label helper ────────────────────────────────────────────────────
  const dreamerLabel = dreamerId === 'owner-self'
    ? (ownerDisplayName || 'Owner / Self')
    : dreamers.find((d: any) => d.id === dreamerId)?.displayName ?? dreamerId;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding:'clamp(18px,3vw,32px)', display:'grid', gap:'24px' }}>

      {/* ── Header ── */}
      <section className="journal-card">
        <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'clamp(1.4rem,3vw,2rem)', fontWeight:900, letterSpacing:'-0.04em', fontFamily:'system-ui,sans-serif', color:'#fff' }}>
              Build a Dream
            </h1>
            <p style={{ margin:'6px 0 0', color:'rgba(255,255,255,0.50)', fontSize:'13px', maxWidth:'580px', lineHeight:1.65 }}>
              Select known dream symbols from your Universal Dictionary, add any missing terms, and save a new dream without retyping number lists.
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <Link href="/dreams/new"  className="btn-secondary" style={{ fontSize:'12px' }}>New Dream (manual)</Link>
            <Link href="/dictionary"  className="btn-secondary" style={{ fontSize:'12px' }}>Dictionary</Link>
          </div>
        </div>
      </section>

      {/* ── 2. Dream Setup ── */}
      <section className="journal-card">
        <SH title="Dream Setup" />
        <div style={{ display:'grid', gap:'12px', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamerSel">Dreamer</label>
            <select id="dreamerSel" className="journal-select" value={dreamerId} onChange={e => handleDreamerChange(e.target.value)}>
              <option value="owner-self">{ownerDisplayName || 'Owner / Self'}</option>
              {dreamers.map((d: any) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="dreamDate">Dream Date</label>
            <input id="dreamDate" type="date" className="journal-input" value={dreamDate} onChange={e => setDreamDate(e.target.value)} />
          </div>
          <div>
            <label className="journal-label" htmlFor="dreamTitle">Title / Short Note</label>
            <input id="dreamTitle" className="journal-input" value={dreamTitle} onChange={e => setDreamTitle(e.target.value)} placeholder="e.g. River dream, funeral scenario…" />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="journal-label" htmlFor="dreamNotes">Context Notes (optional)</label>
            <textarea id="dreamNotes" className="journal-input" rows={2} value={dreamNotes} onChange={e => setDreamNotes(e.target.value)}
              placeholder="Optional narrative or recall notes…" style={{ resize:'vertical', fontFamily:'inherit' }} />
          </div>
        </div>
      </section>

      {/* ── 3. Dictionary Term Search ── */}
      <section className="journal-card">
        <SH title="Dictionary Term Search" sub="Click a term to add it to your dream" />

        <div style={{ display:'grid', gap:'8px', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', marginBottom:'14px' }}>
          <input className="journal-input" placeholder="Search terms…" value={termSearch} onChange={e => setTermSearch(e.target.value)} />
          <select className="journal-select" value={gameFilter} onChange={e => setGameFilter(e.target.value as typeof gameFilter)}>
            <option value="all">All Game Types</option>
            <option value="cash3">Cash 3 only</option>
            <option value="cash4">Cash 4 only</option>
          </select>
          <label style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'13px', color:'rgba(255,255,255,0.65)', cursor:'pointer' }}>
            <input type="checkbox" checked={evidenceOnly} onChange={e => setEvidenceOnly(e.target.checked)} />
            With fell-before evidence
          </label>
        </div>

        {dictLoading && <div style={{ color:'rgba(255,255,255,0.50)', fontSize:'13px' }}>Loading dictionary…</div>}
        {dictError   && <ErrorBanner msg={dictError} />}

        {!dictLoading && allGrouped.length === 0 && (
          <div style={{ padding:'14px', borderRadius:'13px', border:'1px solid rgba(255,255,255,0.09)', background:'rgba(255,255,255,0.04)', fontSize:'13px', color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>
            Your Universal Dictionary is empty. Add your first term manually below, or enter a dream from the{' '}
            <Link href="/dreams/new" style={{ color:'#a090ff', fontWeight:600 }}>New Dream page</Link>.
          </div>
        )}

        {!dictLoading && allGrouped.length > 0 && filteredTerms.length === 0 && (
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.55)', padding:'8px 0' }}>
            No dictionary terms match this search. Add it as a new term below.
          </div>
        )}

        {/* ── 4. Term Buttons ── */}
        {!dictLoading && filteredTerms.length > 0 && (
          <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
            {filteredTerms.map(group => {
              const isSelected = selectedKeys.has(group.normalizedTerm);
              return (
                <button
                  key={group.normalizedTerm}
                  type="button"
                  onClick={() => toggleTerm(group)}
                  style={{
                    padding:'6px 12px', borderRadius:'20px', cursor:'pointer', fontSize:'12px', fontWeight:700,
                    fontFamily:'system-ui,sans-serif', border:'1px solid',
                    background: isSelected ? 'rgba(160,144,255,0.20)' : 'rgba(255,255,255,0.06)',
                    borderColor: isSelected ? 'rgba(160,144,255,0.50)' : 'rgba(255,255,255,0.12)',
                    color: isSelected ? '#a090ff' : 'rgba(255,255,255,0.80)',
                    transition:'all 0.12s',
                  }}>
                  {group.termLabel}
                  {' '}
                  <span style={{ fontSize:'10px', opacity:0.70 }}>
                    {group.cash3Numbers.length > 0 && `${group.cash3Numbers.length}×3`}
                    {group.cash3Numbers.length > 0 && group.cash4Numbers.length > 0 && ' '}
                    {group.cash4Numbers.length > 0 && `${group.cash4Numbers.length}×4`}
                  </span>
                  {group.hasFellBefore && (
                    <span style={{ marginLeft:'4px', fontSize:'9px', color:'#60e09a' }}>✓</span>
                  )}
                  {isSelected && <span style={{ marginLeft:'4px' }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}

        {dictRows.length >= 500 && (
          <div style={{ marginTop:'8px', fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>
            Showing up to 500 dictionary terms. Use search to narrow results.
          </div>
        )}
      </section>

      {/* ── 5. Selected Dream Builder ── */}
      {selectedTerms.length > 0 && (
        <section className="journal-card">
          <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'flex-start', marginBottom:'14px' }}>
            <SH title="Selected Dream Builder" sub={`${selectedTerms.length} term${selectedTerms.length !== 1 ? 's' : ''} · ${allCash3.length} Cash 3 · ${allCash4.length} Cash 4`} />
            <button type="button" className="btn-secondary" style={{ fontSize:'11px' }}
              onClick={() => { setSelectedTerms([]); setFellLoaded(false); setFellPreview([]); }}>
              Clear all
            </button>
          </div>

          <div style={{ display:'grid', gap:'12px' }}>
            {selectedTerms.map((st, idx) => (
              <div key={st.normalizedTerm} style={{ padding:'10px 13px', borderRadius:'13px',
                background: st.source === 'custom' ? 'rgba(255,204,80,0.07)' : 'rgba(255,255,255,0.06)',
                border:`1px solid ${st.source === 'custom' ? 'rgba(255,204,80,0.20)' : 'rgba(255,255,255,0.09)'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'7px' }}>
                  <span style={{ fontWeight:800, fontSize:'13px', color:'#fff', fontFamily:'system-ui,sans-serif' }}>
                    {st.term}
                    {st.source === 'custom' && (
                      <span style={{ marginLeft:'6px', fontSize:'9px', padding:'1px 6px', borderRadius:'999px', background:'rgba(255,204,80,0.14)', border:'1px solid rgba(255,204,80,0.28)', color:'#ffcc50' }}>new</span>
                    )}
                  </span>
                  <button type="button" onClick={() => setSelectedTerms(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.40)', fontSize:'14px' }}>×</button>
                </div>
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                  {st.cash3Numbers.map(n => <NumberChip key={n} n={n} game="cash3" onRemove={() => removeNumber(idx, n, 'cash3')} />)}
                  {st.cash4Numbers.map(n => <NumberChip key={n} n={n} game="cash4" onRemove={() => removeNumber(idx, n, 'cash4')} />)}
                  {st.cash3Numbers.length === 0 && st.cash4Numbers.length === 0 && (
                    <span style={{ fontSize:'11px', color:'rgba(255,204,80,0.70)' }}>No numbers — add them below.</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Merged totals */}
          <div style={{ marginTop:'12px', display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', marginRight:'4px' }}>ALL NUMBERS:</span>
            {allCash3.map(n => <NumberChip key={n} n={n} game="cash3" />)}
            {allCash4.map(n => <NumberChip key={n} n={n} game="cash4" />)}
            {allCash3.length === 0 && allCash4.length === 0 && (
              <span style={{ fontSize:'11px', color:'rgba(255,85,85,0.70)' }}>No numbers yet — add terms or numbers above.</span>
            )}
          </div>
        </section>
      )}

      {/* ── 6. Fell-Before Preview ── */}
      {selectedTerms.length > 0 && (
        <section className="journal-card">
          <div style={{ display:'flex', justifyContent:'space-between', gap:'16px', flexWrap:'wrap', alignItems:'center', marginBottom:'12px' }}>
            <SH title="Existing Evidence Preview" sub="Read-only. Shows fell-before support for selected terms." />
            {!fellLoaded && (
              <button type="button" className="btn-secondary" style={{ fontSize:'12px' }} onClick={loadFellPreview} disabled={fellLoading}>
                {fellLoading ? '⏳ Loading…' : '🔍 Load evidence for selected terms'}
              </button>
            )}
          </div>

          {!fellLoaded && !fellLoading && (
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.45)', fontStyle:'italic' }}>
              Click "Load evidence" to see existing fell-before support without saving.
            </div>
          )}

          {fellLoaded && fellSummary.length === 0 && (
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.50)' }}>
              No existing fell-before evidence for these terms yet. After saving, refresh will detect new hits.
            </div>
          )}

          {fellLoaded && fellSummary.length > 0 && (
            <div style={{ display:'grid', gap:'7px' }}>
              {fellSummary.map(s => (
                <div key={s.term} style={{ padding:'9px 12px', borderRadius:'12px', background:'rgba(96,224,154,0.07)', border:'1px solid rgba(96,224,154,0.16)',
                  display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontWeight:800, fontSize:'12px', color:'#fff', minWidth:'80px', fontFamily:'system-ui,sans-serif' }}>{s.term}</span>
                  <span style={{ fontSize:'12px', color:'#60e09a' }}>{s.hitCount} hit{s.hitCount !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.50)' }}>{s.straight}S / {s.boxed}B</span>
                  <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {s.topStates.slice(0, 6).map(st => <StateChip key={st} state={st} />)}
                  </div>
                </div>
              ))}
              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>
                Evidence preview only. Saving will not write new fell-before rows.
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 7. Add New Terms (Bulk Parser) ── */}
      <section className="journal-card">
        <SH title="Add New Terms" sub="Paste terms and numbers not yet in your dictionary. These will be added to this dream and saved to the dictionary." />

        <div style={{ marginBottom:'10px', padding:'10px 13px', borderRadius:'12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:'12px', color:'rgba(255,255,255,0.50)', lineHeight:1.7 }}>
          Use dictionary buttons above for known symbols. Use this parser for new symbols.
          Everything selected here saves as one normal dream entry.
        </div>

        <textarea
          className="journal-input"
          rows={7}
          value={bulkInput}
          onChange={e => { setBulkInput(e.target.value); setBulkParsedAt(false); }}
          placeholder={"boat: 123, 020, 0560\ntruck: 312, 395, 0247\ncrying: 918, 672, 8415\n\n— or —\n\nboat\n123 020 0560\n\ntruck\n312 395"}
          style={{ fontFamily:'monospace', fontSize:'12px', resize:'vertical', width:'100%' }}
        />

        <div style={{ display:'flex', gap:'8px', marginTop:'10px', flexWrap:'wrap', alignItems:'center' }}>
          <button type="button" className="btn-secondary" style={{ fontSize:'12px' }}
            onClick={handleParse} disabled={!bulkInput.trim()}>
            🔍 Parse Terms
          </button>
          {bulkParsedAt && bulkParsed.length > 0 && (
            <button type="button" className="btn-primary" style={{ fontSize:'12px' }}
              onClick={handleAddParsed}>
              + Add {bulkParsed.length} Term{bulkParsed.length !== 1 ? 's' : ''} to Dream
            </button>
          )}
          {(bulkInput || bulkParsedAt) && (
            <button type="button" className="btn-secondary" style={{ fontSize:'12px', opacity:0.7 }}
              onClick={handleClearParser}>
              Clear
            </button>
          )}
        </div>

        {/* Parsed preview */}
        {bulkParsedAt && bulkParsed.length > 0 && (
          <div style={{ marginTop:'12px', display:'grid', gap:'7px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>
              Parsed — {bulkParsed.length} term{bulkParsed.length !== 1 ? 's' : ''}
            </div>
            {bulkParsed.map(p => (
              <div key={p.normalizedTerm} style={{ padding:'8px 11px', borderRadius:'11px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)', display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontWeight:700, fontSize:'12px', color:'#fff', fontFamily:'system-ui,sans-serif', minWidth:'80px' }}>{p.termLabel}</span>
                <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                  {p.cash3Numbers.map(n => <span key={n} style={{ fontFamily:'monospace', fontSize:'11px', padding:'1px 6px', borderRadius:'6px', background:'rgba(255,107,74,0.14)', border:'1px solid rgba(255,107,74,0.26)', color:'#ff8a6a' }}>{n}</span>)}
                  {p.cash4Numbers.map(n => <span key={n} style={{ fontFamily:'monospace', fontSize:'11px', padding:'1px 6px', borderRadius:'6px', background:'rgba(160,144,255,0.14)', border:'1px solid rgba(160,144,255,0.26)', color:'#a090ff' }}>{n}</span>)}
                  {p.cash3Numbers.length === 0 && p.cash4Numbers.length === 0 && (
                    <span style={{ fontSize:'11px', color:'rgba(255,204,80,0.70)' }}>no valid numbers found</span>
                  )}
                </div>
                <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', marginLeft:'auto' }}>
                  {p.cash3Numbers.length}×3 · {p.cash4Numbers.length}×4
                </span>
              </div>
            ))}
          </div>
        )}

        {bulkParsedAt && bulkParsed.length === 0 && (
          <div style={{ marginTop:'10px', fontSize:'12px', color:'rgba(255,204,80,0.80)' }}>
            ⚠ No terms were parsed. Check the format — each term needs a label and at least one number.
          </div>
        )}

        {/* Warnings */}
        {bulkWarnings.length > 0 && (
          <div style={{ marginTop:'8px', display:'grid', gap:'3px' }}>
            {bulkWarnings.map((w, i) => (
              <div key={i} style={{ fontSize:'11px', color:'rgba(255,204,80,0.70)' }}>⚠ {w}</div>
            ))}
          </div>
        )}

        <div style={{ marginTop:'8px', fontSize:'11px', color:'rgba(255,255,255,0.30)', lineHeight:1.7 }}>
          Cash 3 = exactly 3 digits · Cash 4 = exactly 4 digits · Leading zeros preserved ·
          Separators: colon, dash, comma, space, semicolon, slash
        </div>
      </section>

      {/* ── 8. Generated Dream Preview ── */}
      {selectedTerms.length > 0 && (
        <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>
          <strong style={{ color:'rgba(255,255,255,0.70)', display:'block', marginBottom:'4px' }}>Generated dream payload preview:</strong>
          <div>Dreamer: <strong style={{ color:'#fff' }}>{dreamerLabel}</strong></div>
          <div>Date: <strong style={{ color:'#fff' }}>{dreamDate}</strong></div>
          <div>Terms: <strong style={{ color:'#fff' }}>{selectedTerms.map(t => t.term).join(', ')}</strong></div>
          <div>Cash 3: <span style={{ fontFamily:'monospace', color:'#ff8a6a' }}>{allCash3.join(', ') || '—'}</span></div>
          <div>Cash 4: <span style={{ fontFamily:'monospace', color:'#a090ff' }}>{allCash4.join(', ') || '—'}</span></div>
          {dreamNotes && <div>Notes: {dreamNotes}</div>}
        </section>
      )}

      {/* ── 9. Save Dream ── */}
      <section className="journal-card">
        <SH title="Save Built Dream" />
        {saveError && <ErrorBanner msg={saveError} />}

        {saveResult ? (
          <div style={{ display:'grid', gap:'12px' }}>
            <div style={{ padding:'14px 16px', borderRadius:'14px', background:'rgba(96,224,154,0.09)', border:'1px solid rgba(96,224,154,0.24)', color:'#60e09a', fontSize:'13px', lineHeight:1.7 }}>
              <strong>✓ Dream saved successfully!</strong>
              <div style={{ marginTop:'6px', fontSize:'12px', color:'rgba(255,255,255,0.65)', display:'grid', gap:'3px' }}>
                <div>Dream ID: <span style={{ fontFamily:'monospace' }}>{saveResult.dreamEntryId}</span></div>
                {saveResult.windowsCreated !== undefined && <div>Watch windows created: {saveResult.windowsCreated}</div>}
                {saveResult.termMappingsWritten !== undefined && <div>Dictionary entries written: {saveResult.termMappingsWritten}</div>}
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <Link href="/windows"        className="btn-secondary" style={{ fontSize:'12px' }}>Active Windows</Link>
              <Link href="/universal-scope" className="btn-secondary" style={{ fontSize:'12px' }}>Universal Scope</Link>
              <Link href="/playlists"      className="btn-secondary" style={{ fontSize:'12px' }}>State Playlists</Link>
              <Link href="/fell-before"    className="btn-secondary" style={{ fontSize:'12px' }}>As They Fell Before</Link>
              <button type="button" className="btn-primary" style={{ fontSize:'12px' }}
                onClick={() => { setSaveResult(null); setDreamTitle(''); setDreamNotes(''); }}>
                Build another dream
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display:'grid', gap:'10px' }}>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.55)', lineHeight:1.65 }}>
              {selectedTerms.length === 0
                ? 'Select at least one term above to enable saving.'
                : `Ready to save: ${selectedTerms.length} term${selectedTerms.length !== 1 ? 's' : ''}, ${allCash3.length} Cash 3, ${allCash4.length} Cash 4 numbers.`}
            </div>
            <div>
              <button type="button" className="btn-primary"
                disabled={saving || selectedTerms.length === 0 || !dreamDate || !user}
                onClick={handleSave}
                style={{ fontSize:'14px', opacity: (saving || selectedTerms.length === 0) ? 0.6 : 1 }}>
                {saving ? '⏳ Saving…' : '💾 Save Built Dream'}
              </button>
              <div style={{ marginTop:'6px', fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>
                Saves via /api/dreams/save-entry → creates dreamEntries + activeDreamWindows + termNumberMappings
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="journal-card-flat" style={{ fontSize:'12px', color:'rgba(255,255,255,0.40)', lineHeight:1.7 }}>
        · Build a Dream uses the same save pipeline as New Dream. No direct Firestore writes are made from this page.
        · After saving, run a refresh to detect hits. As They Fell Before will update through the promote-hits flow.
        · Dictionary terms are capped at 500. Use search to find terms outside the visible set.
      </section>

    </div>
  );
}
