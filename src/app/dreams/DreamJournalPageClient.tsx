'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookMarked, NotebookPen, Plus, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type DreamEntry = {
  id:               string;
  dreamerName:      string;
  dreamerId:        string;
  dreamDate:        string;
  rawText:          string;
  uploadedAt:       string | null;
  activeWindowStart?: string;
  activeWindowEnd?:   string;
  termMappings?:    Array<{ term: string; cash3Numbers?: string[]; cash4Numbers?: string[]; archivedNumbers?: string[] }>;
};

type DreamerOption = { id: string; displayName: string };

function formatPosted(value: string | null): string {
  if (!value) return 'Unknown';
  try { return new Date(value).toLocaleString(); } catch { return 'Unknown'; }
}

// ─── Inner (needs useSearchParams) ───────────────────────────────────────────

function DreamJournalInner() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const [entries,      setEntries]      = useState<DreamEntry[]>([]);
  const [dreamers,     setDreamers]     = useState<DreamerOption[]>([]);
  const [pageLoading,  setPageLoading]  = useState(true);
  const [error,        setError]        = useState('');
  const [dreamerFilter, setDreamerFilter] = useState('');  // '' = All

  // Read ?dreamerId= or legacy ?dreamer= from URL
  useEffect(() => {
    const qId   = searchParams.get('dreamerId') ?? '';
    const qName = searchParams.get('dreamer')   ?? '';
    if (qId)   setDreamerFilter(qId);
    else if (qName) setDreamerFilter(qName);  // legacy name-based filter falls through to client filter
  }, [searchParams]);

  // Load dreamers for selector
  useEffect(() => {
    if (!user) return;
    fetch(`/api/dreamers?ownerUid=${encodeURIComponent(user.uid)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setDreamers(d.dreamers ?? []); })
      .catch(err => console.error('dreamers load:', err));
  }, [user]);

  // Load entries
  async function loadEntries(did?: string) {
    if (!user) { setPageLoading(false); return; }
    setError('');
    try {
      const activeDid = did !== undefined ? did : dreamerFilter;
      const qs = new URLSearchParams({ ownerUid: user.uid });
      // Only pass dreamerId if it looks like a real id or 'owner-self' (not a display name)
      if (activeDid && !activeDid.includes(' ') && activeDid.length < 60) {
        qs.set('dreamerId', activeDid);
      }
      const res  = await fetch(`/api/dreams/entries?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Load failed.');
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) {
      console.error(err);
      setError('Could not load dream entries.');
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) void loadEntries();
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDreamerChange(did: string) {
    setDreamerFilter(did);
    void loadEntries(did);
  }

  // Client-side filter for legacy ?dreamer= name param (when it contains spaces)
  const filteredEntries = useMemo(() => {
    // If dreamerFilter looks like a display name (has spaces), filter client-side
    if (dreamerFilter && dreamerFilter.includes(' ')) {
      return entries.filter(e =>
        e.dreamerName?.toLowerCase() === dreamerFilter.toLowerCase()
      );
    }
    return entries;
  }, [entries, dreamerFilter]);

  const dreamerLabel = dreamerFilter === '' ? 'All Dreamers'
    : dreamerFilter === 'owner-self'         ? 'Owner / Self'
    : dreamers.find(d => d.id === dreamerFilter)?.displayName ?? dreamerFilter;

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
              <h1>Dream Journal</h1>
              <p>Journal-style view of all dreams, mapped terms, and parsed numbers. Filter by dreamer to see a personal journal.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreamers" className="btn-secondary">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} /> Manage Dreamers
                </span>
              </Link>
              <Link href="/dreams/new" className="btn-primary">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={16} /> New Dream
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* Dreamer selector */}
        <section className="journal-card-flat" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <label className="journal-label" htmlFor="dreamerFilter">Filter by Dreamer</label>
            <select id="dreamerFilter" className="journal-select" value={dreamerFilter}
              onChange={e => handleDreamerChange(e.target.value)}>
              <option value="">All Dreamers</option>
              <option value="owner-self">Owner / Self</option>
              {dreamers.map(d => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', fontSize: '13px', color: 'var(--ink-light)', paddingBottom: '4px' }}>
            <span><strong style={{ color: 'var(--ink)' }}>{filteredEntries.length}</strong> entr{filteredEntries.length !== 1 ? 'ies' : 'y'}</span>
            <span>Scope: <strong style={{ color: '#b0b8ff' }}>{dreamerLabel}</strong></span>
          </div>
        </section>

        {pageLoading && <section className="journal-card"><p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading journal…</p></section>}
        {error      && <section className="journal-card" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {!pageLoading && !error && filteredEntries.length === 0 && (
          <section className="journal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
              <BookMarked size={18} />
              <strong>No journal entries in this view yet</strong>
            </div>
            <p style={{ color: 'var(--ink-light)', margin: 0 }}>Save a dream entry and it will appear here.</p>
          </section>
        )}

        {/* Dream entries */}
        {filteredEntries.length > 0 && (
          <section style={{ display: 'grid', gap: '18px' }}>
            {filteredEntries.map(entry => {
              const cash3    = Array.from(new Set((entry.termMappings ?? []).flatMap(m => m.cash3Numbers     ?? [])));
              const cash4    = Array.from(new Set((entry.termMappings ?? []).flatMap(m => m.cash4Numbers     ?? [])));
              const archived = Array.from(new Set((entry.termMappings ?? []).flatMap(m => m.archivedNumbers  ?? [])));
              const idParam  = encodeURIComponent(entry.dreamerId || 'owner-self');

              return (
                <article key={entry.id} className="journal-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                        <NotebookPen size={18} />
                        <strong style={{ fontSize: '22px' }}>{entry.dreamerName || 'Unknown'}</strong>
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                        Posted: {formatPosted(entry.uploadedAt)}
                      </div>
                      <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                        Dream Date: {entry.dreamDate}
                      </div>
                    </div>
                    <div className="journal-card-flat" style={{ minWidth: '220px', textAlign: 'center' }}>
                      <div className="journal-label">Active Timeframe</div>
                      <div style={{ fontSize: '15px', color: 'var(--ink)' }}>
                        {entry.activeWindowStart ?? '—'} → {entry.activeWindowEnd ?? '—'}
                      </div>
                    </div>
                  </div>

                  <div className="journal-card-flat" style={{ marginTop: '18px' }}>
                    <div className="journal-label">Dream Entry</div>
                    <div style={{ marginTop: '10px', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'var(--ink)' }}>
                      {entry.rawText}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: '16px' }}>
                    <div className="journal-card-flat">
                      <div className="journal-label">Cash 3 Numbers</div>
                      <div style={{ color: 'var(--ink-light)', fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '6px' }}>
                        {cash3.length ? cash3.join(', ') : 'None'}
                      </div>
                    </div>
                    <div className="journal-card-flat">
                      <div className="journal-label">Cash 4 Numbers</div>
                      <div style={{ color: 'var(--ink-light)', fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '6px' }}>
                        {cash4.length ? cash4.join(', ') : 'None'}
                      </div>
                    </div>
                    <div className="journal-card-flat">
                      <div className="journal-label">Archived / Symbolic</div>
                      <div style={{ color: 'var(--ink-light)', marginTop: '6px' }}>
                        {archived.length ? archived.join(', ') : 'None'}
                      </div>
                    </div>
                  </div>

                  {(entry.termMappings ?? []).length > 0 && (
                    <div className="journal-card-flat" style={{ marginTop: '16px' }}>
                      <div className="journal-label">Mapped Terms</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                        {(entry.termMappings ?? []).map(m => (
                          <span key={m.term} style={{
                            padding: '8px 12px', borderRadius: '999px',
                            background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.35)',
                            color: 'var(--deep-plum)', fontSize: '14px',
                          }}>{m.term}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick links */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
                    {[
                      { label: 'Active Windows', href: `/windows?dreamerId=${idParam}` },
                      { label: 'Hits', href: `/hits?dreamerId=${idParam}` },
                      { label: 'As They Fell Before', href: `/fell-before?dreamerId=${idParam}` },
                      { label: 'Dictionary', href: `/dictionary?dreamerId=${idParam}` },
                    ].map(({ label, href }) => (
                      <Link key={label} href={href} className="btn-secondary"
                        style={{ fontSize: '12px', padding: '4px 12px' }}>
                        {label}
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}

// Suspense wrapper required for useSearchParams in App Router
export default function DreamsPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr' }}>
        <div /><section style={{ padding: '32px' }}><p>Loading journal…</p></section>
      </main>
    }>
      <DreamJournalInner />
    </Suspense>
  );
}
