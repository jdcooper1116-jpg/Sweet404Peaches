'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { BookmarkCheck, MapPinned, Sparkles } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PinStatus = 'suggested' | 'pinned' | 'archived';

type PinnedPlay = {
  id:             string;
  number?:        string;
  gameType?:      string;
  state?:         string;
  states?:        string[];
  sourceTerm?:    string;
  sourceTerms?:   string[];
  source?:        string;
  reason?:        string;
  evidenceBadges?:string[];
  boxedKey?:      string;
  hitCount?:      number;
  status?:        PinStatus;
  dreamerName?:   string;
  createdAt?:     string | null;
  updatedAt?:     string | null;
  // Legacy fields from old schema
  label?:         string;
  familyKey?:     string;
  playType?:      string;
  score?:         number;
  reasons?:       string[];
};

// ─── Visual helpers ───────────────────────────────────────────────────────────

function NumberChip({ n, game }: { n: string; game?: string }) {
  const isC4 = game === 'cash4';
  return (
    <span style={{
      fontFamily: 'monospace', fontWeight: 900, fontSize: '1.4rem',
      letterSpacing: '0.08em', lineHeight: 1,
      background:   isC4 ? 'rgba(160,144,255,0.16)' : 'rgba(255,107,74,0.16)',
      border:       `1px solid ${isC4 ? 'rgba(160,144,255,0.32)' : 'rgba(255,107,74,0.32)'}`,
      color:        isC4 ? '#a090ff' : '#ff8a6a',
      borderRadius: '10px', padding: '5px 14px',
    }}>{n}</span>
  );
}

const STATUS_STYLE: Record<PinStatus, { bg: string; border: string; color: string }> = {
  suggested: { bg: 'rgba(255,204,80,0.14)',  border: 'rgba(255,204,80,0.32)',  color: '#ffcc50' },
  pinned:    { bg: 'rgba(255,107,74,0.14)',  border: 'rgba(255,107,74,0.32)',  color: '#ff8a6a' },
  archived:  { bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.40)' },
};

