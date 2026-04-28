'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, Pin, Save, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

type PinStatus = 'pinned' | 'played' | 'won' | 'archived';
type PinnedPlay = {
  id: string; label?: string; number?: string; familyKey?: string;
  playType?: string; state?: string; score?: number; dreamerScope?: string;
  playDate?: string; status?: PinStatus; notes?: string; reasons?: string[];
};

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function PinnedPlaysPage() {
  const { user } = useAuth();

  const [rows,          setRows]         = useState<PinnedPlay[]>([]);
  const [pageLoading,   setPageLoading]  = useState(true);
  const [error,         setError]        = useState('');
  const [message,       setMessage]      = useState('');
  const [savingId,      setSavingId]     = useState('');
  const [statusById,    setStatusById]   = useState<Record<string, PinStatus>>({});
  const [notesById,     setNotesById]    = useState<Record<string, string>>({});

  const [playDateFilter,    setPlayDateFilter]    = useState(todayIso());
  const [statusFilter,      setStatusFilter]      = useState<'ALL' | PinStatus>('ALL');
  const [dreamerScopeFilter, setDreamerScopeFilter] = useState('ALL');

  async function loadPlays() {
    if (!user) { setPageLoading(false); return; }
    try {
      const qs = new URLSearchParams({ ownerUid: user.uid });
      if (playDateFilter) qs.set('playDate', playDateFilter);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (dreamerScopeFilter !== 'ALL') qs.set('dreamerScope', dreamerScopeFilter);
      const res  = await fetch(`/api/pinned-plays?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      const plays = Array.isArray(data.plays) ? data.plays : [];
      setRows(plays);
      // Initialise local edit state
      const initStatus: Record<string, PinStatus> = {};
      const initNotes:  Record<string, string>     = {};
      plays.forEach((r: PinnedPlay) => {
        initStatus[r.id] = r.status ?? 'pinned';
        initNotes[r.id]  = r.notes  ?? '';
      });
      setStatusById(initStatus);
      setNotesById(initNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pinned plays.');
    } finally { setPageLoading(false); }
  }

  useEffect(() => { void loadPlays(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleScopes = useMemo(() =>
    [...new Set(rows.map(r => r.dreamerScope).filter(Boolean))].sort(),
    [rows]
  );

  // Apply client-side filters (date + scope already sent to route; status may vary)
  const filteredRows = useMemo(() =>
    rows.filter(r => dreamerScopeFilter === 'ALL' || r.dreamerScope === dreamerScopeFilter),
    [rows, dreamerScopeFilter]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PinnedPlay[]>();
    for (const row of filteredRows) {
      const key = row.playType || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [
      { key: 'agreement', label: 'Strong Agreements' },
      { key: 'boxed',     label: 'Boxed Plays'       },
      { key: 'straight',  label: 'Straight Plays'    },
      { key: 'watch',     label: 'Watch Only'        },
    ].map(s => ({ ...s, rows: map.get(s.key) ?? [] }));
  }, [filteredRows]);

  async function saveRow(rowId: string) {
    if (!user) return;
    setSavingId(rowId); setError(''); setMessage('');
    try {
      const res = await fetch('/api/pinned-plays', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid: user.uid, pinnedPlayId: rowId,
          status: statusById[rowId],
          notes:  notesById[rowId] ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Update failed.');
      setMessage('Pinned play updated.');
      await loadPlays();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update pinned play.');
    } finally { setSavingId(''); }
  }

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div className="page-header">
            <h1>Pinned Plays</h1>
            <p>Your daily shortlist of pinned families and numbers from the Forecast Board.</p>
          </div>
        </section>

        {/* Filters */}
        <section className="journal-card-flat">
          <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div>
              <label className="journal-label">Play Date</label>
              <input type="date" className="journal-input" value={playDateFilter}
                onChange={e => setPlayDateFilter(e.target.value)} />
            </div>
            <div>
              <label className="journal-label">Status</label>
              <select className="journal-select" value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'ALL' | PinStatus)}>
                <option value="ALL">All</option>
                <option value="pinned">pinned</option>
                <option value="played">played</option>
                <option value="won">won</option>
                <option value="archived">archived</option>
              </select>
            </div>
            <div>
              <label className="journal-label">Dreamer Scope</label>
              <select className="journal-select" value={dreamerScopeFilter}
                onChange={e => setDreamerScopeFilter(e.target.value)}>
                <option value="ALL">All</option>
                {visibleScopes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-secondary" onClick={() => void loadPlays()}>Apply Filters</button>
            <button type="button" className="btn-secondary" onClick={() => {
              setPlayDateFilter(todayIso()); setStatusFilter('ALL'); setDreamerScopeFilter('ALL');
            }}>Reset</button>
          </div>
        </section>

        {message && <div className="journal-card-flat" style={{ borderColor:'#cfe5c8',background:'#f5fbf2',color:'#315a2b' }}>{message}</div>}
        {error   && <div className="journal-card-flat" style={{ borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{error}</div>}

        {pageLoading && <section className="journal-card"><p>Loading pinned plays…</p></section>}

        {!pageLoading && filteredRows.length === 0 && (
          <section className="journal-card">
            <div style={{ display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px',color:'var(--deep-plum)' }}>
              <Sparkles size={18} />
              <strong>No pinned plays in this view</strong>
            </div>
            <p style={{ margin:0,color:'var(--ink-light)' }}>
              Pin items from the <Link href="/forecast-board" style={{color:'#b0b8ff'}}>Forecast Board</Link> to build your daily shortlist.
            </p>
          </section>
        )}

        {grouped.map(section => section.rows.length === 0 ? null : (
          <article key={section.key} className="journal-card">
            <div style={{ display:'flex',alignItems:'center',gap:'10px',color:'var(--deep-plum)',marginBottom:'14px' }}>
              <BookmarkCheck size={18} />
              <strong style={{ fontSize:'20px' }}>{section.label}</strong>
            </div>
            <div style={{ display:'grid',gap:'14px' }}>
              {section.rows.map(row => (
                <div key={row.id} className="journal-card-flat">
                  <div style={{ display:'flex',justifyContent:'space-between',gap:'16px',alignItems:'flex-start',flexWrap:'wrap' }}>
                    <div>
                      <div style={{ display:'flex',alignItems:'center',gap:'10px',color:'var(--deep-plum)',marginBottom:'6px' }}>
                        <Pin size={15} />
                        <strong style={{ fontSize:'16px' }}>{row.label || row.number || row.familyKey || '—'}</strong>
                      </div>
                      <div style={{ color:'var(--ink-light)',fontSize:'13px' }}>
                        {row.number ? `Number: ${row.number}` : `Family: ${row.familyKey || '—'}`}
                      </div>
                      <div style={{ color:'var(--ink-light)',fontSize:'13px',marginTop:'3px' }}>
                        Scope: {row.dreamerScope || '—'} · State: {row.state || '—'} · Date: {row.playDate || '—'}
                      </div>
                    </div>
                    <div className="journal-card-flat" style={{ minWidth:'120px',textAlign:'center' }}>
                      <div className="journal-label">Score</div>
                      <div style={{ fontSize:'24px',fontWeight:700,color:'var(--deep-plum)' }}>{row.score || 0}</div>
                    </div>
                  </div>

                  <div style={{ display:'grid',gap:'10px',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',marginTop:'12px' }}>
                    <div>
                      <label className="journal-label">Status</label>
                      <select className="journal-select"
                        value={statusById[row.id] || 'pinned'}
                        onChange={e => setStatusById(cur => ({ ...cur, [row.id]: e.target.value as PinStatus }))}>
                        <option value="pinned">pinned</option>
                        <option value="played">played</option>
                        <option value="won">won</option>
                        <option value="archived">archived</option>
                      </select>
                    </div>
                    <div>
                      <label className="journal-label">Notes</label>
                      <textarea className="journal-textarea" rows={2}
                        value={notesById[row.id] || ''}
                        onChange={e => setNotesById(cur => ({ ...cur, [row.id]: e.target.value }))}
                        placeholder="Add notes, results, or outcome…" />
                    </div>
                  </div>

                  <div style={{ marginTop:'10px' }}>
                    <button type="button" className="btn-primary"
                      disabled={savingId === row.id}
                      onClick={() => saveRow(row.id)}>
                      <span style={{ display:'inline-flex',alignItems:'center',gap:'7px' }}>
                        <Save size={13} />{savingId === row.id ? 'Saving…' : 'Save Update'}
                      </span>
                    </button>
                  </div>

                  {(row.reasons?.length ?? 0) > 0 && (
                    <div className="journal-card-flat" style={{ marginTop:'10px' }}>
                      <div className="journal-label">Reasons</div>
                      <ul style={{ margin:0,paddingLeft:'18px',color:'var(--ink-light)',fontSize:'13px' }}>
                        {(row.reasons ?? []).map(r => <li key={r} style={{ marginBottom:'4px' }}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
    </div>
  );
}
