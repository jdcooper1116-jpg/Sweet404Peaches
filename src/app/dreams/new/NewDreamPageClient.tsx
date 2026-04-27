'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BookOpenText, Sparkles, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { parseDreamText } from '@/lib/parser/dreamParser';
import type { Dreamer, ParseResult } from '@/lib/types';

export default function NewDreamPageClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useAuth();

  const [dreamers,          setDreamers]          = useState<Dreamer[]>([]);
  const [dreamersLoading,   setDreamersLoading]   = useState(true);
  const [selectedDreamerId, setSelectedDreamerId] = useState('owner-self');
  const [customDreamerName, setCustomDreamerName] = useState('');
  const [dreamDate,         setDreamDate]         = useState(new Date().toISOString().slice(0, 10));
  const [dreamText,         setDreamText]         = useState('');
  const [parseResult,       setParseResult]       = useState<ParseResult | null>(null);
  const [saving,            setSaving]            = useState(false);
  const [message,           setMessage]           = useState('');
  const [error,             setError]             = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setDreamersLoading(false); return; }
      try {
        const res = await fetch(`/api/dreamers?ownerUid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        if (data.ok) setDreamers(Array.isArray(data.dreamers) ? data.dreamers : []);
      }
      catch (err) { console.error('dreamers load (non-critical):', err); }
      finally { setDreamersLoading(false); }
    }
    void load();
  }, [user]);

  useEffect(() => {
    if (!dreamers.length) return;
    const qId   = searchParams.get('dreamerId');
    const qName = searchParams.get('dreamer');
    if (qId) { const f = dreamers.find(d => d.id === qId); if (f) { setSelectedDreamerId(f.id); return; } }
    if (qName) { const f = dreamers.find(d => d.displayName.toLowerCase() === qName.toLowerCase()); if (f) setSelectedDreamerId(f.id); }
  }, [dreamers, searchParams]);

  const selectedDreamer      = useMemo(() => dreamers.find(d => d.id === selectedDreamerId) ?? null, [dreamers, selectedDreamerId]);
  const effectiveDreamerId   = selectedDreamer?.id ?? 'owner-self';
  const effectiveDreamerName = selectedDreamer?.displayName ?? (customDreamerName.trim() || 'Me');

  function handleParseDream() {
    if (!dreamText.trim()) { setError('Please enter your dream text first.'); setParseResult(null); return; }
    setError(''); setMessage('');
    setParseResult(parseDreamText(dreamText));
  }

  async function handleSaveDraft() {
    if (!user)            { setError('You must be signed in to save a dream.'); return; }
    if (!dreamText.trim()) { setError('Please enter your dream text first.');    return; }

    setSaving(true); setError(''); setMessage('');

    try {
      let termMappings: ParseResult['termMappings'] = [];
      if (parseResult) {
        const ec3 = new Set(parseResult.termMappings.flatMap(m => m.cash3Numbers));
        const ec4 = new Set(parseResult.termMappings.flatMap(m => m.cash4Numbers));
        const dc3 = parseResult.cash3Numbers.filter(v => !ec3.has(v));
        const dc4 = parseResult.cash4Numbers.filter(v => !ec4.has(v));
        termMappings = [...parseResult.termMappings];
        if (dc3.length) termMappings.push({ term: 'direct-cash3', normalizedTerm: 'direct-cash3', relatedTerms: [], cash3Numbers: dc3, cash4Numbers: [], archivedNumbers: [], lineContexts: [] });
        if (dc4.length) termMappings.push({ term: 'direct-cash4', normalizedTerm: 'direct-cash4', relatedTerms: [], cash3Numbers: [], cash4Numbers: dc4, archivedNumbers: [], lineContexts: [] });
      }

      const res = await fetch('/api/dreams/save-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUid: user.uid, displayName: user.displayName || 'Sweet404Peaches', email: user.email || '',
          dreamerId: effectiveDreamerId, dreamerName: effectiveDreamerName,
          dreamDate, rawText: dreamText, cleanedText: parseResult?.cleanedText ?? dreamText.trim(),
          termMappings, sourceType: 'manual', notes: '', isReviewed: termMappings.length > 0,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save dream entry.');

      setMessage(
        termMappings.length > 0
          ? `Parsed dream saved with 7-day window (${data.activeWindowStart} → ${data.activeWindowEnd}). ${data.windowsCreated} watch items · ${data.termMappingsWritten} dictionary entries.`
          : 'Draft saved to Firestore.'
      );

      setDreamText('');
      setParseResult(null);
      setTimeout(() => router.push(`/dreams?dreamer=${encodeURIComponent(effectiveDreamerName)}`), 900);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not save dream. Check server logs.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header"><h1>New Dream Entry</h1><p>Capture the dream. Parse it to extract terms and candidates, then save with active 7-day watch windows.</p></div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreamers" className="btn-secondary">Manage Dreamers</Link>
              <Link href="/dashboard" className="btn-secondary">Back to Dashboard</Link>
            </div>
          </div>
        </section>

        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', color: 'var(--deep-plum)' }}>
            <BookOpenText size={20} /><strong>Dream Intake</strong>
          </div>
          <form onSubmit={e => { e.preventDefault(); void handleSaveDraft(); }} style={{ display: 'grid', gap: '18px' }}>
            <div>
              <label className="journal-label" htmlFor="dreamerSelect">Saved Dreamer</label>
              <select id="dreamerSelect" className="journal-select" value={selectedDreamerId} onChange={e => setSelectedDreamerId(e.target.value)} disabled={dreamersLoading}>
                <option value="owner-self">Me / Owner Journal</option>
                {dreamers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
            </div>

            {selectedDreamer ? (
              <div className="journal-card-flat">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: 'var(--deep-plum)' }}><Users size={16} /><strong>Selected Dreamer</strong></div>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <div><div className="journal-label">Name</div><div>{selectedDreamer.displayName}</div></div>
                  <div><div className="journal-label">Alias</div><div>{selectedDreamer.alias || '—'}</div></div>
                  <div><div className="journal-label">States</div><div>{selectedDreamer.preferredStates.join(', ') || '—'}</div></div>
                  <div><div className="journal-label">Games</div><div>{selectedDreamer.preferredGames.join(', ') || '—'}</div></div>
                </div>
              </div>
            ) : (
              <div>
                <label className="journal-label" htmlFor="customDreamerName">Dreamer Name</label>
                <input id="customDreamerName" className="journal-input" value={customDreamerName} onChange={e => setCustomDreamerName(e.target.value)} placeholder="Me" />
              </div>
            )}

            <div>
              <label className="journal-label" htmlFor="dreamDate">Dream Date</label>
              <input id="dreamDate" type="date" className="journal-input" value={dreamDate} onChange={e => setDreamDate(e.target.value)} />
            </div>
            <div>
              <label className="journal-label" htmlFor="dreamText">Dream Text</label>
              <textarea id="dreamText" className="journal-textarea" rows={14} value={dreamText} onChange={e => setDreamText(e.target.value)} placeholder="Example: Dreamed of a red car accident with a surfboard on top..." />
            </div>

            {message && <div className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>{message}</div>}
            {error   && <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</div>}

            <div className="journal-card-flat" style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)' }}><Sparkles size={16} /><strong>Dreamer-Aware Saving</strong></div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink-light)', lineHeight: 1.6 }}>
                Parse first to extract terms and number candidates. Saving creates a 7-day active watch window and adds all terms to the Universal Dream Dictionary immediately.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : parseResult ? 'Save Parsed Dream' : 'Save Draft'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleParseDream}>Parse Dream</button>
            </div>
          </form>
        </section>

        {parseResult && (
          <section className="journal-card" style={{ display: 'grid', gap: '20px' }}>
            <div className="page-header"><h1>Parse Preview</h1><p>These are the extracted terms and number candidates from your dream.</p></div>
            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="journal-card-flat"><strong>Cash 3</strong><p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>{parseResult.cash3Numbers.length ? parseResult.cash3Numbers.join(', ') : 'No Cash 3 numbers found'}</p></div>
              <div className="journal-card-flat"><strong>Cash 4</strong><p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>{parseResult.cash4Numbers.length ? parseResult.cash4Numbers.join(', ') : 'No Cash 4 numbers found'}</p></div>
              <div className="journal-card-flat"><strong>Archived / Symbolic</strong><p style={{ color: 'var(--ink-light)', marginTop: '10px' }}>{parseResult.archivedNumbers.length ? parseResult.archivedNumbers.join(', ') : 'None'}</p></div>
            </div>
            <div className="journal-card-flat">
              <strong>Extracted Terms</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                {parseResult.termMappings.length ? (
                  parseResult.termMappings.map(m => (
                    <span key={m.term} style={{ padding: '8px 12px', borderRadius: '999px', background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)', color: 'var(--deep-plum)', fontSize: '14px' }}>
                      {m.term}
                    </span>
                  ))
                ) : <span style={{ color: 'var(--ink-light)' }}>No terms found</span>}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
