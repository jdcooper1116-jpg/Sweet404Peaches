'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Sparkles } from 'lucide-react';
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
  // Dreamer selection
  const [dreamers,          setDreamers]          = useState<any[]>([]);
  const [selectedDreamerId, setSelectedDreamerId] = useState('owner-self');
  const [ownerDisplayName,  setOwnerDisplayName]  = useState('');

  // Capture parseResult in a ref so it's always current inside async handlers,
  // regardless of React's closure/re-render timing.
  const parseResultRef = useRef<ParseResult | null>(null);
  useEffect(() => { parseResultRef.current = parseResult; }, [parseResult]);

  const windowStart = dreamDate || '—';
  const windowEnd   = useMemo(() => (dreamDate ? addDays(dreamDate, 6) : '—'), [dreamDate]);

  useEffect(() => {
    setRecentBacktests([]);
    setLoadingRecent(false);
    if (!user) return;
    // Load dreamers + owner profile via server routes
    const uid = encodeURIComponent(user.uid);
    Promise.all([
      fetch(`/api/dreamers?ownerUid=${uid}&limit=100`).then(r => r.json()),
      fetch(`/api/owner-profile?ownerUid=${uid}`).then(r => r.json()),
    ]).then(([dreamerData, profileData]) => {
      if (dreamerData.ok) setDreamers(dreamerData.dreamers ?? []);
      if (profileData.ok && profileData.profile?.displayName) {
        setOwnerDisplayName(profileData.profile.displayName);
      }
    }).catch(err => console.error('dreamer/profile load:', err));
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

  // ── Stage 1: Save dream intake via Admin route ────────────────────────────────
  async function stageSaveDream(pr: ParseResult): Promise<string | null> {
    if (!user)             { setError('You must be signed in.');                return null; }
    if (!dreamDate)        { setError('Please choose the original dream date.'); return null; }
    if (!dreamText.trim()) { setError('Please paste the historical dream text.'); return null; }

    const res = await fetch('/api/backtest/save-dream-intake', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid:    user.uid,
        displayName: user.displayName || ownerDisplayName || 'Owner',
        email:       user.email || '',
        dreamerId:   selectedDreamerId,
        dreamerName: selectedDreamerId === 'owner-self'
          ? (ownerDisplayName || 'Owner / Self')
          : (dreamers.find((d: any) => d.id === selectedDreamerId)?.displayName ?? selectedDreamerId),
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

    if (data.dream) {
      setRecentBacktests(rows => [data.dream, ...rows]);
    }

    return data.backtestDreamId as string;
  }

  // ── Stage 2: Run engine replay ────────────────────────────────────────────────
  async function stageRunEngine(
    backtestDreamId: string,
    pr: ParseResult
  ): Promise<any> {
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

    // Show engine-level errors even if ok:true (partial failures).
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      setEngineErrors(data.errors);
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Engine replay request failed.');
    }

    return data;
  }

  // ── Stage 3: Save engine replay hits via Admin route ──────────────────────────
  async function stageSaveHits(
    backtestDreamId: string,
    engineData: any
  ): Promise<void> {
    const hits = Array.isArray(engineData.hits) ? engineData.hits : [];

    const saveRes = await fetch('/api/backtest/save-engine-replay-hits', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUid:    user!.uid,
        backtestDreamId,
        dreamDate,
        dreamerId:   selectedDreamerId,
        dreamerName: selectedDreamerId === 'owner-self'
          ? (ownerDisplayName || 'Owner / Self')
          : (dreamers.find((d: any) => d.id === selectedDreamerId)?.displayName ?? selectedDreamerId),
        hits,
      }),
    });

    const saveData = await saveRes.json();
    if (!saveRes.ok || !saveData.ok) {
      throw new Error(saveData.error || 'Could not save engine replay hits.');
    }
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
      setMessage(
        `Dream saved (ID: ${id}). Parsed evidence added to Universal Dictionary. ` +
        `Click "Save & Run Engine Backtest" to auto-detect hits.`
      );
      // Only clear after successful save.
      setDreamText('');
      setNotes('');
      setParseResult(null);
      parseResultRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  // ── Save + Engine Replay ──────────────────────────────────────────────────────
  async function handleSaveAndRunEngine() {
    // Read from ref — immune to stale closure issues.
    const pr = parseResultRef.current;

    if (!pr) { setError('Please parse the dream before running the engine backtest.'); return; }

    if (pr.cash3Numbers.length === 0 && pr.cash4Numbers.length === 0) {
      setError(
        'Parse found no valid 3- or 4-digit candidates. ' +
        'Check that the dream text includes lottery numbers.'
      );
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

      // Stage 2 — run engine
      setSaving(false);
      setRunningEngine(true);
      setMessage(`Step 2/3: Querying engine across all states (pick3: ${pr.cash3Numbers.length} candidates, pick4: ${pr.cash4Numbers.length} candidates)…`);

      const engineData = await stageRunEngine(backtestDreamId, pr);

      // Stage 3 — save hits + personalHitMappings
      setMessage(`Step 3/3: Saving ${engineData.totalHits} hit(s) to evidence database…`);
      await stageSaveHits(backtestDreamId, engineData);

      // Build final message.
      const stateCount = engineData.uniqueStates?.length ?? 0;
      const errCount   = engineData.errors?.length ?? 0;
      const debugInfo  = engineData._debug;

      setMessage(
        `✓ Saved & engine replay complete. ` +
        `${engineData.totalHits} hit(s) — ` +
        `${engineData.straightHits} straight, ${engineData.boxedHits} boxed — ` +
        `across ${stateCount} state(s).` +
        (engineData.bestState ? ` Best state: ${engineData.bestState}.` : '') +
        (engineData.bestTerm  ? ` Best term: ${engineData.bestTerm}.` : '') +
        (errCount > 0 ? ` ⚠ ${errCount} state group(s) had errors — see engine errors below.` : '') +
        ` View full results in the Replay Lab or Backtest Archive.`
      );

      // Only clear inputs after ALL three stages succeed.
      setDreamText('');
      setNotes('');
      setParseResult(null);
      parseResultRef.current = null;

      // Update the recent row's status.
      setRecentBacktests(rows =>
        rows.map(r =>
          r.id === backtestDreamId
            ? { ...r, status: 'engine-replay-complete' }
            : r
        )
      );
    } catch (err) {
      console.error('handleSaveAndRunEngine error:', err);
      setError(err instanceof Error ? err.message : 'Engine replay failed.');
      // Do NOT clear parseResult on failure — let the user try again.
    } finally {
      setSaving(false);
      setRunningEngine(false);
    }
  }

  const isWorking = saving || runningEngine;

  const ownerLabel = ownerDisplayName || 'Owner / Self';

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        {/* Header */}
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Historical Dream Intake</h1>
              <p>
                Paste an old dream, parse it, then use{' '}
                <strong>Save &amp; Run Engine Backtest</strong> to automatically
                detect hits across all states — no manual results upload needed.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting"         className="btn-secondary">Backtesting Portal</Link>
              <Link href="/backtesting/archive" className="btn-secondary">Archive</Link>
              <Link href="/backtesting/replay"  className="btn-secondary">Replay Lab</Link>
            </div>
          </div>
        </section>

        {/* Metadata fields */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {/* Dreamer selector */}
          <div>
            <label className="journal-label" htmlFor="dreamerSelect">Dreamer</label>
            <select id="dreamerSelect" className="journal-select" value={selectedDreamerId}
              onChange={e => setSelectedDreamerId(e.target.value)}>
              <option value="owner-self">{ownerLabel}</option>
              {dreamers.map((d: any) => (
                <option key={d.id} value={d.id}>{d.displayName}</option>
              ))}
            </select>
          </div>
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
            <label className="journal-label" htmlFor="confidence">Transcription Confidence</label>
            <select id="confidence" className="journal-select" value={confidence} onChange={e => setConfidence(e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </section>

        {/* Main input card */}
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', color: 'var(--aurora-purple, #a090ff)' }}>
            <BookOpenText size={20} />
            <strong>Historical Dream Intake</strong>
          </div>

          <div style={{ display: 'grid', gap: '18px' }}>
            <div>
              <label className="journal-label" htmlFor="dreamText">Historical Dream Text</label>
              <textarea
                id="dreamText"
                className="journal-textarea"
                rows={16}
                value={dreamText}
                onChange={e => setDreamText(e.target.value)}
                placeholder="Paste the historical dream exactly as recorded..."
              />
            </div>

            <div>
              <label className="journal-label" htmlFor="notes">Research Notes</label>
              <textarea
                id="notes"
                className="journal-textarea"
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional context, confidence notes, or why this dream matters..."
              />
            </div>

            {/* Status message */}
            {message && (
              <div className="journal-card-flat" style={{ borderColor: 'rgba(96,224,154,0.28)', background: 'rgba(96,224,154,0.08)', color: '#60e09a' }}>
                {message}
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="journal-card-flat" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>
                {error}
              </div>
            )}

            {/* Engine errors — show even on partial success */}
            {engineErrors.length > 0 && (
              <div className="journal-card-flat" style={{ borderColor: 'rgba(255,204,80,0.32)', background: 'rgba(255,204,80,0.08)', color: '#ffcc50' }}>
                <strong>Engine warnings ({engineErrors.length}):</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.82rem' }}>
                  {engineErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {/* Workflow info */}
            <div className="journal-card-flat" style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--aurora-purple, #a090ff)' }}>
                <Sparkles size={16} />
                <strong>Research Evidence Flow</strong>
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                <strong>Parse</strong> — extracts terms + number candidates from the dream text.<br />
                <strong>Save Dream Only</strong> — saves to dictionary and creates a research window. No engine call.<br />
                <strong>Save &amp; Run Engine Backtest</strong> — saves dream, then queries the Railway lottery engine
                across all supported states for pick 3 and pick 4, and saves all hits to Firestore.
                Results appear in Replay Lab, Archive, and As They Fell Before.
              </p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn-secondary" onClick={handleParseDream} disabled={isWorking}>
                Parse Historical Dream
              </button>

              <button type="button" className="btn-secondary" onClick={handleSaveBacktestDream} disabled={isWorking || !parseResult}>
                {saving ? 'Saving…' : 'Save Dream Only'}
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveAndRunEngine}
                disabled={isWorking || !parseResult}
                style={{ opacity: !parseResult ? 0.55 : 1, cursor: !parseResult ? 'not-allowed' : 'pointer' }}
              >
                {runningEngine ? 'Running engine across all states…' : saving ? 'Saving…' : 'Save & Run Engine Backtest'}
              </button>
            </div>

            {!parseResult && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>
                Parse the dream first to enable save buttons.
              </p>
            )}
          </div>
        </section>

        {/* Window info bar */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div><div className="journal-label">Window Start</div><div style={{ fontWeight: 700 }}>{windowStart}</div></div>
          <div><div className="journal-label">Window End</div><div style={{ fontWeight: 700 }}>{windowEnd}</div></div>
          <div><div className="journal-label">Engine Coverage</div><div style={{ fontWeight: 700 }}>All States · Pick 3 + Pick 4</div></div>
          <div><div className="journal-label">Dictionary Effect</div><div style={{ fontWeight: 700 }}>As They Fell Before Updates</div></div>
        </section>

        {/* Parse preview */}
        {parseResult && (
          <section className="journal-card" style={{ display: 'grid', gap: '20px' }}>
            <div className="page-header">
              <h1>Parse Preview</h1>
              <p>Confirm these candidates before running the engine backtest.</p>
            </div>

            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="journal-card-flat">
                <strong>Pick 3 / Cash 3 ({parseResult.cash3Numbers.length})</strong>
                <p style={{ color: 'rgba(255,255,255,0.55)', marginTop: '10px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  {parseResult.cash3Numbers.length
                    ? parseResult.cash3Numbers.join(', ')
                    : 'No 3-digit numbers found'}
                </p>
              </div>
              <div className="journal-card-flat">
                <strong>Pick 4 / Cash 4 ({parseResult.cash4Numbers.length})</strong>
                <p style={{ color: 'rgba(255,255,255,0.55)', marginTop: '10px', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  {parseResult.cash4Numbers.length
                    ? parseResult.cash4Numbers.join(', ')
                    : 'No 4-digit numbers found'}
                </p>
              </div>
              <div className="journal-card-flat">
                <strong>Archived / Symbolic</strong>
                <p style={{ color: 'rgba(255,255,255,0.55)', marginTop: '10px' }}>
                  {parseResult.archivedNumbers.length ? parseResult.archivedNumbers.join(', ') : 'None'}
                </p>
              </div>
            </div>

            <div className="journal-card-flat">
              <strong>Mapped Terms ({parseResult.termMappings.length})</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                {parseResult.termMappings.length ? (
                  parseResult.termMappings.map(mapping => (
                    <span
                      key={mapping.term}
                      style={{
                        padding: '6px 12px', borderRadius: '999px',
                        background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)',
                        color: 'var(--aurora-purple, #a090ff)', fontSize: '13px',
                      }}
                    >
                      {mapping.term}
                      <span style={{ opacity: 0.6, fontSize: '11px', marginLeft: '4px' }}>
                        ({(mapping.cash3Numbers?.length ?? 0) + (mapping.cash4Numbers?.length ?? 0)})
                      </span>
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>No mapped terms found</span>
                )}
              </div>
            </div>

            {(parseResult.cash3Numbers.length === 0 && parseResult.cash4Numbers.length === 0) && (
              <div className="journal-card-flat" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.12)', color: '#ff9090' }}>
                ⚠ No valid lottery number candidates were parsed. The engine backtest would return 0 hits.
                Check that your dream text contains 3- or 4-digit numbers associated with dream terms.
              </div>
            )}
          </section>
        )}

        {/* Recent backtests (session-local) */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Recent Backtest Dreams</h1>
            <p>Dreams saved in this session appear here. Visit the Archive for full history.</p>
          </div>

          {recentBacktests.length ? (
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              {recentBacktests.map(item => (
                <div key={item.id} className="journal-card-flat">
                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <div><div className="journal-label">Dream Date</div><div>{item.dreamDate || '—'}</div></div>
                    <div><div className="journal-label">Window</div><div>{item.activeWindowStart || '—'} → {item.activeWindowEnd || '—'}</div></div>
                    <div><div className="journal-label">Pick 3</div><div>{Array.isArray(item.cash3Numbers) ? item.cash3Numbers.length : 0} candidates</div></div>
                    <div><div className="journal-label">Pick 4</div><div>{Array.isArray(item.cash4Numbers) ? item.cash4Numbers.length : 0} candidates</div></div>
                    <div>
                      <div className="journal-label">Status</div>
                      <div style={{
                        color: item.status === 'engine-replay-complete' ? '#6dbf8a' : item.status === 'replay-complete' ? '#d4a95a' : 'inherit',
                        fontWeight: item.status?.includes('complete') ? 700 : 400,
                      }}>
                        {item.status || '—'}
                      </div>
                    </div>
                    <div><div className="journal-label">ID</div><div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{item.id}</div></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.55)' }}>No dreams saved yet in this session.</p>
          )}
        </section>

          </div>
  );
}
