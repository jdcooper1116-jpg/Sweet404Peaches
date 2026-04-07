#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/app/hot-numbers"
mkdir -p "$BACKUP_DIR/src/app/universal-scope"
mkdir -p "$BACKUP_DIR/src/lib/chat"
mkdir -p "$BACKUP_DIR/src/components/chat"

[ -f src/app/hot-numbers/page.tsx ] && cp src/app/hot-numbers/page.tsx "$BACKUP_DIR/src/app/hot-numbers/page.tsx.bak"
[ -f src/app/universal-scope/page.tsx ] && cp src/app/universal-scope/page.tsx "$BACKUP_DIR/src/app/universal-scope/page.tsx.bak"
[ -f src/lib/chat/journalChat.ts ] && cp src/lib/chat/journalChat.ts "$BACKUP_DIR/src/lib/chat/journalChat.ts.bak"
[ -f src/components/chat/GlobalChatDock.tsx ] && cp src/components/chat/GlobalChatDock.tsx "$BACKUP_DIR/src/components/chat/GlobalChatDock.tsx.bak"

mkdir -p src/app/hot-numbers
cat > src/app/hot-numbers/page.tsx <<'TSX'
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
TSX

mkdir -p src/app/universal-scope
cat > src/app/universal-scope/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listDreamers,
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
        setError('Could not load Universal Scope data.');
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

  const familyConvergence = useMemo(() => {
    return summarizeNumberFamilies(filteredWindows, filteredMemory).filter(
      item => item.forms.length > 1 || item.terms.length > 1 || item.dreamers.length > 1
    );
  }, [filteredWindows, filteredMemory]);

  const activeRanges = useMemo(() => {
    const ranges = filteredWindows.map(win => `${win.activeStart} → ${win.activeEnd}`);
    return unique(ranges).sort();
  }, [filteredWindows]);

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
            <h1>Universal Scope</h1>
            <p>
              The collective dream field, centered on repeating number families
              across forms, terms, and dreamers.
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
              <div className="journal-label">Family Convergence Groups</div>
              <div>{familyConvergence.length}</div>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="journal-label">Active Window Ranges</div>
            <div style={{ color: 'var(--ink-light)' }}>
              {activeRanges.join(' • ') || 'None'}
            </div>
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
        ) : filteredWindows.length === 0 ? (
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
              <strong>No active dream field in this scope yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Try another dreamer scope or save more parsed dreams.
            </p>
          </section>
        ) : (
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
                No strong number-family convergence detected in this scope yet.
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

function scopeDataToDreamer(
  dreamer: Dreamer | null,
  data: JournalChatData
): JournalChatData {
  if (!dreamer) return data;

  return {
    dreams: data.dreams.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    windows: data.windows.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    hits: data.hits.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    memory: data.memory.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    ),
    results: data.results,
    dreamers: data.dreamers,
  };
}