function StatusBadge({ status }: { status?: PinStatus }) {
  const s = STATUS_STYLE[status ?? 'suggested'];
  return (
    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'system-ui,sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {status ?? 'suggested'}
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  'hot-families':   'Hot Families',
  'state-playlists':'State Playlists',
  'forecast-board': 'Forecast Board',
  'active-window':  'Active Window',
  'manual':         'Manual',
};

function EvidenceBadge({ label }: { label: string }) {
  return (
    <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(96,224,154,0.12)', border: '1px solid rgba(96,224,154,0.26)', color: '#60e09a', fontFamily: 'system-ui,sans-serif' }}>
      {label}
    </span>
  );
}

function displayNumber(p: PinnedPlay): string {
  return p.number || p.label || p.familyKey || '—';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PinnedPlaysPage() {
  const { user } = useAuth();

  const [rows,        setRows]        = useState<PinnedPlay[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [message,     setMessage]     = useState('');
  const [actingId,    setActingId]    = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL'|PinStatus>('ALL');
  const [stateFilter,  setStateFilter]  = useState('');
  const [gameFilter,   setGameFilter]   = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [numSearch,    setNumSearch]    = useState('');
  const [termSearch,   setTermSearch]   = useState('');

  // Manual add form
  const [showAdd,   setShowAdd]   = useState(false);
  const [addNum,    setAddNum]    = useState('');
  const [addGame,   setAddGame]   = useState<'cash3'|'cash4'>('cash3');
  const [addState,  setAddState]  = useState('');
  const [addTerm,   setAddTerm]   = useState('');
  const [addReason, setAddReason] = useState('');
  const [addStatus, setAddStatus] = useState<PinStatus>('suggested');
  const [adding,    setAdding]    = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────────
  async function loadPlays() {
    if (!user) { setLoading(false); return; }
    try {
      const qs = new URLSearchParams({ ownerUid: user.uid });
      const res  = await fetch(`/api/pinned-plays?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      setRows(Array.isArray(data.plays) ? data.plays : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pinned plays.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadPlays(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status action ───────────────────────────────────────────────────────────
  async function changeStatus(rowId: string, newStatus: PinStatus) {
    if (!user || actingId) return;
    setActingId(rowId); setError(''); setMessage('');
    try {
      const res = await fetch('/api/pinned-plays', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUid: user.uid, pinnedPlayId: rowId, status: newStatus }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update failed.');
      setMessage(`Status updated to ${newStatus}.`);
      await loadPlays();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.');
    } finally { setActingId(''); }
  }

  // ── Manual add ──────────────────────────────────────────────────────────────
  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !addNum.trim()) return;
    setAdding(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/pinned-plays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid:   user.uid,
          number:     addNum.trim(),
          gameType:   addGame,
          state:      addState.trim().toUpperCase(),
          sourceTerm: addTerm.trim(),
          reason:     addReason.trim(),
          source:     'manual',
          status:     addStatus,
          evidenceBadges: [],
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Create failed.');
      setMessage(data.duplicate ? 'Already pinned — record updated.' : 'Pinned play added.');
      setAddNum(''); setAddState(''); setAddTerm(''); setAddReason('');
      setShowAdd(false);
      await loadPlays();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add pinned play.');
    } finally { setAdding(false); }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const allSources = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.source) s.add(r.source); });
    return Array.from(s).sort();
  }, [rows]);

  const allStates = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => {
      if (r.state) s.add(r.state);
      (r.states ?? []).forEach((st: string) => s.add(st));
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const qs = stateFilter.trim().toUpperCase();
    const qn = numSearch.trim();
    const qt = termSearch.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter)   return false;
      if (qs && r.state?.toUpperCase() !== qs &&
          !(r.states ?? []).some((s: string) => s.includes(qs)))  return false;
      if (gameFilter !== 'all' && r.gameType !== gameFilter)     return false;
      if (sourceFilter !== 'all' && r.source !== sourceFilter)   return false;
      if (qn && !displayNumber(r).includes(qn))                  return false;
      if (qt) {
        const terms = [r.sourceTerm, ...(r.sourceTerms ?? [])].filter(Boolean).join(' ').toLowerCase();
        if (!terms.includes(qt) && !(r.reason ?? '').toLowerCase().includes(qt)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, stateFilter, gameFilter, sourceFilter, numSearch, termSearch]);

  const suggested = rows.filter(r => r.status === 'suggested' || !r.status);
  const pinned    = rows.filter(r => r.status === 'pinned');
  const archived  = rows.filter(r => r.status === 'archived');
  const statesSet = new Set(rows.flatMap(r => [r.state, ...(r.states ?? [])].filter(Boolean)));
  const termsSet  = new Set(rows.flatMap(r => [r.sourceTerm, ...(r.sourceTerms ?? [])].filter(Boolean)));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="page-header">
            <h1>Pinned Plays</h1>
            <p>Promoted candidate numbers from active dreams, fell-before evidence, and boxed convergence. Numbers are here because the system found a reason.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/hot-numbers" className="btn-secondary">Hot Families</Link>
            <Link href="/playlists"   className="btn-secondary">State Playlists</Link>
            <button type="button" className="btn-primary" onClick={() => setShowAdd(v => !v)} style={{ minHeight: '40px' }}>
              {showAdd ? 'Cancel' : '+ Manual Pin'}
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {([
          ['Suggested', suggested.length, '#ffcc50'],
          ['Pinned',    pinned.length,    '#ff8a6a'],
          ['Archived',  archived.length,  'rgba(255,255,255,0.40)'],
          ['States',    statesSet.size,   '#60e09a'],
          ['Terms',     termsSet.size,    '#a090ff'],
        ] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '18px', padding: '14px 18px' }}>
            <strong style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-0.05em', display: 'block', lineHeight: 1, color, fontFamily: 'system-ui,sans-serif' }}>{val}</strong>
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', fontFamily: 'system-ui,sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Manual add form */}
      {showAdd && (
        <section className="journal-card" style={{ borderLeft: '3px solid #ff6b4a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: '#ff8a6a' }}>
            <BookmarkCheck size={18} strokeWidth={1.8} />
            <strong style={{ fontFamily: 'system-ui,sans-serif', fontWeight: 800 }}>Manual Pin</strong>
          </div>
          <form onSubmit={handleManualAdd} style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>
              <div>
                <label className="journal-label">Number *</label>
                <input className="journal-input" value={addNum} onChange={e => setAddNum(e.target.value)} placeholder="856" style={{ fontFamily: 'monospace' }} required />
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', marginTop: '3px' }}>Leading zeros preserved</div>
              </div>
              <div>
                <label className="journal-label">Game</label>
                <select className="journal-select" value={addGame} onChange={e => setAddGame(e.target.value as 'cash3'|'cash4')}>
                  <option value="cash3">Cash 3</option>
                  <option value="cash4">Cash 4</option>
                </select>
              </div>
              <div>
                <label className="journal-label">State</label>
                <input className="journal-input" value={addState} onChange={e => setAddState(e.target.value)} placeholder="GA" style={{ textTransform: 'uppercase' }} />
              </div>
              <div>
                <label className="journal-label">Term / Source</label>
                <input className="journal-input" value={addTerm} onChange={e => setAddTerm(e.target.value)} placeholder="car, sister…" />
              </div>
              <div>
                <label className="journal-label">Reason</label>
                <input className="journal-input" value={addReason} onChange={e => setAddReason(e.target.value)} placeholder="Why this number?" />
              </div>
              <div>
                <label className="journal-label">Status</label>
                <select className="journal-select" value={addStatus} onChange={e => setAddStatus(e.target.value as PinStatus)}>
                  <option value="suggested">Suggested</option>
                  <option value="pinned">Pinned</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={adding} style={{ width: 'fit-content' }}>
              {adding ? 'Saving…' : 'Add Pinned Play'}
            </button>
          </form>
        </section>
      )}

      {/* Feedback */}
      {message && <div style={{ padding: '12px 16px', borderRadius: '14px', border: '1px solid rgba(96,224,154,0.28)', background: 'rgba(96,224,154,0.08)', color: '#60e09a', fontSize: '13px' }}>{message}</div>}
      {error   && <div style={{ padding: '12px 16px', borderRadius: '14px', border: '1px solid rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090', fontSize: '13px' }}>{error}</div>}

      {/* Filters */}
      <section className="journal-card-flat" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
        <div>
          <label className="journal-label" htmlFor="statusFil">Status</label>
          <select id="statusFil" className="journal-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="ALL">All</option>
            <option value="suggested">Suggested</option>
            <option value="pinned">Pinned</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="journal-label" htmlFor="stateFil">State</label>
          <select id="stateFil" className="journal-select" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="">All States</option>
            {allStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="journal-label" htmlFor="gameFil">Game</label>
          <select id="gameFil" className="journal-select" value={gameFilter} onChange={e => setGameFilter(e.target.value)}>
            <option value="all">All Games</option>
            <option value="cash3">Cash 3</option>
            <option value="cash4">Cash 4</option>
          </select>
        </div>
        <div>
          <label className="journal-label" htmlFor="srcFil">Source</label>
          <select id="srcFil" className="journal-select" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="all">All Sources</option>
            {allSources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>)}
          </select>
        </div>
        <div>
          <label className="journal-label" htmlFor="numSrch">Number</label>
          <input id="numSrch" className="journal-input" value={numSearch} onChange={e => setNumSearch(e.target.value)} placeholder="856, 015…" style={{ fontFamily: 'monospace' }} />
        </div>
        <div>
          <label className="journal-label" htmlFor="termSrch">Term / Reason</label>
          <input id="termSrch" className="journal-input" value={termSearch} onChange={e => setTermSearch(e.target.value)} placeholder="car, sister…" />
        </div>
      </section>

      {/* Loading */}
      {loading && <section className="journal-card"><p style={{ margin: 0, color: 'rgba(255,255,255,0.55)' }}>Loading pinned plays…</p></section>}

      {/* Empty */}
      {!loading && rows.length === 0 && (
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#a090ff' }}>
            <Sparkles size={18} />
            <strong>No pinned plays yet</strong>
          </div>
          <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,0.50)', lineHeight: 1.7 }}>
            Candidates are promoted from Hot Families and State Playlists when the system finds convergence. You can also add plays manually above.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link href="/hot-numbers" className="btn-secondary">→ Hot Families</Link>
            <Link href="/playlists"   className="btn-secondary">→ State Playlists</Link>
          </div>
        </section>
      )}

      {!loading && rows.length > 0 && filtered.length === 0 && (
        <section className="journal-card-flat" style={{ color: 'rgba(255,255,255,0.50)', fontSize: '14px' }}>
          No plays match the current filters.
        </section>
      )}

      {/* Candidate cards */}
      {!loading && filtered.length > 0 && (
        <section style={{ display: 'grid', gap: '14px' }}>
          {filtered.map(row => {
            const num     = displayNumber(row);
            const terms   = [...new Set([row.sourceTerm, ...(row.sourceTerms ?? [])].filter(Boolean))];
            const states  = [...new Set([row.state, ...(row.states ?? [])].filter(Boolean))];
            const badges  = row.evidenceBadges ?? row.reasons ?? [];
            const srcLabel= SOURCE_LABELS[row.source ?? ''] ?? row.source ?? 'Manual';
            const status  = (row.status ?? 'suggested') as PinStatus;
            const isActing= actingId === row.id;

            return (
              <article key={row.id} className="journal-card" style={{
                borderLeft: status === 'pinned'
                  ? '3px solid #ff8a6a'
                  : status === 'archived'
                  ? '3px solid rgba(255,255,255,0.12)'
                  : '3px solid #ffcc50',
                opacity: status === 'archived' ? 0.70 : 1,
              }}>

                {/* Top row — number + status + game */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <NumberChip n={num} game={row.gameType} />
                    {row.gameType && (
                      <span style={{
                        fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '6px',
                        background: row.gameType === 'cash3' ? 'rgba(255,107,74,0.14)' : 'rgba(160,144,255,0.14)',
                        border: `1px solid ${row.gameType === 'cash3' ? 'rgba(255,107,74,0.28)' : 'rgba(160,144,255,0.28)'}`,
                        color: row.gameType === 'cash3' ? '#ff8a6a' : '#a090ff',
                        textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'system-ui,sans-serif',
                      }}>{row.gameType}</span>
                    )}
                    <StatusBadge status={status} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', textAlign: 'right', lineHeight: 1.6 }}>
                    {srcLabel}
                    {row.updatedAt && <div>{row.updatedAt.slice(0, 10)}</div>}
                  </div>
                </div>

                {/* Terms */}
                {terms.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {terms.map(t => (
                      <span key={t} style={{ padding: '4px 11px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,107,74,0.12)', border: '1px solid rgba(255,107,74,0.24)', color: '#ff8a6a' }}>{t}</span>
                    ))}
                  </div>
                )}

                {/* States */}
                {states.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                    {states.map(s => (
                      <span key={s} style={{ padding: '3px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: 800, background: 'rgba(96,224,154,0.12)', border: '1px solid rgba(96,224,154,0.24)', color: '#60e09a', fontFamily: 'system-ui,sans-serif' }}>{s}</span>
                    ))}
                  </div>
                )}

                {/* Reason + evidence badges */}
                {row.reason && (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px', lineHeight: 1.5 }}>
                    {row.reason}
                  </div>
                )}
                {badges.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                    {badges.map((b: string) => <EvidenceBadge key={b} label={b} />)}
                  </div>
                )}

                {/* Dreamer + score */}
                {(row.dreamerName || row.score || row.hitCount) && (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', marginBottom: '10px' }}>
                    {row.dreamerName && <span>{row.dreamerName} · </span>}
                    {row.hitCount  != null && row.hitCount > 0  && <span>{row.hitCount} fell-before hits · </span>}
                    {row.score     != null && row.score   > 0   && <span>score {row.score}</span>}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  {status === 'suggested' && (
                    <button type="button" className="btn-primary" disabled={isActing} onClick={() => changeStatus(row.id, 'pinned')} style={{ fontSize: '12px', padding: '7px 16px', minHeight: '36px' }}>
                      {isActing ? '…' : '📌 Pin'}
                    </button>
                  )}
                  {status === 'suggested' && (
                    <button type="button" className="btn-secondary" disabled={isActing} onClick={() => changeStatus(row.id, 'archived')} style={{ fontSize: '12px', padding: '7px 16px', minHeight: '36px' }}>
                      {isActing ? '…' : 'Archive'}
                    </button>
                  )}
                  {status === 'pinned' && (
                    <button type="button" className="btn-secondary" disabled={isActing} onClick={() => changeStatus(row.id, 'archived')} style={{ fontSize: '12px', padding: '7px 16px', minHeight: '36px' }}>
                      {isActing ? '…' : 'Archive'}
                    </button>
                  )}
                  {status === 'archived' && (
                    <button type="button" className="btn-secondary" disabled={isActing} onClick={() => changeStatus(row.id, 'pinned')} style={{ fontSize: '12px', padding: '7px 16px', minHeight: '36px' }}>
                      {isActing ? '…' : '↩ Restore'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

    </div>
  );
}
