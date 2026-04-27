'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

type ActiveWindow = {
  id: string;
  dreamEntryId?: string;
  dreamerName?: string;
  termLabel?: string;
  number?: string;
  gameType?: string;
  activeStart?: string;
  activeEnd?: string;
  isActive?: boolean;
  statesTracked?: string[];
  newHitsSinceLastCheck?: number;
  lastCheckedAt?: string | null;
  [key: string]: unknown;
};

type DreamWindowGroup = {
  dreamEntryId: string;
  dreamerName: string;
  activeStart: string;
  activeEnd: string;
  isActive: boolean;
  statesTracked: string[];
  cash3Numbers: string[];
  cash4Numbers: string[];
  termMap: Record<string, { cash3: string[]; cash4: string[] }>;
  totalWatchItems: number;
  newHitsSinceLastCheck: number;
  lastCheckedAt: string | null;
};

function uniqueSorted(arr: string[]) { return Array.from(new Set(arr)).sort(); }
function todayIso() { return new Date().toISOString().slice(0, 10); }

function buildGrouped(rows: ActiveWindow[]): DreamWindowGroup[] {
  const map = new Map<string, DreamWindowGroup>();
  for (const row of rows) {
    const eid = String(row.dreamEntryId || row.id || '');
    const g = map.get(eid);
    const tl = String(row.termLabel || '');
    const num = String(row.number || '');
    const gt = String(row.gameType || '');
    if (!g) {
      map.set(eid, {
        dreamEntryId: eid,
        dreamerName: String(row.dreamerName || 'Unknown'),
        activeStart: String(row.activeStart || ''),
        activeEnd: String(row.activeEnd || ''),
        isActive: !!row.isActive,
        statesTracked: Array.isArray(row.statesTracked) ? [...row.statesTracked] : [],
        cash3Numbers: gt === 'cash3' ? [num] : [],
        cash4Numbers: gt === 'cash4' ? [num] : [],
        termMap: { [tl]: { cash3: gt === 'cash3' ? [num] : [], cash4: gt === 'cash4' ? [num] : [] } },
        totalWatchItems: 1,
        newHitsSinceLastCheck: Number(row.newHitsSinceLastCheck ?? 0),
        lastCheckedAt: row.lastCheckedAt ?? null,
      });
      continue;
    }
    g.isActive = g.isActive || !!row.isActive;
    g.newHitsSinceLastCheck += Number(row.newHitsSinceLastCheck ?? 0);
    if (row.lastCheckedAt && (!g.lastCheckedAt || String(row.lastCheckedAt) > g.lastCheckedAt)) {
      g.lastCheckedAt = String(row.lastCheckedAt);
    }
    g.statesTracked = uniqueSorted([...g.statesTracked, ...(Array.isArray(row.statesTracked) ? row.statesTracked : [])]);
    if (gt === 'cash3') g.cash3Numbers.push(num); else g.cash4Numbers.push(num);
    if (!g.termMap[tl]) g.termMap[tl] = { cash3: [], cash4: [] };
    if (gt === 'cash3') g.termMap[tl].cash3.push(num); else g.termMap[tl].cash4.push(num);
    g.totalWatchItems++;
  }
  return Array.from(map.values())
    .map(g => ({ ...g, cash3Numbers: uniqueSorted(g.cash3Numbers), cash4Numbers: uniqueSorted(g.cash4Numbers), statesTracked: uniqueSorted(g.statesTracked) }))
    .sort((a, b) => a.activeStart < b.activeStart ? 1 : -1);
}

