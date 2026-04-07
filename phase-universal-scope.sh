#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/app/universal-scope"
mkdir -p "$BACKUP_DIR/src/components/layout"

[ -f src/app/universal-scope/page.tsx ] && cp src/app/universal-scope/page.tsx "$BACKUP_DIR/src/app/universal-scope/page.tsx.bak"
[ -f src/components/layout/Sidebar.tsx ] && cp src/components/layout/Sidebar.tsx "$BACKUP_DIR/src/components/layout/Sidebar.tsx.bak"

mkdir -p src/app/universal-scope
cat > src/app/universal-scope/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listActiveDreamWindows } from '@/lib/firebase/firestore';
import type { ActiveDreamWindow } from '@/lib/types';

type RepeatedNumber = {
  key: string;
  number: string;
  gameType: 'cash3' | 'cash4';
  count: number;
  dreamers: string[];
  terms: string[];
  score: number;
};

type RepeatedTerm = {
  key: string;
  term: string;
  count: number;
  dreamers: string[];
  numbers: string[];
  score: number;
};

type ConvergenceGroup = {
  key: string;
  number: string;
  gameType: 'cash3' | 'cash4';
  dreamers: string[];
  terms: string[];
  count: number;
  score: number;
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function UniversalScopePage() {
  const { user, loading } = useAuth();
  const [windows, setWindows] = useState<ActiveDreamWindow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setWindows([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const rows = await listActiveDreamWindows(user.uid);
        setWindows(rows);
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

  const repeatedNumbers = useMemo<RepeatedNumber[]>(() => {
    const map = new Map<string, RepeatedNumber>();

    for (const win of windows) {
      const key = `${win.gameType}__${win.number}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          number: win.number,
          gameType: win.gameType,
          count: 0,
          dreamers: [],
          terms: [],
          score: 0,
        });
      }

      const item = map.get(key)!;
      item.count += 1;
      item.dreamers.push(win.dreamerName);
      item.terms.push(win.termLabel);
    }

    for (const item of map.values()) {
      item.dreamers = unique(item.dreamers).sort();
      item.terms = unique(item.terms).sort();
      item.score =
        item.count * 10 +
        item.dreamers.length * 6 +
        item.terms.length * 4;
    }

    return Array.from(map.values())
      .filter(item => item.count > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
        return a.number.localeCompare(b.number);
      });
  }, [windows]);

  const repeatedTerms = useMemo<RepeatedTerm[]>(() => {
    const map = new Map<string, RepeatedTerm>();

    for (const win of windows) {
      const key = win.termLabel.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          key,
          term: win.termLabel,
          count: 0,
          dreamers: [],
          numbers: [],
          score: 0,
        });
      }

      const item = map.get(key)!;
      item.count += 1;
      item.dreamers.push(win.dreamerName);
      item.numbers.push(win.number);
    }

    for (const item of map.values()) {
      item.dreamers = unique(item.dreamers).sort();
      item.numbers = unique(item.numbers).sort();
      item.score =
        item.count * 8 +
        item.dreamers.length * 5 +
        item.numbers.length * 4;
    }

    return Array.from(map.values())
      .filter(item => item.count > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.term.localeCompare(b.term);
      });
  }, [windows]);

  const convergenceGroups = useMemo<ConvergenceGroup[]>(() => {
    return repeatedNumbers
      .filter(item => item.dreamers.length > 1 || item.terms.length > 1)
      .map(item => ({
        key: item.key,
        number: item.number,
        gameType: item.gameType,
        dreamers: item.dreamers,
        terms: item.terms,
        count: item.count,
        score: item.score,
      }))
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.number.localeCompare(b.number);
      });
  }, [repeatedNumbers]);

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
              This is the collective dream field across all active dreams in the
              current 7-day windows.
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
                  <div className="journal-label">Repeated Numbers</div>
                  <div>{repeatedNumbers.length}</div>
                </div>

                <div>
                  <div className="journal-label">Repeated Terms</div>
                  <div>{repeatedTerms.length}</div>
                </div>

                <div>
                  <div className="journal-label">Convergence Groups</div>
                  <div>{convergenceGroups.length}</div>
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
                <strong>Top Repeated Numbers</strong>
              </div>

              <div style={{ display: 'grid', gap: '14px' }}>
                {repeatedNumbers.slice(0, 20).map((item, index) => (
                  <article key={item.key} className="journal-card-flat">
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
                          #{index + 1} — {item.number} ({item.gameType})
                        </div>
                        <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                          Terms: {item.terms.join(', ') || '—'}
                        </div>
                        <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                          Dreamers: {item.dreamers.join(', ') || '—'}
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                        <div className="journal-label">Score</div>
                        <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                          {item.score}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
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
                <Users size={18} />
                <strong>Cross-Dreamer Convergence</strong>
              </div>

              {convergenceGroups.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No multi-dreamer or multi-term convergence detected yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {convergenceGroups.slice(0, 20).map(item => (
                    <article key={item.key} className="journal-card-flat">
                      <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '8px' }}>
                        {item.number} ({item.gameType})
                      </div>

                      <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                        <div><strong>Dreamers:</strong> {item.dreamers.join(', ') || '—'}</div>
                        <div><strong>Terms:</strong> {item.terms.join(', ') || '—'}</div>
                        <div><strong>Occurrences:</strong> {item.count}</div>
                        <div><strong>Score:</strong> {item.score}</div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
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
                <strong>Repeated Terms</strong>
              </div>

              <div style={{ display: 'grid', gap: '14px' }}>
                {repeatedTerms.slice(0, 20).map(item => (
                  <article key={item.key} className="journal-card-flat">
                    <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '8px' }}>
                      {item.term}
                    </div>

                    <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                      <div><strong>Count:</strong> {item.count}</div>
                      <div><strong>Dreamers:</strong> {item.dreamers.join(', ') || '—'}</div>
                      <div><strong>Numbers:</strong> {item.numbers.join(', ') || '—'}</div>
                      <div><strong>Score:</strong> {item.score}</div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
TSX

cat > src/components/layout/Sidebar.tsx <<'TSX'
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  BookOpen,
  BookText,
  CalendarRange,
  Download,
  Flame,
  LayoutDashboard,
  MapPinned,
  MoonStar,
  ReceiptText,
  SearchCheck,
  Sparkles,
  Users,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dreams', label: 'Dream Log', icon: BookText },
  { href: '/dreams/new', label: 'New Dream', icon: BookOpen },
  { href: '/dreamers', label: 'Dreamers', icon: Users },
  { href: '/windows', label: 'Active Windows', icon: CalendarRange },
  { href: '/results', label: 'Results Log', icon: ReceiptText },
  { href: '/results/import', label: 'Results Import', icon: Download },
  { href: '/hits', label: 'Hit Scanner', icon: SearchCheck },
  { href: '/fell-before', label: 'As They Fell Before', icon: BookMarked },
  { href: '/hot-numbers', label: 'Hot Numbers', icon: Flame },
  { href: '/playlists', label: 'State Playlists', icon: MapPinned },
  { href: '/universal-scope', label: 'Universal Scope', icon: Sparkles },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '280px',
        minHeight: '100vh',
        padding: '24px 18px',
        borderRight: '1px solid var(--border-muted)',
        background:
          'linear-gradient(180deg, rgba(250,247,242,0.98) 0%, rgba(242,237,228,0.95) 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div className="journal-card-flat">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <MoonStar size={22} color="var(--deep-plum)" />
          <div>
            <div
              style={{
                fontSize: '24px',
                fontStyle: 'italic',
                color: 'var(--deep-plum)',
                lineHeight: 1,
              }}
            >
              Sweet404Peaches
            </div>
            <div
              style={{
                fontSize: '12px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-light)',
                marginTop: '6px',
              }}
            >
              Where Dreams Leave Numbers
            </div>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--ink-light)',
            lineHeight: 1.5,
          }}
        >
          Your private dream journal for symbols, numbers, synchronicity, and
          future tracking.
        </p>
      </div>

      <nav className="journal-card-flat" style={{ display: 'grid', gap: '10px' }}>
        <div
          style={{
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            marginBottom: '4px',
          }}
        >
          Journal Navigation
        </div>

        {navItems.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderRadius: '12px',
                padding: '12px 14px',
                border: active
                  ? '1px solid rgba(201,168,76,0.55)'
                  : '1px solid transparent',
                background: active
                  ? 'rgba(201,168,76,0.14)'
                  : 'rgba(255,255,255,0.55)',
                color: active ? 'var(--deep-plum)' : 'var(--ink)',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="journal-card-flat" style={{ display: 'grid', gap: '10px' }}>
        <div
          style={{
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
          }}
        >
          Coming Next
        </div>

        {['Chat'].map(item => (
          <div
            key={item}
            style={{
              borderRadius: '10px',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.55)',
              color: 'var(--ink-light)',
              fontSize: '14px',
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <div className="journal-card-flat" style={{ marginTop: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            color: 'var(--deep-plum)',
          }}
        >
          <Sparkles size={16} />
          <strong>Current Build Phase</strong>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--ink-light)',
            lineHeight: 1.5,
          }}
        >
          Universal Scope is ready. Next we can add a data-aware chat layer or
          deepen the collective overlap scoring.
        </p>
      </div>
    </aside>
  );
}
TSX

echo "Universal Scope batch complete."
echo "Backups saved to: $BACKUP_DIR"
