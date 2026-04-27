'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { parseDreamText } from '@/lib/parser/dreamParser';
import type { ParseResult } from '@/lib/types';

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BacktestingIntakePage() {
  const { user } = useAuth();

  const [dreamDate,       setDreamDate]       = useState('');
  const [dreamSource,     setDreamSource]      = useState('handwritten-journal');
  const [confidence,      setConfidence]       = useState('high');
  const [dreamText,       setDreamText]        = useState('');
  const [notes,           setNotes]            = useState('');
  const [parseResult,     setParseResult]      = useState<ParseResult | null>(null);
  const [saving,          setSaving]           = useState(false);
  const [runningEngine,   setRunningEngine]    = useState(false);
  const [loadingRecent,   setLoadingRecent]    = useState(false);
  const [message,         setMessage]          = useState('');
  const [error,           setError]            = useState('');
  const [engineErrors,    setEngineErrors]     = useState<string[]>([]);
  const [recentBacktests, setRecentBacktests]  = useState<any[]>([]);

  // Ref keeps parseResult always current inside async handlers regardless of re-renders.
  const parseResultRef = useRef<ParseResult | null>(null);
  useEffect(() => { parseResultRef.current = parseResult; }, [parseResult]);

  const windowStart = dreamDate || '—';
  const windowEnd   = useMemo(() => (dreamDate ? addDays(dreamDate, 6) : '—'), [dreamDate]);

  // Load recent backtest dreams from server-side route (avoids client Firestore offline issues).
  async function loadRecentDreams() {
    if (!user) return;
    setLoadingRecent(true);
    try {
      const res = await fetch(`/api/backtest/list-dreams?ownerUid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.dreams)) {
        setRecentBacktests(data.dreams.slice(0, 10));
      }
    } catch (err) {
      console.error('loadRecentDreams:', err);
    } finally {
      setLoadingRecent(false);
    }
  }

  useEffect(() => {
    void loadRecentDreams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleParseDream() {
    if (!dreamText.trim()) {
      setError('Please paste the historical dream text first.');
      setParseResult(null);
      parseResultRef.current = null;
      return;
    }
    setError('');
    setMessage('');
    setEngineErrors([]);
    const result = parseDreamText(dreamText);
    setParseResult(result);
    parseResultRef.current = result;
  }

  // ── Stage 1: save dream via Admin route ──────────────────────────────────────
  async function stageSaveDream(pr: ParseResult): Promise<string | null> {
    if (!user)             { setError('You must be signed in.');                return null; }
    if (!dreamDate)        { setError('Please choose the original dream date.'); return null; }
    if (!dreamText.trim()) { setError('Please paste the historical dream text.'); return null; }

    const res = await fetch('/api/backtest/save-dream-intake', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid:    user.uid,
        displayName: user.displayName || 'Sweet404Peaches',
        email:       user.email || '',
        dreamDate,
        rawText:     dreamText,
        source:      dreamSource,
        confidence,
        notes,
        parseResult: pr,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not save the historical dream intake.');
    }

    return data.backtestDreamId as string;
  }

  // ── Stage 2: run engine replay ────────────────────────────────────────────────
  async function stageRunEngine(backtestDreamId: string, pr: ParseResult): Promise<any> {
    const res = await fetch('/api/backtest/engine-replay', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backtestDreamId,
        dreamDate,
        lookaheadDays:      7,
        cash3Numbers:       pr.cash3Numbers,
        cash4Numbers:       pr.cash4Numbers,
        parsedTermMappings: pr.termMappings,
      }),
    });

    const data = await res.json();
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      setEngineErrors(data.errors);
    }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Engine replay failed.');
    }
    return data;
  }

  // ── Stage 3: save hits via Admin route ────────────────────────────────────────
  async function stageSaveHits(backtestDreamId: string, engineData: any): Promise<any> {
    const saveRes = await fetch('/api/backtest/save-engine-replay-hits', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid:        user!.uid,
        backtestDreamId,
        dreamDate,
        hits:            Array.isArray(engineData.hits) ? engineData.hits : [],
      }),
    });

    const saveData = await saveRes.json();
    if (!saveRes.ok || !saveData.ok) {
      throw new Error(saveData.error || 'Could not save engine replay hits.');
    }
    return saveData;
  }

  // ── Save Only ─────────────────────────────────────────────────────────────────
  async function handleSaveBacktestDream() {
    const pr = parseResultRef.current;
    if (!pr) { setError('Please parse the dream before saving it.'); return; }

    setSaving(true);
    setError('');
    setMessage('');
    setEngineErrors([]);

    try {
      const id = await stageSaveDream(pr);
      if (!id) return;
      setMessage(`Dream saved (ID: ${id}). Use "Save & Run Engine Backtest" to detect hits automatically.`);
      setDreamText('');
      setNotes('');
      setParseResult(null);
      parseResultRef.current = null;
      void loadRecentDreams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  // ── Save + Engine Replay (primary path) ───────────────────────────────────────
  async function handleSaveAndRunEngine() {
    const pr = parseResultRef.current;

    if (!pr) { setError('Please parse the dream before running the engine backtest.'); return; }
    if (pr.cash3Numbers.length === 0 && pr.cash4Numbers.length === 0) {
      setError('No valid 3- or 4-digit candidates found. Check that the dream text includes lottery numbers.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    setEngineErrors([]);

    let backtestDreamId: string | null = null;

    try {
      // Stage 1 — save dream
      setMessage('Step 1/3: Saving dream intake…');
      backtestDreamId = await stageSaveDream(pr);
      if (!backtestDreamId) return;

      // Stage 2 — engine replay
      setSaving(false);
      setRunningEngine(true);
      setMessage(
        `Step 2/3: Querying engine — ` +
        `pick3: ${pr.cash3Numbers.length} candidates, pick4: ${pr.cash4Numbers.length} candidates…`
      );
      const engineData = await stageRunEngine(backtestDreamId, pr);

      // Stage 3 — save hits
      setMessage(`Step 3/3: Saving ${engineData.totalHits} hit(s) to Firestore…`);
      const saveData = await stageSaveHits(backtestDreamId, engineData);

      // Warn if persistence reported fewer writes than expected
      if (saveData.backtestHitsWritten === 0 && engineData.totalHits > 0) {
        setEngineErrors(prev => [...prev, `Warning: engine returned ${engineData.totalHits} hits but 0 were written to Firestore.`]);
      }

      if (!saveData.backtestSummaryWritten) {
        setEngineErrors(prev => [...prev, 'Warning: backtestSummary write may have failed.']);
      }

      // Build success message with persistence confirmation
      const stateCount = engineData.uniqueStates?.length ?? 0;
      const errCount   = engineData.errors?.length ?? 0;

      setMessage(
        `✓ Saved & engine replay complete. ` +
        `${engineData.totalHits} hit(s) — ${engineData.straightHits} straight, ${engineData.boxedHits} boxed — ` +
        `across ${stateCount} state(s).` +
        (engineData.bestState ? ` Best state: ${engineData.bestState}.` : '') +
        (engineData.bestTerm  ? ` Best term: ${engineData.bestTerm}.` : '') +
        ` Persisted: ${saveData.backtestHitsWritten} hits, ${saveData.personalHitMappingsUpdated} term memory entries.` +
        (saveData.alreadyCounted > 0 ? ` (${saveData.alreadyCounted} already counted from prior run.)` : '') +
        (errCount > 0 ? ` ⚠ ${errCount} state group(s) had engine errors.` : '') +
        ` View in Replay Lab or Archive.`
      );

      // Clear inputs only after all stages succeed
      setDreamText('');
      setNotes('');
      setParseResult(null);
      parseResultRef.current = null;

      // Reload recent dreams from server to get accurate persisted status
      void loadRecentDreams();
    } catch (err) {
      console.error('handleSaveAndRunEngine error:', err);
      setError(err instanceof Error ? err.message : 'Engine replay failed.');
      // Do NOT clear parseResult on failure
    } finally {
      setSaving(false);
      setRunningEngine(false);
    }
  }

  const isWorking = saving || runningEngine;

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

        {/* Header */}
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Historical Dream Intake</h1>
              <p>Parse a historical dream and run it against the engine across all states automatically.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting"         className="btn-secondary">Backtesting Portal</Link>
              <Link href="/backtesting/archive" className="btn-secondary">Archive</Link>
              <Link href="/backtesting/replay"  className="btn-secondary">Replay Lab</Link>
            </div>
          </div>
        </section>

        {/* Metadata */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamDate">Original Dream Date</label>
            <input id="dreamDate" type="date" className="journal-input" value={dreamDate} onChange={e => setDreamDate(e.target.value)} />
          </div>
          <div>
            <label className="journal-label" htmlFor="dreamSource">Source</label>
            <select id="dreamSource" className="journal-select" value={dreamSource} onChange={e => setDreamSource(e.target.value)}>
              <option value="handwritten-journal">Handwritten Journal</option>
              <option value="notes-app">Notes App</option>
              <option value="text-message">Text Message</option>
              <option value="memory-reconstruction">Memory Reconstruction</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="journal-label" htmlFor="confidence">Confidence</label>
            <select id="confidence" className="journal-select" value={confidence} onChange={e => setConfidence(e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </section>

        {/* Main input */}
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', color: 'var(--deep-plum)' }}>
            <BookOpenText size={20} /><strong>Historical Dream Text</strong>
          </div>

          <div style={{ display: 'grid', gap: '18px' }}>
            <div>
              <label className="journal-label" htmlFor="dreamText">Dream Text</label>
              <textarea id="dreamText" className="journal-textarea" rows={16} value={dreamText}
                onChange={e => setDreamText(e.target.value)}
                placeholder="Paste the historical dream exactly as recorded..." />
            </div>

            <div>
              <label className="journal-label" htmlFor="notes">Research Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
              <textarea id="notes" className="journal-textarea" rows={4} value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Context, confidence notes, or why this dream matters..." />
            </div>

            {message && (
              <div className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>{message}</div>
            )}
            {error && (
              <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</div>
            )}
            {engineErrors.length > 0 && (
              <div className="journal-card-flat" style={{ borderColor: 'rgba(228,192,123,0.4)', background: 'rgba(228,192,123,0.06)', color: 'rgba(228,192,123,0.9)' }}>
                <strong>Engine / persistence warnings:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.82rem' }}>
                  {engineErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="journal-card-flat" style={{ display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)' }}>
                <Sparkles size={16} /><strong>Workflow</strong>
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink-light)', lineHeight: 1.6 }}>
                <strong>Parse</strong> → extracts terms and number candidates.<br />
                <strong>Save Dream Only</strong> → saves to dictionary, creates research window. No engine call.<br />
                <strong>Save &amp; Run Engine Backtest</strong> → saves dream then queries Railway lottery engine
                across all states for pick 3 + pick 4, saves hits, updates As They Fell Before.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn-secondary" onClick={handleParseDream} disabled={isWorking}>
                Parse Historical Dream
              </button>
              <button type="button" className="btn-secondary" onClick={handleSaveBacktestDream}
                disabled={isWorking || !parseResult}>
                {saving ? 'Saving…' : 'Save Dream Only'}
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveAndRunEngine}
                disabled={isWorking || !parseResult}
                style={{ opacity: !parseResult ? 0.55 : 1, cursor: !parseResult ? 'not-allowed' : 'pointer' }}>
                {runningEngine ? 'Running engine…' : saving ? 'Saving…' : 'Save & Run Engine Backtest'}
              </button>
            </div>
            {!parseResult && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>Parse the dream first.</p>
            )}
          </div>
        </section>

        {/* Window bar */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div><div className="journal-label">Window Start</div><div style={{ fontWeight: 700 }}>{windowStart}</div></div>
          <div><div className="journal-label">Window End</div><div style={{ fontWeight: 700 }}>{windowEnd}</div></div>
          <div><div className="journal-label">Engine Coverage</div><div style={{ fontWeight: 700 }}>All States · Pick 3 + Pick 4</div></div>
          <div><div className="journal-label">Memory Updated</div><div style={{ fontWeight: 700 }}>As They Fell Before</div></div>
        </section>

        {/* Parse preview */}
        {parseResult && (
          <section className="journal-card" style={{ display: 'grid', gap: '20px' }}>
            <div className="page-header">
              <h1>Parse Preview</h1>
              <p>Confirm candidates before running the engine.</p>
            </div>
            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="journal-card-flat">
                <strong>Pick 3 / Cash 3 ({parseResult.cash3Numbers.length})</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  {parseResult.cash3Numbers.length ? parseResult.cash3Numbers.join(', ') : 'None found'}
                </p>
              </div>
              <div className="journal-card-flat">
                <strong>Pick 4 / Cash 4 ({parseResult.cash4Numbers.length})</strong>
                <p style={{ color: 'var(--ink-light)', marginTop: '10px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  {parseResult.cash4Numbers.length ? parseResult.cash4Numbers.join(', ') : 'None found'}
                </p>
              </div>
            </div>
            <div className="journal-card-flat">
              <strong>Mapped Terms ({parseResult.termMappings.length})</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                {parseResult.termMappings.length ? (
                  parseResult.termMappings.map(m => (
                    <span key={m.term} style={{
                      padding: '6px 12px', borderRadius: '999px',
                      background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)',
                      color: 'var(--deep-plum)', fontSize: '13px',
                    }}>
                      {m.term}
                      <span style={{ opacity: 0.6, fontSize: '11px', marginLeft: '4px' }}>
                        ({(m.cash3Numbers?.length ?? 0) + (m.cash4Numbers?.length ?? 0)})
                      </span>
                    </span>
                  ))
                ) : <span style={{ color: 'var(--ink-light)' }}>No mapped terms</span>}
              </div>
            </div>
            {(parseResult.cash3Numbers.length === 0 && parseResult.cash4Numbers.length === 0) && (
              <div className="journal-card-flat" style={{ borderColor: '#f2a6a6', background: 'rgba(110,20,20,0.15)', color: '#f2a6a6' }}>
                ⚠ No valid candidates parsed. Engine backtest would return 0 hits.
              </div>
            )}
          </section>
        )}

        {/* Recent dreams (server-loaded) */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Recent Backtest Dreams</h1>
            <p>Loaded from Firestore — reflects current persisted state.</p>
          </div>

          {loadingRecent ? (
            <p>Loading…</p>
          ) : recentBacktests.length ? (
            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {recentBacktests.map(item => (
                <div key={item.id} className="journal-card-flat">
                  <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', fontSize: '0.84rem' }}>
                    <div><div className="journal-label">Date</div><div>{item.dreamDate || '—'}</div></div>
                    <div><div className="journal-label">Pick 3</div><div>{item.cash3Numbers?.length ?? 0} cands</div></div>
                    <div><div className="journal-label">Pick 4</div><div>{item.cash4Numbers?.length ?? 0} cands</div></div>
                    <div><div className="journal-label">Hits</div><div style={{ fontWeight: 700 }}>{item.totalHits ?? '—'}</div></div>
                    <div><div className="journal-label">Best State</div><div>{item.bestState || '—'}</div></div>
                    <div>
                      <div className="journal-label">Status</div>
                      <div style={{
                        color: item.status === 'engine-replay-complete' ? '#6dbf8a' : item.status === 'replay-complete' ? '#d4a95a' : 'inherit',
                        fontWeight: item.status?.includes('complete') ? 700 : 400,
                      }}>{item.status || '—'}</div>
                    </div>
                    {item.replaySource && (
                      <div><div className="journal-label">Source</div><div style={{ color: '#b0b8ff' }}>{item.replaySource === 'lottery-engine' ? '⚡ Engine' : item.replaySource}</div></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--ink-light)' }}>No backtest dreams saved yet.</p>
          )}
        </section>

      </section>
    </main>
  );
}
