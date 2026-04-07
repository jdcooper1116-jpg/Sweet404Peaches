#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/sync"
mkdir -p "$BACKUP_DIR/src/lib/chat"
mkdir -p "$BACKUP_DIR/src/app/hot-numbers"
mkdir -p "$BACKUP_DIR/src/app/universal-scope"

[ -f src/lib/sync/numberFamilies.ts ] && cp src/lib/sync/numberFamilies.ts "$BACKUP_DIR/src/lib/sync/numberFamilies.ts.bak"
[ -f src/lib/chat/journalChat.ts ] && cp src/lib/chat/journalChat.ts "$BACKUP_DIR/src/lib/chat/journalChat.ts.bak"
[ -f src/app/hot-numbers/page.tsx ] && cp src/app/hot-numbers/page.tsx "$BACKUP_DIR/src/app/hot-numbers/page.tsx.bak"
[ -f src/app/universal-scope/page.tsx ] && cp src/app/universal-scope/page.tsx "$BACKUP_DIR/src/app/universal-scope/page.tsx.bak"

mkdir -p src/lib/sync
cat > src/lib/sync/numberFamilies.ts <<'TS'
import type { ActiveDreamWindow, GameType, PersonalHitMapping } from '@/lib/types';

export type NumberFamilySummary = {
  familyKey: string;
  gameType: GameType;
  forms: string[];
  terms: string[];
  dreamers: string[];
  activeCount: number;
  priorHits: number;
  georgiaHits: number;
  straightHits: number;
  boxedHits: number;
  score: number;
  reasons: string[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function makeFamilyKey(value: string): string {
  return value.split('').sort().join('');
}

export function summarizeNumberFamilies(
  windows: ActiveDreamWindow[],
  memory: PersonalHitMapping[] = []
): NumberFamilySummary[] {
  const map = new Map<string, NumberFamilySummary>();

  for (const win of windows) {
    const familyKey = makeFamilyKey(win.number);
    const key = `${win.gameType}__${familyKey}`;

    if (!map.has(key)) {
      map.set(key, {
        familyKey,
        gameType: win.gameType,
        forms: [],
        terms: [],
        dreamers: [],
        activeCount: 0,
        priorHits: 0,
        georgiaHits: 0,
        straightHits: 0,
        boxedHits: 0,
        score: 0,
        reasons: [],
      });
    }

    const item = map.get(key)!;
    item.activeCount += 1;
    item.forms.push(win.number);
    item.terms.push(win.termLabel);
    item.dreamers.push(win.dreamerName);
  }

  for (const item of map.values()) {
    const relatedMemory = memory.filter(
      row => row.gameType === item.gameType && makeFamilyKey(row.number) === item.familyKey
    );

    item.forms = unique(item.forms).sort();
    item.terms = unique(item.terms).sort();
    item.dreamers = unique(item.dreamers).sort();

    item.priorHits = relatedMemory.reduce((sum, row) => sum + (row.hitCount || 0), 0);
    item.georgiaHits = relatedMemory
      .filter(row => row.state === 'GA')
      .reduce((sum, row) => sum + (row.hitCount || 0), 0);
    item.straightHits = relatedMemory
      .filter(row => row.hitType === 'straight')
      .reduce((sum, row) => sum + (row.hitCount || 0), 0);
    item.boxedHits = relatedMemory
      .filter(row => row.hitType === 'boxed')
      .reduce((sum, row) => sum + (row.hitCount || 0), 0);

    item.score =
      item.activeCount * 10 +
      item.forms.length * 8 +
      item.terms.length * 7 +
      item.dreamers.length * 8 +
      item.priorHits * 6 +
      item.georgiaHits * 5 +
      item.straightHits * 3 +
      item.boxedHits * 2;

    const reasons: string[] = [];
    reasons.push(`Active in ${item.activeCount} window(s)`);
    reasons.push(`Forms seen: ${item.forms.join(', ')}`);

    if (item.terms.length) {
      reasons.push(`Terms: ${item.terms.join(', ')}`);
    }

    if (item.dreamers.length) {
      reasons.push(`Dreamers: ${item.dreamers.join(', ')}`);
    }

    if (item.priorHits > 0) {
      reasons.push(`Prior saved hits: ${item.priorHits}`);
    }

    if (item.georgiaHits > 0) {
      reasons.push(`Georgia saved hits: ${item.georgiaHits}`);
    }

    item.reasons = reasons;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
    return a.familyKey.localeCompare(b.familyKey);
  });
}
TS

cat > src/app/hot-numbers/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { ActiveDreamWindow, PersonalHitMapping } from '@/lib/types';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

export default function HotNumbersPage() {
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
        setError('Could not load hot-number data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const rankedFamilies = useMemo(() => {
    return summarizeNumberFamilies(windows, memory);
  }, [windows, memory]);

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
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <div>
              <div className="journal-label">Active Windows</div>
              <div>{windows.length}</div>
            </div>
            <div>
              <div className="journal-label">Memory Records</div>
              <div>{memory.length}</div>
            </div>
            <div>
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
              <strong>No hot families yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Create active windows first, then saved hits will make this smarter.
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
TSX

cat > src/app/universal-scope/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Users } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { ActiveDreamWindow, PersonalHitMapping } from '@/lib/types';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

