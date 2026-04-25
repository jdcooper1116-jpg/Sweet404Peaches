'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listActiveDreamWindows } from '@/lib/firebase/firestore';
import type { ActiveDreamWindow } from '@/lib/types';

type DreamWindowGroup = {
  dreamEntryId: string;
  dreamerId: string;
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
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildGroupedWindows(rows: ActiveDreamWindow[]): DreamWindowGroup[] {
  const map = new Map<string, DreamWindowGroup>();

  for (const row of rows) {
    const dreamEntryId =
      (row as any).dreamEntryId ||
      (row as any).sourceDreamEntryId ||
      row.id;

    const existing = map.get(dreamEntryId);

    if (!existing) {
      map.set(dreamEntryId, {
        dreamEntryId,
        dreamerId: row.dreamerId,
        dreamerName: row.dreamerName,
        activeStart: row.activeStart,
        activeEnd: row.activeEnd,
        isActive: !!row.isActive,
        statesTracked: Array.isArray(row.statesTracked) ? [...row.statesTracked] : [],
        cash3Numbers: row.gameType === 'cash3' ? [row.number] : [],
        cash4Numbers: row.gameType === 'cash4' ? [row.number] : [],
        termMap: {
          [row.termLabel]: {
            cash3: row.gameType === 'cash3' ? [row.number] : [],
            cash4: row.gameType === 'cash4' ? [row.number] : [],
          },
        },
        totalWatchItems: 1,
        newHitsSinceLastCheck: (row as any).newHitsSinceLastCheck ?? 0,
      });
      continue;
    }

    existing.isActive = existing.isActive || !!row.isActive;
    existing.newHitsSinceLastCheck =
      (existing.newHitsSinceLastCheck ?? 0) +
      ((row as any).newHitsSinceLastCheck ?? 0);
    existing.statesTracked = uniqueSorted([
      ...existing.statesTracked,
      ...(Array.isArray(row.statesTracked) ? row.statesTracked : []),
    ]);

    if (row.gameType === 'cash3') {
      existing.cash3Numbers.push(row.number);
    } else {
      existing.cash4Numbers.push(row.number);
    }

    if (!existing.termMap[row.termLabel]) {
      existing.termMap[row.termLabel] = { cash3: [], cash4: [] };
    }
    if (row.gameType === 'cash3') {
      existing.termMap[row.termLabel].cash3.push(row.number);
    } else {
      existing.termMap[row.termLabel].cash4.push(row.number);
    }

    existing.totalWatchItems += 1;
  }

  return Array.from(map.values())
    .map(group => ({
      ...group,
      cash3Numbers: uniqueSorted(group.cash3Numbers),
      cash4Numbers: uniqueSorted(group.cash4Numbers),
      statesTracked: uniqueSorted(group.statesTracked),
      termMap: Object.fromEntries(
        Object.entries(group.termMap).map(([term, payload]) => [
          term,
          {
            cash3: uniqueSorted(payload.cash3),
            cash4: uniqueSorted(payload.cash4),
          },
        ])
      ),
    }))
    .sort((a, b) => {
      if (a.activeStart === b.activeStart) {
        return a.dreamerName.localeCompare(b.dreamerName);
      }
      return a.activeStart < b.activeStart ? 1 : -1;
    });
}

export default function ActiveWindowsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ActiveDreamWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setLoading(false);
        return;
      }
      try {
        const data = await listActiveDreamWindows(user.uid);
        setRows(data);
      } catch (err) {
        console.error(err);
        setError('Could not load active windows.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user]);

  const grouped = useMemo(() => buildGroupedWindows(rows), [rows]);
  const today = todayIso();
  const activeGroups = grouped.filter(g => g.activeEnd >= today);
  const expiredGroups = grouped.filter(g => g.activeEnd < today);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div className="page-header">
              <h1>Dream Active Windows</h1>
              <p>
                Each card below is one dream's 7-day active window. The numbers inside each
                card are the watch items being tested against uploaded results across states.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/dreams/new" className="btn-secondary">New Dream</Link>
              <Link href="/hits" className="btn-secondary">Hits Detector</Link>
              <Link href="/fell-before" className="btn-secondary">As They Fell Before</Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <div className="journal-label">Dream Windows</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{grouped.length}</div>
          </div>
          <div>
            <div className="journal-label">Currently Active</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{activeGroups.length}</div>
          </div>
          <div>
            <div className="journal-label">Expired</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{expiredGroups.length}</div>
          </div>
          <div>
            <div className="journal-label">Total Watch Items</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>
              {grouped.reduce((sum, group) => sum + group.totalWatchItems, 0)}
            </div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card"><p>Loading dream windows...</p></section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}
          >
            {error}
          </section>
        ) : null}

        {!loading && !grouped.length ? (
          <section className="journal-card">
            <p>No dream windows found yet. <Link href="/dreams/new">Create your first dream entry →</Link></p>
          </section>
        ) : null}

        {activeGroups.length ? (
          <section style={{ display: 'grid', gap: '16px' }}>
            <div className="page-header">
              <h1>Currently Active</h1>
              <p>These dreams are still inside their 7-day watch period.</p>
            </div>
            {activeGroups.map(group => (
              <section key={group.dreamEntryId} className="journal-card" style={{ display: 'grid', gap: '18px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <h2 style={{ margin: 0 }}>{group.dreamerName || 'Unknown Dreamer'}</h2>

                    {group.newHitsSinceLastCheck > 0 && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'rgba(251,191,36,0.15)',
                          border: '1px solid rgba(251,191,36,0.4)',
                          color: '#fbbf24',
                          width: 'fit-content',
                        }}
                      >
                        {group.newHitsSinceLastCheck} new hit{group.newHitsSinceLastCheck !== 1 ? 's' : ''} since last refresh
                      </span>
                    )}

                    <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                      Dream Window: {group.activeStart} → {group.activeEnd}
                    </div>
                    <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                      Dream Entry ID: {group.dreamEntryId}
                    </div>
                  </div>
                  <div
                    className="journal-card-flat"
                    style={{ minWidth: '220px', display: 'grid', gap: '8px' }}
                  >
                    <div><strong>Status:</strong> Active</div>
                    <div><strong>Cash 3:</strong> {group.cash3Numbers.length}</div>
                    <div><strong>Cash 4:</strong> {group.cash4Numbers.length}</div>
                    <div><strong>Total Watch Items:</strong> {group.totalWatchItems}</div>
                    <div><strong>States Tracked:</strong> {group.statesTracked.length}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '16px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  }}
                >
                  <div className="journal-card-flat">
                    <strong>Cash 3 Watch Numbers</strong>
                    <p style={{ marginTop: '10px', color: 'var(--ink-light)' }}>
                      {group.cash3Numbers.length ? group.cash3Numbers.join(', ') : 'None'}
                    </p>
                  </div>
                  <div className="journal-card-flat">
                    <strong>Cash 4 Watch Numbers</strong>
                    <p style={{ marginTop: '10px', color: 'var(--ink-light)' }}>
                      {group.cash4Numbers.length ? group.cash4Numbers.join(', ') : 'None'}
                    </p>
                  </div>
                </div>

                <div className="journal-card-flat">
                  <strong>Mapped Terms in This Dream</strong>
                  <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
                    {Object.entries(group.termMap).map(([term, payload]) => (
                      <div
                        key={term}
                        style={{
                          border: '1px solid rgba(90,52,74,0.12)',
                          borderRadius: '16px',
                          padding: '12px',
                          background: 'rgba(255,255,255,0.45)',
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: '8px' }}>{term}</div>
                        <div style={{ fontSize: '14px', color: 'var(--ink-light)' }}>
                          <strong>Cash 3:</strong> {payload.cash3.length ? payload.cash3.join(', ') : 'None'}
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--ink-light)', marginTop: '4px' }}>
                          <strong>Cash 4:</strong> {payload.cash4.length ? payload.cash4.join(', ') : 'None'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="journal-card-flat">
                  <strong>States Being Tested</strong>
                  <p style={{ marginTop: '10px', color: 'var(--ink-light)' }}>
                    {group.statesTracked.length ? group.statesTracked.join(', ') : 'None'}
                  </p>
                </div>
              </section>
            ))}
          </section>
        ) : null}

        {expiredGroups.length ? (
          <section style={{ display: 'grid', gap: '16px' }}>
            <div className="page-header">
              <h1>Expired Windows</h1>
              <p>These dreams are no longer inside the active 7-day watch period.</p>
            </div>
            {expiredGroups.map(group => (
              <section key={group.dreamEntryId} className="journal-card-flat" style={{ opacity: 0.82 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{group.dreamerName || 'Unknown Dreamer'}</strong>
                    <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                      {group.activeStart} → {group.activeEnd}
                    </div>
                  </div>
                  <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                    Cash 3: {group.cash3Numbers.length} • Cash 4: {group.cash4Numbers.length}
                  </div>
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}
