#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/chat"
mkdir -p "$BACKUP_DIR/src/app/chat"
mkdir -p "$BACKUP_DIR/src/components/layout"

[ -f src/lib/chat/journalChat.ts ] && cp src/lib/chat/journalChat.ts "$BACKUP_DIR/src/lib/chat/journalChat.ts.bak"
[ -f src/app/chat/page.tsx ] && cp src/app/chat/page.tsx "$BACKUP_DIR/src/app/chat/page.tsx.bak"
[ -f src/components/layout/Sidebar.tsx ] && cp src/components/layout/Sidebar.tsx "$BACKUP_DIR/src/components/layout/Sidebar.tsx.bak"

mkdir -p src/lib/chat
cat > src/lib/chat/journalChat.ts <<'TS'
import type {
  ActiveDreamWindow,
  DreamEntry,
  DreamHit,
  Dreamer,
  LotteryResult,
  PersonalHitMapping,
} from '@/lib/types';

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

function topActiveNumbers(windows: ActiveDreamWindow[], limit = 10) {
  const map = new Map<string, { number: string; gameType: string; count: number; dreamers: string[]; terms: string[] }>();

  for (const win of windows) {
    const key = `${win.gameType}__${win.number}`;
    if (!map.has(key)) {
      map.set(key, {
        number: win.number,
        gameType: win.gameType,
        count: 0,
        dreamers: [],
        terms: [],
      });
    }

    const item = map.get(key)!;
    item.count += 1;
    item.dreamers.push(win.dreamerName);
    item.terms.push(win.termLabel);
  }

  return Array.from(map.values())
    .map(item => ({
      ...item,
      dreamers: unique(item.dreamers),
      terms: unique(item.terms),
    }))
    .sort((a, b) => b.count - a.count || a.number.localeCompare(b.number))
    .slice(0, limit);
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
    return 'Ask me about hot numbers, active windows, dreamers, hits, repeated terms, or recent results.';
  }

  if (includesAny(q, ['hot number', 'hottest', 'hot numbers', 'active numbers'])) {
    const top = topActiveNumbers(data.windows, 10);
    if (!top.length) return 'There are no active numbers yet. Save a parsed dream first.';

    return [
      'Top active numbers right now:',
      ...top.map(
        item =>
          `• ${item.number} (${item.gameType}) — active in ${item.count} window(s); dreamers: ${formatList(item.dreamers)}; terms: ${formatList(item.terms)}`
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

    const numbers = unique(dreamerWindows.map(item => item.number)).sort();
    const terms = unique(dreamerWindows.map(item => item.termLabel)).sort();

    return [
      `Current active view for ${dreamer.displayName}:`,
      `• Active numbers: ${formatList(numbers)}`,
      `• Active terms: ${formatList(terms)}`,
      `• Window count: ${dreamerWindows.length}`,
    ].join('\n');
  }

  if (includesAny(q, ['help', 'what can i ask', 'what can you do'])) {
    return [
      'You can ask things like:',
      '• What are my hottest numbers right now?',
      '• What terms repeat in the active field?',
      '• How many dreamers do I have?',
      '• Show me Georgia hits.',
      '• Show me straight hits.',
      '• Show me boxed hits.',
      '• What numbers are active for [dreamer name]?',
      '• Show me recent imported results.',
    ].join('\n');
  }

  return [
    'I could not match that question yet.',
    'Try asking about hot numbers, repeated terms, dreamers, Georgia hits, straight hits, boxed hits, active windows, or recent results.',
  ].join('\n');
}
TS

mkdir -p src/app/chat
cat > src/app/chat/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircleHeart, Send, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
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

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function ChatPage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [windows, setWindows] = useState<any[]>([]);
  const [hits, setHits] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to Sweet404Peaches Chat. Ask me about hot numbers, active windows, dreamers, Georgia hits, repeated terms, or recent results.',
    },
  ]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setPageLoading(false);
        return;
      }

      try {
        setError('');

        const [dreamRows, windowRows, hitRows, memoryRows, resultRows, dreamerRows] =
          await Promise.all([
            listDreamEntries(user.uid),
            listActiveDreamWindows(user.uid),
            listDreamHits(user.uid),
            listPersonalHitMappings(user.uid),
            listLotteryResults(user.uid, 500),
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
        setError('Could not load data for chat.');
      } finally {
        setPageLoading(false);
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

  function handleAsk() {
    const question = input.trim();
    if (!question) return;

    const answer = answerJournalQuestion(question, chatData);

    setMessages(current => [
      ...current,
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    ]);

    setInput('');
  }

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
            <h1>Sweet404Peaches Chat</h1>
            <p>
              A grounded journal assistant that answers questions from your
              current data.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Loading chat data...
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
                  <div className="journal-label">Dream Entries</div>
                  <div>{dreams.length}</div>
                </div>
                <div>
                  <div className="journal-label">Active Windows</div>
                  <div>{windows.length}</div>
                </div>
                <div>
                  <div className="journal-label">Saved Hits</div>
                  <div>{hits.length}</div>
                </div>
                <div>
                  <div className="journal-label">Dreamers</div>
                  <div>{dreamers.length}</div>
                </div>
              </div>
            </section>

            <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: 'var(--deep-plum)',
                }}
              >
                <MessageCircleHeart size={18} />
                <strong>Journal Conversation</strong>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className="journal-card-flat"
                    style={{
                      background:
                        message.role === 'assistant'
                          ? 'rgba(255,255,255,0.78)'
                          : 'rgba(201,168,76,0.12)',
                    }}
                  >
                    <div className="journal-label">
                      {message.role === 'assistant' ? 'Sweet404Peaches' : 'You'}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="journal-card">
              <label className="journal-label" htmlFor="chatQuestion">
                Ask a question
              </label>
              <textarea
                id="chatQuestion"
                className="journal-textarea"
                rows={4}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Example: What are my hottest numbers right now?"
              />

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
                <button type="button" className="btn-primary" onClick={handleAsk}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Send size={16} />
                    Ask
                  </span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setInput('What are my hottest numbers right now?')
                  }
                >
                  Hot numbers
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setInput('Show me Georgia hits.')
                  }
                >
                  Georgia hits
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setInput('What terms repeat in the active field?')
                  }
                >
                  Repeated terms
                </button>
              </div>
            </section>

            <section className="journal-card-flat">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--deep-plum)',
                  marginBottom: '8px',
                }}
              >
                <Sparkles size={16} />
                <strong>Grounded Chat</strong>
              </div>
              <p style={{ margin: 0, color: 'var(--ink-light)', lineHeight: 1.6 }}>
                This chat is currently data-grounded and local. It answers from your
                real Sweet404Peaches records without needing external AI keys.
              </p>
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
  MessageCircleHeart,
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
  { href: '/chat', label: 'Chat', icon: MessageCircleHeart },
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
          Grounded chat is ready. The next step would be a stronger forecasting
          layer or deeper dream-pattern scoring.
        </p>
      </div>
    </aside>
  );
}
TSX

echo "Chat layer batch complete."
echo "Backups saved to: $BACKUP_DIR"