export function answerJournalQuestion(question: string, data: JournalChatData): string {
  const q = normalize(question);
  const matchedDreamer = findDreamerByQuestion(q, data.dreamers);
  const scoped = scopeDataToDreamer(matchedDreamer, data);
  const families = summarizeNumberFamilies(scoped.windows, scoped.memory);

  if (!q) {
    return 'Ask me about hot number families, cross-dreamer overlap, Georgia families, active dreamers, or recent results.';
  }

  if (matchedDreamer && includesAny(q, ['hottest', 'hot families', 'hot family', 'active numbers', 'active families'])) {
    const topFamilies = families.slice(0, 8);
    if (!topFamilies.length) return `${matchedDreamer.displayName} has no active number families yet.`;

    return [
      `Top active families for ${matchedDreamer.displayName}:`,
      ...topFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; terms: ${formatList(item.terms)}; score: ${item.score}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['hot family', 'hottest family', 'box family', 'number family', 'repeating numbers across terms', 'synchronicity', 'hottest numbers'])) {
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

  if (includesAny(q, ['which families repeat across dreamers', 'cross dreamer', 'multiple dreamers', 'dreamers overlap'])) {
    const multiDreamer = summarizeNumberFamilies(data.windows, data.memory)
      .filter(item => item.dreamers.length > 1)
      .slice(0, 10);
    if (!multiDreamer.length) return 'No number families currently repeat across multiple dreamers.';

    return [
      'Number families repeating across multiple dreamers:',
      ...multiDreamer.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — dreamers: ${formatList(item.dreamers)}; forms: ${formatList(item.forms)}; terms: ${formatList(item.terms)}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['which families repeat across terms', 'cross term', 'multiple terms', 'term overlap'])) {
    const multiTerm = summarizeNumberFamilies(data.windows, data.memory)
      .filter(item => item.terms.length > 1)
      .slice(0, 10);
    if (!multiTerm.length) return 'No number families currently repeat across multiple terms.';

    return [
      'Number families repeating across multiple terms:',
      ...multiTerm.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — terms: ${formatList(item.terms)}; forms: ${formatList(item.forms)}; dreamers: ${formatList(item.dreamers)}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['how many dreamers', 'saved dreamers', 'dreamers do i have'])) {
    if (!data.dreamers.length) return 'You do not have any saved dreamers yet.';
    return `You currently have ${data.dreamers.length} saved dreamer(s): ${data.dreamers.map(d => d.displayName).join(', ')}.`;
  }

  if (includesAny(q, ['which dreamer has the most active numbers', 'most active dreamer', 'active dreamer'])) {
    if (!data.windows.length) return 'There are no active windows yet.';

    const counts = new Map<string, number>();
    for (const win of data.windows) {
      counts.set(win.dreamerName, (counts.get(win.dreamerName) || 0) + 1);
    }

    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const [name, count] = ranked[0];
    return `${name} currently has the most active window records with ${count}.`;
  }

  if (includesAny(q, ['active windows', 'how many windows', 'current windows'])) {
    if (!scoped.windows.length) return matchedDreamer ? `${matchedDreamer.displayName} has no active dream windows yet.` : 'There are no active dream windows yet.';
    return matchedDreamer
      ? `${matchedDreamer.displayName} currently has ${scoped.windows.length} active dream window record(s).`
      : `You currently have ${scoped.windows.length} active dream window record(s).`;
  }

  if (includesAny(q, ['georgia hit', 'ga hit', 'hits in georgia', 'georgia families'])) {
    const gaHits = scoped.memory.filter(item => item.state === 'GA');
    if (!gaHits.length) return matchedDreamer ? `There are no saved Georgia hits yet for ${matchedDreamer.displayName}.` : 'There are no saved Georgia hits yet.';

    const gaFamilies = summarizeNumberFamilies(
      scoped.windows.filter(w => w.statesTracked.includes('GA')),
      gaHits
    ).slice(0, 10);

    return [
      matchedDreamer ? `Top Georgia-linked families for ${matchedDreamer.displayName}:` : 'Top Georgia-linked families:',
      ...gaFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; Georgia hits: ${item.georgiaHits}; score: ${item.score}`
      ),
    ].join('\n');
  }

  if (includesAny(q, ['straight hit', 'straight hits'])) {
    const straight = scoped.memory.filter(item => item.hitType === 'straight');
    if (!straight.length) return matchedDreamer ? `There are no saved straight hits yet for ${matchedDreamer.displayName}.` : 'There are no saved straight hits yet.';

    return [
      matchedDreamer ? `Saved straight-hit memories for ${matchedDreamer.displayName}:` : 'Saved straight-hit memories:',
      ...straight
        .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
        .slice(0, 10)
        .map(item => `• ${item.termLabel} → ${item.number} (${item.gameType}, ${item.state}) — ${item.hitCount} hit(s)`),
    ].join('\n');
  }

  if (includesAny(q, ['boxed hit', 'boxed hits', 'boxed families'])) {
    const boxed = scoped.memory.filter(item => item.hitType === 'boxed');
    if (!boxed.length) return matchedDreamer ? `There are no saved boxed hits yet for ${matchedDreamer.displayName}.` : 'There are no saved boxed hits yet.';

    return [
      matchedDreamer ? `Saved boxed-hit memories for ${matchedDreamer.displayName}:` : 'Saved boxed-hit memories:',
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

  if (matchedDreamer && includesAny(q, ['numbers', 'active', 'dreamer', 'journal', 'families'])) {
    const dreamerFamilies = summarizeNumberFamilies(scoped.windows, scoped.memory).slice(0, 8);
    const numbers = unique(scoped.windows.map(item => item.number)).sort();
    const terms = unique(scoped.windows.map(item => item.termLabel)).sort();

    if (!scoped.windows.length) {
      return `${matchedDreamer.displayName} does not have any active windows yet.`;
    }

    return [
      `Current active view for ${matchedDreamer.displayName}:`,
      `• Active numbers: ${formatList(numbers)}`,
      `• Active terms: ${formatList(terms)}`,
      `• Window count: ${scoped.windows.length}`,
      `• Strongest families: ${dreamerFamilies.map(item => `Family ${item.familyKey} (${item.forms.join(', ')})`).join(' • ') || 'None'}`,
    ].join('\n');
  }

  if (includesAny(q, ['help', 'what can i ask', 'what can you do'])) {
    return [
      'You can ask things like:',
      '• What are my hottest number families right now?',
      '• Show me Jamala’s hottest families.',
      '• Show me Mama’s active numbers.',
      '• Which number families repeat across dreamers?',
      '• Which number families repeat across terms?',
      '• Which dreamer has the most active numbers?',
      '• Show me Georgia families.',
      '• Show me boxed hits.',
      '• Show me recent imported results.',
    ].join('\n');
  }

  return [
    'I could not match that question yet.',
    'Try asking about number families, dreamer overlap, Georgia families, boxed hits, active windows, or recent results.',
  ].join('\n');
}
TS

cat > src/components/chat/GlobalChatDock.tsx <<'TSX'
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MessageCircleHeart, Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listDreamEntries,
  listDreamHits,
  listDreamers,
  listLotteryResults,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import { answerJournalQuestion, type JournalChatData } from '@/lib/chat/journalChat';

function promptsForPath(pathname: string): string[] {
  if (pathname.startsWith('/hot-numbers')) {
    return [
      'What are my hottest number families right now?',
      'Show me Jamala’s hottest families.',
      'Which number families repeat across terms?',
      'Show me Georgia families.',
    ];
  }

  if (pathname.startsWith('/dreamers')) {
    return [
      'How many dreamers do I have?',
      'Which dreamer has the most active numbers?',
      'Show me Jamala’s hottest families.',
      'Show me Mama’s active numbers.',
    ];
  }

  if (pathname.startsWith('/universal-scope')) {
    return [
      'Which number families repeat across dreamers?',
      'Which number families repeat across terms?',
      'Show me Jamala’s hottest families.',
      'What are my hottest number families right now?',
    ];
  }

  if (pathname.startsWith('/hits')) {
    return [
      'Show me boxed hits.',
      'Show me straight hits.',
      'Show me Georgia families.',
      'Show me Jamala’s hottest families.',
    ];
  }

  if (pathname.startsWith('/results')) {
    return [
      'Show me recent imported results.',
      'Show me Georgia families.',
      'What are my hottest number families right now?',
    ];
  }

  if (pathname.startsWith('/dreams')) {
    return [
      'What are my hottest number families right now?',
      'Which dreamer has the most active numbers?',
      'Show me Jamala’s hottest families.',
      'Show me Mama’s active numbers.',
    ];
  }

  return [
    'What are my hottest number families right now?',
    'Which number families repeat across dreamers?',
    'Show me Jamala’s hottest families.',
    'Show me Georgia families.',
  ];
}

export default function GlobalChatDock() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [hits, setHits] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [dockLoading, setDockLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user) {
        setDockLoading(false);
        return;
      }

      try {
        const [dreamRows, windowRows, hitRows, memoryRows, resultRows, dreamerRows] =
          await Promise.all([
            listDreamEntries(user.uid),
            listActiveDreamWindows(user.uid),
            listDreamHits(user.uid),
            listPersonalHitMappings(user.uid),
            listLotteryResults(user.uid, 300),
            listDreamers(user.uid),
          ]);

        setDreams(dreamRows);
        setWindows(windowRows);
        setHits(hitRows);
        setMemory(memoryRows);
        setResults(resultRows);
        setDreamers(dreamerRows);
      } catch (err) {
        console.error(err);
      } finally {
        setDockLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const chatData = useMemo<JournalChatData>(() => {
    return {
      dreams,
      windows,
      hits,
      memory,
      results,
      dreamers,
    };
  }, [dreams, windows, hits, memory, results, dreamers]);

  const prompts = useMemo(() => promptsForPath(pathname), [pathname]);

  function ask(question: string) {
    setInput(question);
    setAnswer(answerJournalQuestion(question, chatData));
  }

  if (!user) return null;

  return (
    <div className="journal-card-flat" style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <MessageCircleHeart size={16} />
          {open ? 'Hide Chat Dock' : 'Open Chat Dock'}
        </span>
      </button>

      {open ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--deep-plum)',
            }}
          >
            <Sparkles size={16} />
            <strong>Quick Questions</strong>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {prompts.map(prompt => (
              <button
                key={prompt}
                type="button"
                className="btn-secondary"
                onClick={() => ask(prompt)}
                disabled={dockLoading}
                style={{ fontSize: '12px', padding: '8px 10px' }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <textarea
            className="journal-textarea"
            rows={4}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about families, dreamers, hits, or recent results..."
          />

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => ask(input)}
              disabled={dockLoading || !input.trim()}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Send size={14} />
                Ask
              </span>
            </button>

            <Link href="/chat" className="btn-secondary">
              Open Full Chat
            </Link>
          </div>

          <div className="journal-card-flat" style={{ background: 'rgba(255,255,255,0.75)' }}>
            <div className="journal-label">Answer</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--ink-light)' }}>
              {dockLoading
                ? 'Loading chat data...'
                : answer || 'Use a quick question or ask your own.'}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
TSX

echo "Dreamer scope controls batch complete."
echo "Backups saved to: $BACKUP_DIR"
