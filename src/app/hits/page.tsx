'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listDreamHits } from '@/lib/firebase/firestore';

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

  useEffect(() => {
    async function load() {
      if (!user) { setHits([]); setLoading(false); return; }
      try {
        const rows = await listDreamHits(user.uid);
        setHits(rows as DreamHitRow[]);
      } catch (err) {
        console.error(err);
        setError('Could not load hits.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user]);

  const sorted = useMemo(() => {
    return [...hits].sort((a, b) => {
      const aKey = `${a.draw_date ?? ''} ${a.draw_time ?? ''}`;
      const bKey = `${b.draw_date ?? ''} ${b.draw_time ?? ''}`;
      return aKey < bKey ? 1 : -1;
    });
  }, [hits]);

  const exactCount    = sorted.filter(h => h.match_type === 'exact').length;
  const boxCount      = sorted.filter(h => h.match_type === 'box').length;
  const verifiedCount = sorted.filter(h => h.is_verified).length;

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Hits Detector</h1>
              <p>Engine-confirmed dream hits. Each row is a candidate number that matched a real draw result during its active window.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/fell-before" className="btn-secondary">As They Fell Before</Link>
              <Link href="/windows" className="btn-secondary">Active Windows</Link>
            </div>
          </div>
        </section>

        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div><div className="journal-label">Total Hits</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{sorted.length}</div></div>
          <div><div className="journal-label">Exact / Straight</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{exactCount}</div></div>
          <div><div className="journal-label">Box</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{boxCount}</div></div>
          <div><div className="journal-label">Verified</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{verifiedCount}</div></div>
        </section>

        {loading && <section className="journal-card"><p>Loading hits...</p></section>}
        {error   && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}

        {!loading && sorted.length === 0 && (
          <section className="journal-card">
            <p style={{ color: 'var(--ink-light)' }}>No confirmed hits yet. Hits appear here after a dream refresh finds a matching draw result.</p>
            <Link href="/windows" className="btn-secondary" style={{ marginTop: '16px', display: 'inline-block' }}>View Active Windows →</Link>
          </section>
        )}

        {sorted.length > 0 && (
          <section style={{ display: 'grid', gap: '12px' }}>
            {sorted.map(hit => (
              <article key={hit.id} className="journal-card" style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {hit.candidate || '—'} → {hit.winning_number || '—'}&nbsp;
                      <span style={{ fontSize: '14px', fontWeight: 400, color: hit.match_type === 'exact' ? '#4a7c59' : '#7c6b4a' }}>
                        {hit.match_type === 'exact' ? '⬛ Exact/Straight' : '◻ Box'}
                      </span>
                    </h2>
                    <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                      {hit.state} · {hit.draw_date} · {hit.draw_time} · {hit.game_type}
                      {hit.is_verified && <span style={{ marginLeft: '8px', color: '#4a7c59', fontWeight: 600 }}>✓ Verified</span>}
                    </div>
                  </div>
                  <div className="journal-card-flat" style={{ minWidth: '180px', display: 'grid', gap: '6px', fontSize: '13px' }}>
                    <div><strong>Term:</strong> {hit.termLabel || '—'}</div>
                    <div><strong>Source:</strong> {hit.source_name || '—'}</div>
                    <div><strong>Anchor:</strong> {hit.anchor_date || '—'}</div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

      </section>
    </main>
  );
}
