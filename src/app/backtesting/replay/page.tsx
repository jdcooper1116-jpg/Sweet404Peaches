'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Hit grouping logic ────────────────────────────────────────────────────────

type RawHit = {
  id?: string;
  termLabel?:       string;
  number?:          string;
  state?:           string;
  gameType?:        string;
  drawDate?:        string;
  drawTime?:        string;
  normalizedResult?: string;
  hitType?:         string;
  daysFromDream?:   number;
  sameDay?:         boolean;
};

type HitRow = {
  candidate:  string;
  state:      string;
  gameType:   string;
  drawDate:   string;
  drawTime:   string;
  result:     string;
  hitType:    'straight' | 'boxed';
  days:       number;
};

type TermGroup = {
  term:    string;
  hits:    HitRow[];
  total:   number;
  straight: number;
  boxed:   number;
};

function groupHitsByTerm(rawHits: RawHit[]): TermGroup[] {
  const termMap = new Map<string, TermGroup>();

  for (const h of rawHits) {
    const term = String(h.termLabel || 'unknown-term').trim();
    if (!termMap.has(term)) {
      termMap.set(term, { term, hits: [], total: 0, straight: 0, boxed: 0 });
    }
    const group = termMap.get(term)!;
    const hitType = h.hitType === 'straight' ? 'straight' : 'boxed';
    group.hits.push({
      candidate: String(h.number  || ''),
      state:     String(h.state   || ''),
      gameType:  String(h.gameType || ''),
      drawDate:  String(h.drawDate || ''),
      drawTime:  String(h.drawTime || ''),
      result:    String(h.normalizedResult || ''),
      hitType,
      days:      Number(h.daysFromDream ?? 0),
    });
    group.total++;
    if (hitType === 'straight') group.straight++;
    else group.boxed++;
  }

  const groups = Array.from(termMap.values());
  // Sort by most hits first, then alphabetically.
  groups.sort((a, b) => b.total - a.total || a.term.localeCompare(b.term));
  // Within each group sort by date.
  for (const g of groups) {
    g.hits.sort((a, b) => {
      const ak = `${a.drawDate} ${a.drawTime}`;
      const bk = `${b.drawDate} ${b.drawTime}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
  }

  return groups;
}

// ─── Hit row display ──────────────────────────────────────────────────────────

function HitLine({ hit }: { hit: HitRow }) {
  const isStraight = hit.hitType === 'straight';
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      alignItems: 'center',
      padding: '6px 10px',
      borderRadius: '8px',
      background: isStraight ? 'rgba(74,124,89,0.12)' : 'rgba(160,124,74,0.10)',
      borderLeft: `3px solid ${isStraight ? '#4a7c59' : '#a07c4a'}`,
      fontSize: '0.84rem',
    }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{hit.candidate}</span>
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
      <span style={{ color: hit.state ? '#b0b8ff' : 'inherit', fontWeight: 600 }}>{hit.state}</span>
      <span style={{ fontFamily: 'monospace' }}>{hit.result}</span>
      <span style={{
        padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
        background:  isStraight ? 'rgba(74,124,89,0.3)'   : 'rgba(160,124,74,0.3)',
        color:       isStraight ? '#6dbf8a'                : '#d4a95a',
      }}>
        {isStraight ? '⬛ Straight' : '◻ Box'}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>
        {hit.drawDate} · {hit.drawTime}
        {hit.days > 0 ? ` · Day ${hit.days}` : ' · Same day'}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BacktestingReplayPage() {
  const { user } = useAuth();

  const [dreams,             setDreams]             = useState<any[]>([]);
  const [selectedId,         setSelectedId]         = useState('');
  const [running,            setRunning]             = useState(false);
  const [runningEngine,      setRunningEngine]       = useState(false);
  const [loadingDreams,      setLoadingDreams]       = useState(true);
  const [loadingData,        setLoadingData]         = useState(false);
  const [savedResults,       setSavedResults]        = useState<any[]>([]);
  const [hits,               setHits]                = useState<RawHit[]>([]);
  const [summary,            setSummary]             = useState<any | null>(null);
  const [message,            setMessage]             = useState('');
  const [error,              setError]               = useState('');
  const [viewMode,           setViewMode]            = useState<'grouped' | 'flat'>('grouped');
  const [termFilter,         setTermFilter]          = useState('');

  // Load dream list via server route (no client Firestore).
  useEffect(() => {
    async function load() {
      if (!user) { setDreams([]); setLoadingDreams(false); return; }
      try {
        const res  = await fetch(`/api/backtest/list-dreams?ownerUid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Could not load backtest dreams.');
        const rows = Array.isArray(data.dreams) ? data.dreams : [];
        setDreams(rows);
        if (rows.length) setSelectedId((id: string) => id || rows[0].id);
      } catch (err) {
        console.error(err);
        setError('Could not load backtest dreams.');
      } finally {
        setLoadingDreams(false);
      }
    }
    void load();
  }, [user]);

  // When selection changes: derive summary from list-dreams response (no extra Firestore reads).
  // Hits are populated from engine replay response in memory.
  useEffect(() => {
    setSavedResults([]);
    setHits([]);
    // Derive summary stats from the selected dream's list-dreams data
    if (selectedDream) {
      setSummary({
        totalHits:    selectedDream.totalHits    ?? 0,
        straightHits: selectedDream.straightHits ?? 0,
        boxedHits:    selectedDream.boxedHits    ?? 0,
        bestState:    selectedDream.bestState    ?? '',
        bestTerm:     selectedDream.bestTerm     ?? '',
        uniqueStates: selectedDream.uniqueStates ?? [],
        replaySource: selectedDream.replaySource ?? '',
      });
    } else {
      setSummary(null);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDream = useMemo(
    () => dreams.find(d => d.id === selectedId) ?? null,
    [dreams, selectedId]
  );

  // Grouped hits.
  const termGroups = useMemo(() => groupHitsByTerm(hits), [hits]);

  const filteredGroups = useMemo(() => {
    const q = termFilter.trim().toLowerCase();
    if (!q) return termGroups;
    return termGroups.filter(g => g.term.toLowerCase().includes(q));
  }, [termGroups, termFilter]);

  // Manual replay (legacy path — disabled; engine path is primary)
  async function handleRunManualReplay() {
    setError('Manual replay is no longer supported. Use ⚡ Run via Engine instead.');
  }

  // ── Engine replay ───────────────────────────────────────────────────────────
  async function handleRunEngineReplay() {
    if (!user || !selectedId) { setError('Select a dream first.'); return; }
    if (!selectedDream) { setError('Could not load selected dream.'); return; }

    setRunningEngine(true); setError(''); setMessage('Querying engine across all states…');

    try {
      const res = await fetch('/api/backtest/engine-replay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backtestDreamId:    selectedId,
          dreamDate:          selectedDream.dreamDate,
          lookaheadDays:      7,
          cash3Numbers:       selectedDream.cash3Numbers       ?? [],
          cash4Numbers:       selectedDream.cash4Numbers       ?? [],
          parsedTermMappings: selectedDream.parsedTermMappings ?? [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Engine replay failed.');

      // Save hits via Admin route.
      const saveRes = await fetch('/api/backtest/save-engine-replay-hits', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid:    user.uid,
          backtestDreamId: selectedId,
          dreamDate:   selectedDream.dreamDate,
          // Pass dreamer from the selected dream — avoids hardcoded owner-self
          dreamerId:   selectedDream.dreamerId   ?? 'owner-self',
          dreamerName: selectedDream.dreamerName ?? '',
          hits:        data.hits ?? [],
        }),
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.ok) throw new Error(saveData.error || 'Could not save hits.');

      // Use hits from engine response directly (no Firestore re-read needed)
      setHits((data.hits ?? []) as RawHit[]);
      setSummary({
        totalHits:    data.totalHits    ?? 0,
        straightHits: data.straightHits ?? 0,
        boxedHits:    data.boxedHits    ?? 0,
        bestState:    data.bestState    ?? '',
        bestTerm:     data.bestTerm     ?? '',
        uniqueStates: data.uniqueStates ?? [],
        replaySource: 'lottery-engine',
      });

      const errCount = data.errors?.length ?? 0;
      setMessage(
        `✓ Engine replay complete. ${data.totalHits} hit(s) — ` +
        `${data.straightHits} straight, ${data.boxedHits} boxed — ` +
        `across ${data.uniqueStates?.length ?? 0} state(s).` +
        (data.bestState ? ` Best state: ${data.bestState}.` : '') +
        (errCount > 0 ? ` ⚠ ${errCount} state group(s) had errors.` : '')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Engine replay failed.');
    } finally {
      setRunningEngine(false);
    }
  }

  const isWorking      = running || runningEngine;
  const hasManualData  = savedResults.length > 0;
  const isEngineSource = selectedDream?.status === 'engine-replay-complete';

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        {/* Header */}
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Replay Lab</h1>
              <p>
                View or re-run historical backtests for any saved dream.
                <strong> ⚡ Run via Engine</strong> queries Railway directly across all states.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/intake"  className="btn-secondary">Dream Intake</Link>
              <Link href="/backtesting/archive" className="btn-secondary">Archive</Link>
              <Link href="/fell-before"         className="btn-secondary">As They Fell Before</Link>
            </div>
          </div>
        </section>

        {/* Dream selector */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamSelect">Select Backtest Dream</label>
            <select id="dreamSelect" className="journal-select" value={selectedId}
              onChange={e => setSelectedId(e.target.value)} disabled={loadingDreams}>
              <option value="">Choose a saved backtest dream</option>
              {dreams.map(d => (
                <option key={d.id} value={d.id}>
                  {d.dreamerName ? `[${d.dreamerName}] ` : ''}{d.dreamDate || 'No Date'} · {d.source || 'unknown'} · {d.status || '—'}
                </option>
              ))}
            </select>
          </div>

          <div className="journal-card-flat">
            <div className="journal-label">Window</div>
            <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.55)' }}>
              {selectedDream
                ? `${selectedDream.activeWindowStart || '—'} → ${selectedDream.activeWindowEnd || '—'}`
                : 'Select a dream'}
            </div>
          </div>

          <div className="journal-card-flat">
            <div className="journal-label">Status</div>
            <div style={{
              marginTop: '8px', fontWeight: 700,
              color: isEngineSource ? '#6dbf8a' : selectedDream?.status === 'replay-complete' ? '#d4a95a' : 'var(--ink-light)',
            }}>
              {selectedDream?.status || '—'}
            </div>
          </div>

          {selectedDream && (
            <div className="journal-card-flat">
              <div className="journal-label">Candidates</div>
              <div style={{ marginTop: '8px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>
                Pick 3: {selectedDream.cash3Numbers?.length ?? 0} · Pick 4: {selectedDream.cash4Numbers?.length ?? 0}
              </div>
            </div>
          )}
        </section>

        {/* Messages */}
        {message && <section className="journal-card-flat" style={{ borderColor: 'rgba(96,224,154,0.28)', background: 'rgba(96,224,154,0.08)', color: '#60e09a' }}>{message}</section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090'  }}>{error}</section>}

        {/* Action buttons */}
        <section className="journal-card">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn-primary" onClick={handleRunEngineReplay}
              disabled={isWorking || !selectedId}>
              {runningEngine ? 'Querying all states…' : '⚡ Run via Engine'}
            </button>

            <button type="button" className="btn-secondary" onClick={handleRunManualReplay}
              disabled={isWorking || !selectedId || !hasManualData}
              title={!hasManualData ? 'No manual results uploaded for this dream' : ''}
              style={{ opacity: !hasManualData ? 0.4 : 1, cursor: !hasManualData ? 'not-allowed' : 'pointer' }}>
              {running ? 'Running…' : 'Run via Saved Results'}
            </button>

            {!hasManualData && selectedId && (
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
                Engine path is primary — no manual results needed.
              </span>
            )}
          </div>
        </section>

        {/* Stats bar */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            ['Total Hits',    hits.length],
            ['Straight',      summary?.straightHits ?? 0],
            ['Boxed',         summary?.boxedHits    ?? 0],
            ['Best State',    summary?.bestState    || '—'],
            ['Best Term',     summary?.bestTerm     || '—'],
            ['Unique States', Array.isArray(summary?.uniqueStates) ? summary.uniqueStates.length : 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="journal-card-flat">
              <div className="journal-label">{label}</div>
              <div style={{ fontWeight: 700, fontSize: label === 'Total Hits' ? '1.4rem' : '1rem' }}>{value}</div>
            </div>
          ))}
          {summary?.replaySource && (
            <div className="journal-card-flat">
              <div className="journal-label">Source</div>
              <div style={{ color: summary.replaySource === 'lottery-engine' ? '#6dbf8a' : '#d4a95a', fontWeight: 700, fontSize: '0.85rem' }}>
                {summary.replaySource === 'lottery-engine' ? '⚡ Engine' : 'Manual'}
              </div>
            </div>
          )}
        </section>

        {/* Hit display */}
        {hits.length > 0 && (
          <section className="journal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div className="page-header" style={{ margin: 0 }}>
                <h1 style={{ margin: 0 }}>Detected Hits ({hits.length})</h1>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* View toggle */}
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
                    style={{ padding: '5px 12px', fontSize: '0.8rem', width: '140px' }}
                  />
                )}
              </div>
            </div>

            {/* Grouped by term */}
            {viewMode === 'grouped' && (
              <div style={{ display: 'grid', gap: '20px' }}>
                {filteredGroups.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,0.55)' }}>No terms match the filter.</p>
                )}
                {filteredGroups.map(group => (
                  <div key={group.term} style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.95rem' }}>{group.term}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        {group.total} hit{group.total !== 1 ? 's' : ''} · {group.straight} straight · {group.boxed} boxed
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '5px', paddingLeft: '12px' }}>
                      {group.hits.map((hit, i) => (
                        <HitLine key={`${group.term}-${i}`} hit={hit} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Flat list */}
            {viewMode === 'flat' && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {hits.map((hit, i) => (
                  <div key={(hit as any).id || i} className="journal-card-flat"
                    style={{ borderLeft: `3px solid ${hit.hitType === 'straight' ? '#4a7c59' : '#a07c4a'}` }}>
                    <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', fontSize: '0.84rem' }}>
                      <div><strong>Term:</strong> {hit.termLabel || '—'}</div>
                      <div><strong>Number:</strong> <span style={{ fontFamily: 'monospace' }}>{hit.number || '—'}</span></div>
                      <div><strong>State:</strong> {hit.state || '—'}</div>
                      <div><strong>Game:</strong> {hit.gameType || '—'}</div>
                      <div><strong>Draw:</strong> {hit.drawTime || '—'}</div>
                      <div><strong>Date:</strong> {hit.drawDate || '—'}</div>
                      <div>
                        <strong>Type:</strong>{' '}
                        <span style={{ color: hit.hitType === 'straight' ? '#6dbf8a' : '#d4a95a', fontWeight: 700 }}>
                          {hit.hitType === 'straight' ? '⬛ Straight' : '◻ Boxed'}
                        </span>
                      </div>
                      <div><strong>Result:</strong> <span style={{ fontFamily: 'monospace' }}>{hit.normalizedResult || '—'}</span></div>
                      <div><strong>Day:</strong> {hit.daysFromDream ?? '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty state */}
        {!loadingData && hits.length === 0 && selectedId && (
          <section className="journal-card">
            <p>No hits found for this dream yet. Click <strong>⚡ Run via Engine</strong> to query the lottery engine.</p>
          </section>
        )}

    </div>
  );
}
