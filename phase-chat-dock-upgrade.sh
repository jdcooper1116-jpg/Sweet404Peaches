#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/chat"
mkdir -p "$BACKUP_DIR/src/components/chat"
mkdir -p "$BACKUP_DIR/src/components/layout"
mkdir -p "$BACKUP_DIR/src/app/chat"

[ -f src/lib/chat/journalChat.ts ] && cp src/lib/chat/journalChat.ts "$BACKUP_DIR/src/lib/chat/journalChat.ts.bak"
[ -f src/components/chat/GlobalChatDock.tsx ] && cp src/components/chat/GlobalChatDock.tsx "$BACKUP_DIR/src/components/chat/GlobalChatDock.tsx.bak"
[ -f src/components/layout/Sidebar.tsx ] && cp src/components/layout/Sidebar.tsx "$BACKUP_DIR/src/components/layout/Sidebar.tsx.bak"
[ -f src/app/chat/page.tsx ] && cp src/app/chat/page.tsx "$BACKUP_DIR/src/app/chat/page.tsx.bak"

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

export function answerJournalQuestion(question: string, data: JournalChatData): string {
  const q = normalize(question);
  const families = summarizeNumberFamilies(data.windows, data.memory);

  if (!q) {
    return 'Ask me about hot number families, cross-dreamer overlap, Georgia hits, active dreamers, or recent results.';
  }

  if (includesAny(q, ['hot family', 'hottest family', 'box family', 'number family', 'repeating numbers across terms', 'synchronicity', 'hottest numbers'])) {
    const topFamilies = families.slice(0, 10);
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
    const multiDreamer = families.filter(item => item.dreamers.length > 1).slice(0, 10);
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
    const multiTerm = families.filter(item => item.terms.length > 1).slice(0, 10);
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
    if (!data.windows.length) return 'There are no active dream windows yet.';
    return `You currently have ${data.windows.length} active dream window record(s).`;
  }

  if (includesAny(q, ['georgia hit', 'ga hit', 'hits in georgia', 'georgia families'])) {
    const gaHits = data.memory.filter(item => item.state === 'GA');
    if (!gaHits.length) return 'There are no saved Georgia hits yet.';

    const gaFamilies = summarizeNumberFamilies(
      data.windows.filter(w => w.statesTracked.includes('GA')),
      gaHits
    ).slice(0, 10);

    return [
      'Top Georgia-linked families:',
      ...gaFamilies.map(
        item =>
          `• Family ${item.familyKey} (${item.gameType}) — forms: ${formatList(item.forms)}; Georgia hits: ${item.georgiaHits}; score: ${item.score}`
      ),
    ].join('\n');
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

  if (includesAny(q, ['boxed hit', 'boxed hits', 'boxed families'])) {
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
  if (dreamer && includesAny(q, ['numbers', 'active', 'dreamer', 'journal', 'families'])) {
    const dreamerWindows = data.windows.filter(
      item => item.dreamerId === dreamer.id || item.dreamerName === dreamer.displayName
    );

    if (!dreamerWindows.length) {
      return `${dreamer.displayName} does not have any active windows yet.`;
    }

    const dreamerFamilies = summarizeNumberFamilies(dreamerWindows, data.memory).slice(0, 8);
    const numbers = unique(dreamerWindows.map(item => item.number)).sort();
    const terms = unique(dreamerWindows.map(item => item.termLabel)).sort();

    return [
      `Current active view for ${dreamer.displayName}:`,
      `• Active numbers: ${formatList(numbers)}`,
      `• Active terms: ${formatList(terms)}`,
      `• Window count: ${dreamerWindows.length}`,
      `• Strongest families: ${dreamerFamilies.map(item => `Family ${item.familyKey} (${item.forms.join(', ')})`).join(' • ') || 'None'}`,
    ].join('\n');
  }

  if (includesAny(q, ['help', 'what can i ask', 'what can you do'])) {
    return [
      'You can ask things like:',
      '• What are my hottest number families right now?',
      '• Which number families repeat across dreamers?',
      '• Which number families repeat across terms?',
      '• Which dreamer has the most active numbers?',
      '• Show me Georgia families.',
      '• Show me boxed hits.',
      '• What numbers are active for [dreamer name]?',
      '• Show me recent imported results.',
    ].join('\n');
  }

  return [
    'I could not match that question yet.',
    'Try asking about number families, dreamer overlap, Georgia families, boxed hits, active windows, or recent results.',
  ].join('\n');
}
TS

mkdir -p src/components/chat
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
      'Which number families repeat across terms?',
      'Show me Georgia families.',
    ];
  }

  if (pathname.startsWith('/dreamers')) {
    return [
      'How many dreamers do I have?',
      'Which dreamer has the most active numbers?',
      'What numbers are active for Me?',
    ];
  }

  if (pathname.startsWith('/universal-scope')) {
    return [
      'Which number families repeat across dreamers?',
      'Which number families repeat across terms?',
      'What are my hottest number families right now?',
    ];
  }

  if (pathname.startsWith('/hits')) {
    return [
      'Show me boxed hits.',
      'Show me straight hits.',
      'Show me Georgia families.',
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
      'Which number families repeat across terms?',
    ];
  }

  return [
    'What are my hottest number families right now?',
    'Which number families repeat across dreamers?',
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
import GlobalChatDock from '@/components/chat/GlobalChatDock';

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

      <GlobalChatDock />

      <div className="journal-card-flat" style={{ marginTop: '12px' }}>
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
          Global chat dock is ready. The next step would be stronger forecasting
          or deeper family-scoring logic.
        </p>
      </div>
    </aside>
  );
}
TSX

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
        'Welcome to Sweet404Peaches Chat. Ask me about hot number families, cross-dreamer overlap, Georgia families, hit memory, dreamers, or recent results.',
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

  function handleAsk(questionOverride?: string) {
    const question = (questionOverride ?? input).trim();
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
              A grounded journal assistant focused on number-family synchronicity
              and your real system data.
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

            <section className="journal-card-flat">
              <div className="journal-label">Quick Prompts</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                {[
                  'What are my hottest number families right now?',
                  'Which number families repeat across dreamers?',
                  'Which number families repeat across terms?',
                  'Which dreamer has the most active numbers?',
                  'Show me Georgia families.',
                  'Show me boxed hits.',
                  'Show me recent imported results.',
                ].map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleAsk(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
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
                placeholder="Example: Which number families repeat across dreamers?"
              />

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
                <button type="button" className="btn-primary" onClick={() => handleAsk()}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Send size={16} />
                    Ask
                  </span>
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
                This chat is data-grounded and local. It answers from your real
                Sweet404Peaches records with stronger focus on number-family
                synchronicity.
              </p>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
TSX

echo "Chat dock upgrade complete."
echo "Backups saved to: $BACKUP_DIR"