type RepeatedTerm = {
  key: string;
  term: string;
  count: number;
  dreamers: string[];
  numbers: string[];
  score: number;
};

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
              The collective dream field, now centered on repeating number families
              across terms and dreamers.
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
                  <div className="journal-label">Family Convergence</div>
                  <div>{familyConvergence.length}</div>
                </div>

                <div>
                  <div className="journal-label">Repeated Terms</div>
                  <div>{repeatedTerms.length}</div>
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
                  {familyConvergence.slice(0, 20).map((item, index) => (
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
                            Forms: {item.forms.join(', ') || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
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
                <Users size={18} />
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

cat > src/lib/chat/journalChat.ts <<'TS'
import type {
  ActiveDreamWindow,
  DreamEntry,
  DreamHit,
  Dreamer,
  LotteryResult,
  PersonalHitMapping,
} from '@/lib/types';
import { summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

export type JournalChatData = {
  dreams: DreamEntry[];
  windows: ActiveDreamWindow[];
  hits: DreamHit[];
  memory: PersonalHitMapping[];
  results: LotteryResult[];
  dreamers: Dreamer[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

function formatList(values: string[], empty = 'None found.'): string {
  if (!values.length) return empty;
  return values.join(', ');
}

function topRepeatedTerms(windows: ActiveDreamWindow[], limit = 10) {
  const map = new Map<string, { term: string; count: number; dreamers: string[]; numbers: string[] }>();

  for (const win of windows) {
    const key = win.termLabel.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        term: win.termLabel,
        count: 0,
        dreamers: [],
        numbers: [],
      });
    }

    const item = map.get(key)!;
    item.count += 1;
    item.dreamers.push(win.dreamerName);
    item.numbers.push(win.number);
  }

  return Array.from(map.values())
    .map(item => ({
      ...item,
      dreamers: unique(item.dreamers),
      numbers: unique(item.numbers),
    }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

function recentResults(results: LotteryResult[], limit = 12) {
  return [...results]
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.state !== b.state) return a.state.localeCompare(b.state);
      if (a.gameType !== b.gameType) return a.gameType.localeCompare(b.gameType);
      return a.drawTime.localeCompare(b.drawTime);
    })
    .slice(0, limit);
}

function findDreamerByQuestion(question: string, dreamers: Dreamer[]): Dreamer | null {
  const q = normalize(question);

  for (const dreamer of dreamers) {
    if (q.includes(dreamer.displayName.toLowerCase())) return dreamer;
    if (dreamer.alias && q.includes(dreamer.alias.toLowerCase())) return dreamer;
  }

  return null;
}

export function answerJournalQuestion(question: string, data: JournalChatData): string {
  const q = normalize(question);

  if (!q) {
    return 'Ask me about hot families, repeated number families, active windows, dreamers, Georgia hits, boxed hits, or recent results.';
  }

  if (includesAny(q, ['hot family', 'hottest family', 'box family', 'number family', 'repeating numbers across terms', 'synchronicity'])) {
    const topFamilies = summarizeNumberFamilies(data.windows, data.memory).slice(0, 10);
    if (!topFamilies.length) return 'There are no active number families yet. Save a parsed dream first.';

    return [
      'Top active number families right now:',
      ...topFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; terms: ${formatList(item.terms)}; dreamers: ${formatList(item.dreamers)}; score: ${item.score}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['hot number', 'hottest', 'hot numbers', 'active numbers'])) {
    const topFamilies = summarizeNumberFamilies(data.windows, data.memory).slice(0, 10);
    if (!topFamilies.length) return 'There are no active number families yet.';

    return [
      'Top active number families right now:',
      ...topFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — active forms: ${formatList(item.forms)}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['repeated term', 'repeating term', 'terms repeat', 'repeated terms'])) {
    const top = topRepeatedTerms(data.windows, 10);
    if (!top.length) return 'No repeated terms found yet.';

    return [
      'Top repeated terms in the current active field:',
      ...top.map(
        item =>
          `• ${item.term} — ${item.count} occurrence(s); dreamers: ${formatList(item.dreamers)}; numbers: ${formatList(item.numbers)}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['how many dreamers', 'saved dreamers', 'dreamers do i have'])) {
    if (!data.dreamers.length) return 'You do not have any saved dreamers yet.';
    return `You currently have ${data.dreamers.length} saved dreamer(s): ${data.dreamers.map(d => d.displayName).join(', ')}.`;
  }

  if (includesAny(q, ['active windows', 'how many windows', 'current windows'])) {
    if (!data.windows.length) return 'There are no active dream windows yet.';
    return `You currently have ${data.windows.length} active dream window record(s).`;
  }

  if (includesAny(q, ['georgia hit', 'ga hit', 'hits in georgia'])) {
    const gaHits = data.memory.filter(item => item.state === 'GA');
    if (!gaHits.length) return 'There are no saved Georgia hits yet.';

    const summary = gaHits
      .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
      .slice(0, 10)
      .map(item => `• ${item.termLabel} → ${item.number} (${item.gameType}, ${item.hitType}) — ${item.hitCount} hit(s)`)
      .join('\n');

    return `Top saved Georgia hit memories:\n${summary}`;
  }

  if (includesAny(q, ['straight hit', 'straight hits'])) {
    const straight = data.memory.filter(item => item.hitType === 'straight');
    if (!straight.length) return 'There are no saved straight hits yet.';

    return [
      'Saved straight-hit memories:',
      ...straight
        .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
        .slice(0, 10)
        .map(item => `• ${item.termLabel} → ${item.number} (${item.gameType}, ${item.state}) — ${item.hitCount} hit(s)`),
    ].join('\n');
  }

  if (includesAny(q, ['boxed hit', 'boxed hits'])) {
    const boxed = data.memory.filter(item => item.hitType === 'boxed');
    if (!boxed.length) return 'There are no saved boxed hits yet.';

    return [
      'Saved boxed-hit memories:',
      ...boxed
        .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
        .slice(0, 10)
        .map(item => `• ${item.termLabel} → ${item.number} (${item.gameType}, ${item.state}) — ${item.hitCount} hit(s)`),
    ].join('\n');
  }

  if (includesAny(q, ['recent results', 'latest results', 'imported results'])) {
    const rows = recentResults(data.results, 12);
    if (!rows.length) return 'There are no imported results yet.';

    return [
      'Most recent imported results:',
      ...rows.map(
        row =>
          `• ${row.state} ${row.date} ${row.gameType} ${row.drawTime} — ${row.normalizedResult}`
      ),
    ].join('\n');
  }

  const dreamer = findDreamerByQuestion(q, data.dreamers);
  if (dreamer && includesAny(q, ['numbers', 'active', 'dreamer', 'journal'])) {
    const dreamerWindows = data.windows.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    );

    if (!dreamerWindows.length) {
      return `${dreamer.displayName} does not have any active windows yet.`;
    }

    const families = summarizeNumberFamilies(dreamerWindows, data.memory);
    const topFamilyText = families.length
      ? families
          .slice(0, 5)
          .map(item => `Family ${item.familyKey}: ${item.forms.join(', ')}`)
          .join(' • ')
      : 'None';

    const numbers = unique(dreamerWindows.map(item => item.number)).sort();
    const terms = unique(dreamerWindows.map(item => item.termLabel)).sort();

    return [
      `Current active view for ${dreamer.displayName}:`,
      `• Active numbers: ${formatList(numbers)}`,
      `• Active terms: ${formatList(terms)}`,
      `• Window count: ${dreamerWindows.length}`,
      `• Strongest families: ${topFamilyText}`,
    ].join('\n');
  }

  if (includesAny(q, ['help', 'what can i ask', 'what can you do'])) {
    return [
      'You can ask things like:',
      '• What are my hottest number families right now?',
      '• Which box families repeat across terms?',
      '• Show me Georgia hits.',
      '• Show me straight hits.',
      '• Show me boxed hits.',
      '• What numbers are active for [dreamer name]?',
      '• Show me recent imported results.',
    ].join('\n');
  }

  return [
    'I could not match that question yet.',
    'Try asking about number families, hot families, repeated terms, Georgia hits, boxed hits, active windows, or recent results.',
  ].join('\n');
}
TS

echo "Synchronicity upgrade batch complete."
echo "Backups saved to: $BACKUP_DIR"
