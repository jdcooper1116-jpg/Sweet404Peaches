'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

type DreamHitRow = {
  id: string;
  candidate?: string;
  state?: string;
  draw_date?: string;
  draw_time?: string;
  winning_number?: string;
  match_type?: string;
  is_verified?: boolean;
  source_name?: string;
  game_type?: string;
  termLabel?: string;
  dreamerName?: string;
  anchor_date?: string;
};

export default function HitsPage() {
  const { user } = useAuth();
  const [hits, setHits] = useState<DreamHitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadHits() {
    if (!user) { setHits([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      // Server-side Admin read — replaces listDreamHits() client call
      const res = await fetch(`/api/dreams/hits?ownerUid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load hits.');
      setHits(Array.isArray(data.hits) ? data.hits : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load hits.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadHits(); }, [user]);

  const sorted = useMemo(() => [...hits].sort((a, b) => {
    const ak = `${a.draw_date ?? ''} ${a.draw_time ?? ''}`;
    const bk = `${b.draw_date ?? ''} ${b.draw_time ?? ''}`;
    return ak < bk ? 1 : -1;
  }), [hits]);

  const exactCount    = sorted.filter(h => h.match_type === 'exact').length;
  const boxCount      = sorted.filter(h => h.match_type !== 'exact' && h.match_type).length;
  const verifiedCount = sorted.filter(h => h.is_verified).length;

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Hits Detector</h1>
              <p>Engine-confirmed dream hits. Each row is a candidate number that matched a real draw result during its active window.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => void loadHits()}>↻ Refresh</button>
              <Link href="/fell-before" className="btn-secondary">As They Fell Before</Link>
              <Link href="/windows" className="btn-secondary">Active Windows</Link>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {[
            ['Total Hits',       sorted.length,    'var(--ink)'],
            ['Exact / Straight', exactCount,       'var(--green)'],
            ['Box',              boxCount,         'var(--gold)'],
            ['Verified',         verifiedCount,    'var(--plum)'],
          ].map(([label, val, color]) => (
            <div key={String(label)} style={{
              background: 'var(--cream)', border: '1px solid rgba(120,90,85,0.15)',
              borderRadius: '20px', padding: '15px 18px',
              boxShadow: '0 4px 14px rgba(82,39,28,0.06)',
            }}>
              <strong style={{ fontSize: '2rem', letterSpacing: '-0.06em', display: 'block', color: color as string }}>{val}</strong>
              <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            </div>
          ))}
        </section>

        {loading && <section className="journal-card"><p>Loading hits…</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {!loading && sorted.length === 0 && (
          <section className="journal-card">
            <p style={{ color: 'var(--ink-light)' }}>No confirmed hits yet. Hits appear here after Refresh Now finds matching draw results.</p>
            <Link href="/windows" className="btn-secondary" style={{ marginTop: '16px', display: 'inline-block' }}>View Active Windows →</Link>
          </section>
        )}

        {sorted.length > 0 && (
          <section style={{ display: 'grid', gap: '12px' }}>
            {sorted.map(hit => {
              const isExact = hit.match_type === 'exact';
              return (
                <article key={hit.id} className="journal-card" style={{ display: 'grid', gap: '12px', borderLeft: `3px solid ${isExact ? 'var(--green)' : 'var(--clay)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: 0 }}>
                        <span style={{ fontFamily: 'monospace' }}>{hit.candidate || '—'}</span>
                        <span style={{ color: 'var(--muted)', margin: '0 8px' }}>→</span>
                        <span style={{ fontFamily: 'monospace' }}>{hit.winning_number || '—'}</span>
                        <span style={{ marginLeft: '10px', fontSize: '13px', fontWeight: 400, color: isExact ? 'var(--green)' : 'var(--gold)' }}>
                          {isExact ? '⬛ Exact / Straight' : '◻ Box'}
                        </span>
                      </h2>
                      <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                        {hit.state} · {hit.draw_date} · {hit.draw_time} · {hit.game_type}
                        {hit.is_verified && <span style={{ marginLeft: '8px', color: 'var(--green)', fontWeight: 600 }}>✓ Verified</span>}
                      </div>
                    </div>
                    <div className="journal-card-flat" style={{ minWidth: '180px', display: 'grid', gap: '5px', fontSize: '13px' }}>
                      <div><strong>Term:</strong> {hit.termLabel || '—'}</div>
                      <div><strong>Dreamer:</strong> {hit.dreamerName || '—'}</div>
                      <div><strong>Source:</strong> {hit.source_name || '—'}</div>
                      <div><strong>Anchor:</strong> {hit.anchor_date || '—'}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
    </div>
  );
}