export default function ActiveWindowsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ActiveWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadWindows() {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/dreams/windows?ownerUid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load windows.');
      setRows(Array.isArray(data.windows) ? data.windows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load active windows.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadWindows(); }, [user]);

  const grouped = useMemo(() => buildGrouped(rows), [rows]);
  const today = todayIso();
  const active = grouped.filter(g => g.activeEnd >= today);
  const expired = grouped.filter(g => g.activeEnd < today);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Dream Active Windows</h1>
              <p>Each card is one dream's 7-day active watch window. Numbers are tested against live results across all supported states.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => void loadWindows()}>↻ Refresh</button>
              <Link href="/dreams/new" className="btn-secondary">New Dream</Link>
              <Link href="/hits" className="btn-secondary">Hits Detector</Link>
            </div>
          </div>
        </section>

        <section className="journal-card-flat" style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div><div className="journal-label">Dream Windows</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{grouped.length}</div></div>
          <div><div className="journal-label">Currently Active</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{active.length}</div></div>
          <div><div className="journal-label">Expired</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{expired.length}</div></div>
          <div><div className="journal-label">Total Watch Items</div><div style={{ fontSize: '28px', fontWeight: 700 }}>{grouped.reduce((s, g) => s + g.totalWatchItems, 0)}</div></div>
        </section>

        {loading && <section className="journal-card"><p>Loading dream windows…</p></section>}
        {error && <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>{error}</section>}
        {!loading && !grouped.length && <section className="journal-card"><p>No dream windows yet. <Link href="/dreams/new">Create your first dream entry →</Link></p></section>}

        {active.length > 0 && (
          <section style={{ display: 'grid', gap: '16px' }}>
            <div className="page-header"><h1>Currently Active</h1><p>These dreams are inside their 7-day watch period.</p></div>
            {active.map(group => (
              <section key={group.dreamEntryId} className="journal-card" style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: '5px' }}>
                    <h2 style={{ margin: 0 }}>{group.dreamerName}</h2>
                    {group.newHitsSinceLastCheck > 0 && (
                      <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', width: 'fit-content' }}>
                        {group.newHitsSinceLastCheck} new hit{group.newHitsSinceLastCheck !== 1 ? 's' : ''} since last refresh
                      </span>
                    )}
                    <div style={{ fontSize: '14px', color: 'var(--ink-light)' }}>Window: {group.activeStart} → {group.activeEnd}</div>
                    {group.lastCheckedAt && <div style={{ fontSize: '12px', color: 'var(--ink-light)', opacity: 0.6 }}>Last checked: {String(group.lastCheckedAt).slice(0, 16).replace('T', ' ')} UTC</div>}
                    <div style={{ fontSize: '11px', opacity: 0.35 }}>ID: {group.dreamEntryId}</div>
                  </div>
                  <div className="journal-card-flat" style={{ minWidth: '180px', display: 'grid', gap: '5px', fontSize: '13px' }}>
                    <div><strong>Cash 3:</strong> {group.cash3Numbers.length} numbers</div>
                    <div><strong>Cash 4:</strong> {group.cash4Numbers.length} numbers</div>
                    <div><strong>Watch Items:</strong> {group.totalWatchItems}</div>
                    <div><strong>States:</strong> {group.statesTracked.length}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  <div className="journal-card-flat">
                    <strong>Cash 3</strong>
                    <p style={{ marginTop: '8px', color: 'var(--ink-light)', fontFamily: 'monospace', fontSize: '0.84rem' }}>{group.cash3Numbers.length ? group.cash3Numbers.join(', ') : 'None'}</p>
                  </div>
                  <div className="journal-card-flat">
                    <strong>Cash 4</strong>
                    <p style={{ marginTop: '8px', color: 'var(--ink-light)', fontFamily: 'monospace', fontSize: '0.84rem' }}>{group.cash4Numbers.length ? group.cash4Numbers.join(', ') : 'None'}</p>
                  </div>
                </div>
                <div className="journal-card-flat">
                  <strong>Mapped Terms</strong>
                  <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                    {Object.entries(group.termMap).map(([term, payload]) => (
                      <div key={term} style={{ border: '1px solid rgba(90,52,74,0.12)', borderRadius: '12px', padding: '10px', background: 'rgba(255,255,255,0.03)', fontSize: '13px' }}>
                        <strong>{term}</strong>
                        <div style={{ marginTop: '4px', color: 'var(--ink-light)' }}>
                          Cash 3: {payload.cash3.join(', ') || 'None'} · Cash 4: {payload.cash4.join(', ') || 'None'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </section>
        )}

        {expired.length > 0 && (
          <section style={{ display: 'grid', gap: '12px' }}>
            <div className="page-header"><h1>Expired Windows</h1><p>Outside the 7-day watch period.</p></div>
            {expired.map(group => (
              <section key={group.dreamEntryId} className="journal-card-flat" style={{ opacity: 0.75 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div><strong>{group.dreamerName}</strong><div style={{ fontSize: '13px', color: 'var(--ink-light)' }}>{group.activeStart} → {group.activeEnd}</div></div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-light)' }}>Cash 3: {group.cash3Numbers.length} · Cash 4: {group.cash4Numbers.length}</div>
                </div>
              </section>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
