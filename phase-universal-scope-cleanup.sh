#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/app/universal-scope"
[ -f src/app/universal-scope/page.tsx ] && cp src/app/universal-scope/page.tsx "$BACKUP_DIR/src/app/universal-scope/page.tsx.bak"

cat > src/app/universal-scope/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { ActiveDreamWindow, PersonalHitMapping } from '@/lib/types';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function UniversalScopePage() {
  const { user, loading } = useAuth();
  const [windows, setWindows] = useState<ActiveDreamWindow[]>([]);
  const [memory, setMemory] = useState<PersonalHitMapping[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setWindows([]);
        setMemory([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [windowRows, memoryRows] = await Promise.all([
          listActiveDreamWindows(user.uid),
          listPersonalHitMappings(user.uid),
        ]);

        setWindows(windowRows);
        setMemory(memoryRows);
      } catch (err) {
        console.error(err);
        setError('Could not load Universal Scope data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const familyConvergence = useMemo(() => {
    return summarizeNumberFamilies(windows, memory).filter(
      item => item.forms.length > 1 || item.terms.length > 1 || item.dreamers.length > 1
    );
  }, [windows, memory]);

  const activeRanges = useMemo(() => {
    const ranges = windows.map(win => `${win.activeStart} → ${win.activeEnd}`);
    return unique(ranges).sort();
  }, [windows]);

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
            <h1>Universal Scope</h1>
            <p>
              The collective dream field, centered on repeating number families
              across forms, terms, and dreamers.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Loading Universal Scope...
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
        ) : windows.length === 0 ? (
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
              <strong>No active dream field yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Save parsed dreams first and their active windows will feed Universal Scope.
            </p>
          </section>
        ) : (
          <>
            <section className="journal-card-flat">
              <div
                style={{
                  display: 'grid',
                  gap: '12px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                }}
              >
                <div>
                  <div className="journal-label">Active Windows</div>
                  <div>{windows.length}</div>
                </div>

                <div>
                  <div className="journal-label">Family Convergence Groups</div>
                  <div>{familyConvergence.length}</div>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="journal-label">Active Window Ranges</div>
                <div style={{ color: 'var(--ink-light)' }}>
                  {activeRanges.join(' • ')}
                </div>
              </div>
            </section>

            <section className="journal-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '14px',
                  color: 'var(--deep-plum)',
                }}
              >
                <Sparkles size={18} />
                <strong>Top Number Family Convergence</strong>
              </div>

              {familyConvergence.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No strong number-family convergence detected yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {familyConvergence.slice(0, 30).map((item, index) => (
                    <article key={`${item.gameType}__${item.familyKey}`} className="journal-card-flat">
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
                              fontWeight: 700,
                              color: 'var(--deep-plum)',
                              fontSize: '20px',
                              marginBottom: '8px',
                            }}
                          >
                            #{index + 1} — Family {item.familyKey} ({item.gameType})
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            <strong>Forms:</strong> {item.forms.join(', ') || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                            <strong>Terms:</strong> {item.terms.join(', ') || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                            <strong>Dreamers:</strong> {item.dreamers.join(', ') || '—'}
                          </div>
                        </div>

                        <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                          <div className="journal-label">Score</div>
                          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                            {item.score}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gap: '12px',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          marginTop: '16px',
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
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
TSX

echo "Universal Scope cleanup complete."
echo "Backups saved to: $BACKUP_DIR"
