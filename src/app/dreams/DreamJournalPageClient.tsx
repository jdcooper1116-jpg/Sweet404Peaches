'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookMarked, NotebookPen, Plus, Users } from 'lucide-react';
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

// ─── Inner component (needs useSearchParams) ──────────────────────────────────

function DreamJournalInner() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const [entries,       setEntries]       = useState<DreamEntry[]>([]);
  const [dreamers,      setDreamers]      = useState<DreamerOption[]>([]);
  const [pageLoading,   setPageLoading]   = useState(true);
  const [error,         setError]         = useState('');
  const [dreamerFilter, setDreamerFilter] = useState('');

  // Read ?dreamerId= or legacy ?dreamer= from URL
  useEffect(() => {
    const qId   = searchParams.get('dreamerId') ?? '';
    const qName = searchParams.get('dreamer')   ?? '';
    if (qId)        setDreamerFilter(qId);
    else if (qName) setDreamerFilter(qName);
  }, [searchParams]);

  // Load dreamer list for selector
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

  // Client-side name filter for legacy ?dreamer= param
  const filteredEntries = useMemo(() => {
    if (dreamerFilter && dreamerFilter.includes(' ')) {
      return entries.filter(e =>
        e.dreamerName?.toLowerCase() === dreamerFilter.toLowerCase()
      );
    }
    return entries;
  }, [entries, dreamerFilter]);

  const dreamerLabel =
    dreamerFilter === ''          ? 'All Dreamers'
    : dreamerFilter === 'owner-self' ? 'Owner / Self'
    : dreamers.find(d => d.id === dreamerFilter)?.displayName ?? dreamerFilter;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="page-header">
            <h1>Dream Journal</h1>
            <p>Journal-style view of all dreams, mapped terms, and parsed numbers.</p>
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

      {/* Dreamer filter */}
      <section className="journal-card-flat" style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div>
          <label className="journal-label" htmlFor="dreamerFilter">Filter by Dreamer</label>
          <select
            id="dreamerFilter"
            className="journal-select"
            value={dreamerFilter}
            onChange={e => handleDreamerChange(e.target.value)}
          >
            <option value="">All Dreamers</option>
            <option value="owner-self">Owner / Self</option>
            {dreamers.map(d => (
              <option key={d.id} value={d.id}>{d.displayName}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', fontSize: '13px', color: 'var(--aurora-text2)', paddingBottom: '4px' }}>
          <span>
            <strong style={{ color: 'var(--aurora-text)' }}>{filteredEntries.length}</strong>
            {' '}entr{filteredEntries.length !== 1 ? 'ies' : 'y'}
          </span>
          <span>
            Scope: <strong style={{ color: 'var(--aurora-purple)' }}>{dreamerLabel}</strong>
          </span>
        </div>
      </section>

      {/* Loading */}
      {pageLoading && (
        <section className="journal-card">
          <p style={{ margin: 0, color: 'var(--aurora-text2)' }}>Loading journal…</p>
        </section>
      )}

      {/* Error */}
      {!pageLoading && error && (
        <section className="journal-card" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>
          {error}
        </section>
      )}

      {/* Empty state */}
      {!pageLoading && !error && filteredEntries.length === 0 && (
        <section className="journal-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--aurora-purple)' }}>
            <BookMarked size={18} />
            <strong>No journal entries in this view yet</strong>
          </div>
          <p style={{ color: 'var(--aurora-text2)', margin: 0 }}>
            Save a dream entry and it will appear here.
          </p>
        </section>
      )}

      {/* Dream entries */}
      {!pageLoading && !error && filteredEntries.length > 0 && (
        <section style={{ display: 'grid', gap: '18px' }}>
          {filteredEntries.map(entry => {
            const cash3    = Array.from(new Set((entry.termMappings ?? []).flatMap(m => m.cash3Numbers    ?? [])));
            const cash4    = Array.from(new Set((entry.termMappings ?? []).flatMap(m => m.cash4Numbers    ?? [])));
            const archived = Array.from(new Set((entry.termMappings ?? []).flatMap(m => m.archivedNumbers ?? [])));
            const idParam  = encodeURIComponent(entry.dreamerId || 'owner-self');

            return (
              <article key={entry.id} className="journal-card">
                {/* Entry header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--aurora-purple)', marginBottom: '8px' }}>
                      <NotebookPen size={18} />
                      <strong style={{ fontSize: '20px', letterSpacing: '-0.02em', fontFamily: 'system-ui, sans-serif' }}>
                        {entry.dreamerName || 'Unknown'}
                      </strong>
                    </div>
                    <div style={{ color: 'var(--aurora-text2)', fontSize: '13px' }}>
                      Posted: {formatPosted(entry.uploadedAt)}
                    </div>
                    <div style={{ color: 'var(--aurora-text2)', fontSize: '13px', marginTop: '2px' }}>
                      Dream Date: <strong style={{ color: 'var(--aurora-text)' }}>{entry.dreamDate}</strong>
                    </div>
                  </div>
                  <div className="journal-card-flat" style={{ minWidth: '200px', textAlign: 'center' }}>
                    <div className="journal-label">Active Timeframe</div>
                    <div style={{ fontSize: '14px', color: 'var(--aurora-text)', marginTop: '4px', fontFamily: 'monospace' }}>
                      {entry.activeWindowStart ?? '—'} → {entry.activeWindowEnd ?? '—'}
                    </div>
                  </div>
                </div>

                {/* Dream text */}
                <div className="journal-card-flat" style={{ marginTop: '16px' }}>
                  <div className="journal-label">Dream Entry</div>
                  <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'var(--aurora-text)', fontSize: '14px' }}>
                    {entry.rawText}
                  </div>
                </div>

                {/* Number grids */}
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '14px' }}>
                  <div className="journal-card-flat">
                    <div className="journal-label">Cash 3</div>
                    <div style={{ color: 'var(--aurora-coral2)', fontFamily: 'monospace', fontSize: '13px', marginTop: '5px' }}>
                      {cash3.length ? cash3.join(', ') : <span style={{ color: 'var(--aurora-text3)' }}>None</span>}
                    </div>
                  </div>
                  <div className="journal-card-flat">
                    <div className="journal-label">Cash 4</div>
                    <div style={{ color: 'var(--aurora-purple)', fontFamily: 'monospace', fontSize: '13px', marginTop: '5px' }}>
                      {cash4.length ? cash4.join(', ') : <span style={{ color: 'var(--aurora-text3)' }}>None</span>}
                    </div>
                  </div>
                  <div className="journal-card-flat">
                    <div className="journal-label">Archived / Symbolic</div>
                    <div style={{ color: 'var(--aurora-text2)', fontSize: '13px', marginTop: '5px' }}>
                      {archived.length ? archived.join(', ') : <span style={{ color: 'var(--aurora-text3)' }}>None</span>}
                    </div>
                  </div>
                </div>

                {/* Term mappings */}
                {(entry.termMappings ?? []).length > 0 && (
                  <div className="journal-card-flat" style={{ marginTop: '14px' }}>
                    <div className="journal-label">Mapped Terms</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                      {(entry.termMappings ?? []).map(m => (
                        <span key={m.term} style={{
                          padding: '5px 12px', borderRadius: '999px',
                          background: 'rgba(255,204,80,0.12)',
                          border: '1px solid rgba(255,204,80,0.28)',
                          color: 'var(--aurora-gold)', fontSize: '13px',
                          fontWeight: 600,
                        }}>
                          {m.term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick links */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                  {[
                    { label: 'Active Windows',    href: `/windows?dreamerId=${idParam}` },
                    { label: 'Hits',              href: `/hits?dreamerId=${idParam}` },
                    { label: 'As They Fell Before', href: `/fell-before?dreamerId=${idParam}` },
                    { label: 'Dictionary',        href: `/dictionary?dreamerId=${idParam}` },
                  ].map(({ label, href }) => (
                    <Link key={label} href={href} className="btn-secondary"
                      style={{ fontSize: '12px', padding: '5px 12px' }}>
                      {label}
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}

    </div>
  );
}

// ─── Export wrapped in Suspense (required for useSearchParams) ────────────────

export default function DreamsPage() {
  return (
    <Suspense fallback={
      <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)' }}>
        <p style={{ color: 'var(--aurora-text2)' }}>Loading journal…</p>
      </div>
    }>
      <DreamJournalInner />
    </Suspense>
  );
}
