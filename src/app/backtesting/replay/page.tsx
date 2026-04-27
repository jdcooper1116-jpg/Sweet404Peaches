'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Hit grouping ─────────────────────────────────────────────────────────────

type RawHit = {
  id?:              string;
  termLabel?:       string;
  number?:          string;
  state?:           string;
  gameType?:        string;
  drawDate?:        string;
  drawTime?:        string;
  normalizedResult?: string;
  hitType?:         string;
  daysFromDream?:   number;
};

type HitRow = {
  candidate: string; state: string; gameType: string;
  drawDate: string; drawTime: string; result: string;
  hitType: 'straight' | 'boxed'; days: number;
};

type TermGroup = {
  term: string; hits: HitRow[];
  total: number; straight: number; boxed: number;
};

function groupHitsByTerm(rawHits: RawHit[]): TermGroup[] {
  const map = new Map<string, TermGroup>();
  for (const h of rawHits) {
    const term = String(h.termLabel || 'unknown-term').trim();
    if (!map.has(term)) map.set(term, { term, hits: [], total: 0, straight: 0, boxed: 0 });
    const g = map.get(term)!;
    const hitType = h.hitType === 'straight' ? 'straight' : 'boxed';
    g.hits.push({
      candidate: String(h.number || ''), state: String(h.state || ''),
      gameType: String(h.gameType || ''), drawDate: String(h.drawDate || ''),
      drawTime: String(h.drawTime || ''), result: String(h.normalizedResult || ''),
      hitType, days: Number(h.daysFromDream ?? 0),
    });
    g.total++; if (hitType === 'straight') g.straight++; else g.boxed++;
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => b.total - a.total || a.term.localeCompare(b.term));
  for (const g of groups) {
    g.hits.sort((a, b) => {
      const ak = `${a.drawDate} ${a.drawTime}`;
      const bk = `${b.drawDate} ${b.drawTime}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
  }
  return groups;
}

function HitLine({ hit }: { hit: HitRow }) {
  const isStraight = hit.hitType === 'straight';
  return (
    <div style={{
      display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
      padding: '5px 10px', borderRadius: '8px',
      background: isStraight ? 'rgba(74,124,89,0.12)' : 'rgba(160,124,74,0.10)',
      borderLeft: `3px solid ${isStraight ? '#4a7c59' : '#a07c4a'}`,
      fontSize: '0.83rem',
    }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{hit.candidate}</span>
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>→</span>
      <span style={{ color: '#b0b8ff', fontWeight: 600 }}>{hit.state}</span>
      <span style={{ fontFamily: 'monospace' }}>{hit.result}</span>
      <span style={{
        padding: '1px 7px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700,
        background: isStraight ? 'rgba(74,124,89,0.3)' : 'rgba(160,124,74,0.3)',
        color: isStraight ? '#6dbf8a' : '#d4a95a',
      }}>
        {isStraight ? '⬛ Straight' : '◻ Box'}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.76rem' }}>
        {hit.drawDate} · {hit.drawTime}{hit.days > 0 ? ` · Day ${hit.days}` : ' · Same day'}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReplayLabPage() {
  const { user } = useAuth();

  const [dreams,         setDreams]         = useState<any[]>([]);
  const [selectedId,     setSelectedId]     = useState('');
  const [hits,           setHits]           = useState<RawHit[]>([]);
  const [summary,        setSummary]        = useState<any | null>(null);
  const [loadingDreams,  setLoadingDreams]  = useState(true);
  const [loadingDetail,  setLoadingDetail]  = useState(false);
  const [runningEngine,  setRunningEngine]  = useState(false);
  const [message,        setMessage]        = useState('');
  const [error,          setError]          = useState('');
  const [viewMode,       setViewMode]       = useState<'grouped' | 'flat'>('grouped');
  const [termFilter,     setTermFilter]     = useState('');

  // ── Load dreams from server route ────────────────────────────────────────────
  async function loadDreams() {
    if (!user) return;
    setLoadingDreams(true);
    try {
      const res  = await fetch(`/api/backtest/list-dreams?ownerUid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.dreams)) {
        setDreams(data.dreams);
        if (data.dreams.length && !selectedId) {
          setSelectedId(data.dreams[0].id);
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoadingDreams(false); }
  }

  // ── Load hits + summary for selected dream from server route ─────────────────
  async function loadDreamDetail(id: string) {
    if (!user || !id) return;
    setLoadingDetail(true);
    setHits([]);
    setSummary(null);
    try {
      const res = await fetch(
        `/api/backtest/dream-detail?ownerUid=${encodeURIComponent(user.uid)}&backtestDreamId=${encodeURIComponent(id)}`
      );
      const data = await res.json();
      if (data.ok) {
        setHits(Array.isArray(data.hits) ? data.hits : []);
        setSummary(data.summary ?? null);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingDetail(false); }
  }

  useEffect(() => { void loadDreams(); }, [user]);
  useEffect(() => { if (selectedId) void loadDreamDetail(selectedId); }, [selectedId]);

  const selectedDream = useMemo(() => dreams.find(d => d.id === selectedId) ?? null, [dreams, selectedId]);
  const termGroups    = useMemo(() => groupHitsByTerm(hits), [hits]);
  const filteredGroups = useMemo(() => {
    const q = termFilter.trim().toLowerCase();
    return q ? termGroups.filter(g => g.term.toLowerCase().includes(q)) : termGroups;
  }, [termGroups, termFilter]);

  // ── Engine replay ─────────────────────────────────────────────────────────────
  async function handleRunEngineReplay() {
    if (!user || !selectedId || !selectedDream) { setError('Select a dream first.'); return; }

    setRunningEngine(true);
    setError('');
    setMessage('Querying engine across all states…');

    try {
      const engineRes = await fetch('/api/backtest/engine-replay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backtestDreamId:    selectedId,
          dreamDate:          selectedDream.dreamDate,
          lookaheadDays:      7,
          cash3Numbers:       selectedDream.cash3Numbers       ?? [],
          cash4Numbers:       selectedDream.cash4Numbers       ?? [],
          parsedTermMappings: selectedDream.parsedTermMappings ?? [],
        }),
      });
      const engineData = await engineRes.json();
      if (!engineRes.ok || !engineData.ok) throw new Error(engineData.error || 'Engine replay failed.');

      setMessage(`Engine returned ${engineData.totalHits} hits. Saving to Firestore…`);

      const saveRes = await fetch('/api/backtest/save-engine-replay-hits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid: user.uid, backtestDreamId: selectedId,
          dreamDate: selectedDream.dreamDate, hits: engineData.hits ?? [],
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.ok) throw new Error(saveData.error || 'Could not save hits.');

      // Reload from server to confirm persistence
      await loadDreamDetail(selectedId);
      await loadDreams();

      const errCount = engineData.errors?.length ?? 0;
      setMessage(
        `✓ Engine replay complete. ${engineData.totalHits} hit(s) — ` +
        `${engineData.straightHits} straight, ${engineData.boxedHits} boxed — ` +
        `${engineData.uniqueStates?.length ?? 0} state(s).` +
        (engineData.bestState ? ` Best: ${engineData.bestState}.` : '') +
        (errCount > 0 ? ` ⚠ ${errCount} group(s) failed.` : '')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Engine replay failed.');
    } finally { setRunningEngine(false); }
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

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Replay Lab</h1>
              <p>Select a saved dream and view or re-run its historical backtest. Hits are grouped by dream term.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/intake"  className="btn-secondary">Dream Intake</Link>
              <Link href="/backtesting/archive" className="btn-secondary">Archive</Link>
              <Link href="/fell-before"         className="btn-secondary">As They Fell Before</Link>
            </div>
          </div>
        </section>

        {/* Dream selector */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamSelect">Select Backtest Dream</label>
            <select id="dreamSelect" className="journal-select" value={selectedId}
              onChange={e => setSelectedId(e.target.value)} disabled={loadingDreams}>
              <option value="">Choose a saved backtest dream</option>
              {dreams.map(d => (
                <option key={d.id} value={d.id}>
                  {d.dreamDate || 'No Date'} · {d.source || '?'} · {d.totalHits ?? 0} hits · {d.status || '—'}
                </option>
              ))}
            </select>
          </div>

          {selectedDream && (
            <>
              <div className="journal-card-flat">
                <div className="journal-label">Window</div>
                <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>{selectedDream.activeWindowStart || '—'} → {selectedDream.activeWindowEnd || '—'}</div>
              </div>
              <div className="journal-card-flat">
                <div className="journal-label">Status</div>
                <div style={{
                  marginTop: '8px', fontWeight: 700,
                  color: selectedDream.status === 'engine-replay-complete' ? '#6dbf8a' : 'var(--ink-light)',
                }}>
                  {selectedDream.status || '—'}
                  {selectedDream.replaySource === 'lottery-engine' && ' ⚡'}
                </div>
              </div>
              <div className="journal-card-flat">
                <div className="journal-label">Candidates</div>
                <div style={{ marginTop: '8px', fontSize: '0.82rem', color: 'var(--ink-light)' }}>
                  Pick 3: {selectedDream.cash3Numbers?.length ?? 0} · Pick 4: {selectedDream.cash4Numbers?.length ?? 0}
                </div>
              </div>
            </>
          )}
        </section>

        {message && <section className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>{message}</section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f'  }}>{error}</section>}

        {/* Actions */}
        <section className="journal-card">
          <button type="button" className="btn-primary"
            onClick={handleRunEngineReplay} disabled={runningEngine || !selectedId}>
            {runningEngine ? 'Querying all states…' : '⚡ Run via Engine'}
          </button>
          <span style={{ marginLeft: '12px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>
            Re-run calls Railway lottery engine directly and saves fresh hits to Firestore.
          </span>
        </section>

        {/* Stats */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {[
            ['Hits', hits.length],
            ['Straight', summary?.straightHits ?? 0],
            ['Boxed', summary?.boxedHits ?? 0],
            ['Best State', summary?.bestState || '—'],
            ['Best Term', summary?.bestTerm || '—'],
            ['Unique States', Array.isArray(summary?.uniqueStates) ? summary.uniqueStates.length : 0],
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div className="journal-label">{label}</div>
              <div style={{ fontWeight: 700, fontSize: label === 'Hits' ? '1.4rem' : '1rem' }}>{val}</div>
            </div>
          ))}
          {summary?.replaySource && (
            <div>
              <div className="journal-label">Replay Source</div>
              <div style={{ color: summary.replaySource === 'lottery-engine' ? '#6dbf8a' : '#d4a95a', fontWeight: 700, fontSize: '0.85rem' }}>
                {summary.replaySource === 'lottery-engine' ? '⚡ Engine' : 'Manual'}
              </div>
            </div>
          )}
        </section>

        {/* Hits display */}
        {(hits.length > 0 || loadingDetail) && (
          <section className="journal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div className="page-header" style={{ margin: 0 }}>
                <h1 style={{ margin: 0 }}>
                  {loadingDetail ? 'Loading hits…' : `Hits (${hits.length})`}
                </h1>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {['grouped', 'flat'].map(mode => (
                  <button key={mode} type="button" onClick={() => setViewMode(mode as 'grouped' | 'flat')}
                    style={{
                      padding: '5px 14px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                      border:     viewMode === mode ? '2px solid var(--accent, #6C78FF)' : '2px solid rgba(255,255,255,0.15)',
                      background: viewMode === mode ? 'rgba(108,120,255,0.18)' : 'transparent',
                      color:      viewMode === mode ? '#fff' : 'rgba(255,255,255,0.55)',
                      fontWeight: viewMode === mode ? 700 : 400,
                    }}>
                    {mode === 'grouped' ? 'By Term' : 'Flat List'}
                  </button>
                ))}
                {viewMode === 'grouped' && (
                  <input className="journal-input" value={termFilter}
                    onChange={e => setTermFilter(e.target.value)}
                    placeholder="Filter term…"
                    style={{ padding: '5px 12px', fontSize: '0.8rem', width: '130px' }}
                  />
                )}
              </div>
            </div>

            {viewMode === 'grouped' ? (
              <div style={{ display: 'grid', gap: '20px' }}>
                {filteredGroups.length === 0 && <p style={{ color: 'var(--ink-light)' }}>No terms match.</p>}
                {filteredGroups.map(g => (
                  <div key={g.term} style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <strong>{g.term}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        {g.total} hit{g.total !== 1 ? 's' : ''} · {g.straight}↑ · {g.boxed}□
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '4px', paddingLeft: '10px' }}>
                      {g.hits.map((h, i) => <HitLine key={i} hit={h} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {hits.map((hit, i) => (
                  <div key={(hit as any).id || i} className="journal-card-flat"
                    style={{ borderLeft: `3px solid ${hit.hitType === 'straight' ? '#4a7c59' : '#a07c4a'}`, fontSize: '0.83rem' }}>
                    <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                      <div><strong>Term:</strong> {hit.termLabel || '—'}</div>
                      <div><strong>Num:</strong> <span style={{ fontFamily: 'monospace' }}>{hit.number || '—'}</span></div>
                      <div><strong>State:</strong> {hit.state || '—'}</div>
                      <div><strong>Game:</strong> {hit.gameType || '—'}</div>
                      <div><strong>Draw:</strong> {hit.drawTime || '—'}</div>
                      <div><strong>Date:</strong> {hit.drawDate || '—'}</div>
                      <div><strong>Type:</strong> <span style={{ color: hit.hitType === 'straight' ? '#6dbf8a' : '#d4a95a', fontWeight: 700 }}>{hit.hitType || '—'}</span></div>
                      <div><strong>Result:</strong> <span style={{ fontFamily: 'monospace' }}>{(hit as any).normalizedResult || '—'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!loadingDetail && hits.length === 0 && selectedId && (
          <section className="journal-card">
            <p>No hits saved for this dream yet. Click <strong>⚡ Run via Engine</strong> to query the lottery engine.</p>
          </section>
        )}

      </section>
    </main>
  );
}
