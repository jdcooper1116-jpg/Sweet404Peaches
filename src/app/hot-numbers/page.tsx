'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listDreamers,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { ActiveDreamWindow, PersonalHitMapping } from '@/lib/types';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

export default function HotNumbersPage() {
  const { user, loading } = useAuth();
  const [windows, setWindows] = useState<ActiveDreamWindow[]>([]);
  const [memory, setMemory] = useState<PersonalHitMapping[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [dreamerFilter, setDreamerFilter] = useState('ALL');
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setWindows([]);
        setMemory([]);
        setDreamers([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [windowRows, memoryRows, dreamerRows] = await Promise.all([
          listActiveDreamWindows(user.uid),
          listPersonalHitMappings(user.uid),
          listDreamers(user.uid),
        ]);

        setWindows(windowRows);
        setMemory(memoryRows);
        setDreamers(dreamerRows);
      } catch (err) {
        console.error(err);
        setError('Could not load hot-number data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredWindows = useMemo(() => {
    return dreamerFilter === 'ALL'
      ? windows
      : windows.filter(
          item => item.dreamerName === dreamerFilter || item.dreamerId === dreamerFilter
        );
  }, [windows, dreamerFilter]);

  const filteredMemory = useMemo(() => {
    return dreamerFilter === 'ALL'
      ? memory
      : memory.filter(
          item => item.dreamerName === dreamerFilter || item.dreamerId === dreamerFilter
        );
  }, [memory, dreamerFilter]);

  const rankedFamilies = useMemo(() => {
    return summarizeNumberFamilies(filteredWindows, filteredMemory);
  }, [filteredWindows, filteredMemory]);

  const visibleDreamerNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of windows) {
      if (row.dreamerName) names.add(row.dreamerName);
    }
    for (const row of dreamers) {
      if (row.displayName) names.add(row.displayName);
    }
    return Array.from(names).sort();
  }, [windows, dreamers]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Hot Number Families</h1>
            <p>
              Ranked by cross-term, cross-dreamer, and cross-form synchronicity
              during the active window.
            </p>
          </div>
        </section>

        <section className="journal-card-flat">
          <div
            style={{
              display: 'grid',
              gap: '16px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div>
              <label className="journal-label">Dreamer Scope</label>
              <select
                className="journal-select"
                value={dreamerFilter}
                onChange={e => setDreamerFilter(e.target.value)}
              >
                <option value="ALL">All Dreamers</option>
                {visibleDreamerNames.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Active Windows</div>
              <div>{filteredWindows.length}</div>
            </div>

            <div className="journal-card-flat">
              <div className="journal-label">Ranked Families</div>
              <div>{rankedFamilies.length}</div>
            </div>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Loading synchronicity ranking...
            </p>
          </section>
        ) : error ? (
          <section
            className="journal-card"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : rankedFamilies.length === 0 ? (
          <section className="journal-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
                color: 'var(--deep-plum)',
              }}
            >
              <Sparkles size={18} />
              <strong>No hot families in this scope yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Try another dreamer scope or save more parsed dreams.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '16px' }}>
            {rankedFamilies.map((item, index) => (
              <article key={`${item.gameType}__${item.familyKey}`} className="journal-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        color: 'var(--deep-plum)',
                        marginBottom: '8px',
                      }}
                    >
                      <Flame size={18} />
                      <strong style={{ fontSize: '22px' }}>
                        #{index + 1} — Family {item.familyKey}
                      </strong>
                    </div>

                    <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                      {item.gameType} • Forms: {item.forms.join(', ') || '—'}
                    </div>
                  </div>

                  <div
                    className="journal-card-flat"
                    style={{ minWidth: '170px', textAlign: 'center' }}
                  >
                    <div className="journal-label">Score</div>
                    <div
                      style={{
                        fontSize: '30px',
                        color: 'var(--deep-plum)',
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {item.score}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    marginTop: '18px',
                  }}
                >
                  <div className="journal-card-flat">
                    <div className="journal-label">Active Windows</div>
                    <div>{item.activeCount}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Forms</div>
                    <div>{item.forms.length}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Terms</div>
                    <div>{item.terms.length}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Dreamers</div>
                    <div>{item.dreamers.length}</div>
                  </div>

                  <div className="journal-card-flat">
                    <div className="journal-label">Georgia Hits</div>
                    <div>{item.georgiaHits}</div>
                  </div>
                </div>

                <div className="journal-card-flat" style={{ marginTop: '16px' }}>
                  <div className="journal-label">Reasons</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-light)' }}>
                    {item.reasons.map(reason => (
                      <li key={reason} style={{ marginBottom: '6px' }}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
