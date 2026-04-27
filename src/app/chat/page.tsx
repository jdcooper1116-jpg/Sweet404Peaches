'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { loadChatContext, EMPTY_CONTEXT, type ChatContext } from '@/lib/intelligence/chatContext';
import { answerQuestion } from '@/lib/intelligence/chatAnswering';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const QUICK_PROMPTS = [
  "What's converging right now?",
  "Give me today's strongest plays.",
  "Which states are hottest?",
  "What should I watch in Georgia?",
  "Show me fear numbers.",
  "Diagnose my system.",
  "Compare term dancing vs sister.",
  "What is active for me?",
  "Which states should I watch next?",
  "What does mountain mean in my dictionary?",
];

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: `Welcome to the Sweet404Peaches Intelligence Chat.\n\nI'm loaded with your live dream data — active windows, hit memory, universal dictionary, and backtest summaries. Ask me about converging numbers, term histories, state playlists, or system diagnostics.\n\nType **help** to see all available questions.`,
};

export default function ChatPage() {
  const { user } = useAuth();

  const [ctx,     setCtx]     = useState<ChatContext>(EMPTY_CONTEXT);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [input,   setInput]   = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }
      try {
        const context = await loadChatContext(user.uid);
        setCtx(context);
      } catch (err) {
        console.error(err);
        setError('Could not load intelligence data. Some answers may be limited.');
      } finally { setLoading(false); }
    }
    void load();
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    const reply = loading
      ? 'Data is still loading — please wait a moment and ask again.'
      : answerQuestion(trimmed, ctx);

    setMessages(cur => [
      ...cur,
      { role: 'user',      content: trimmed },
      { role: 'assistant', content: reply   },
    ]);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
  }

  // Context stats for the info bar
  const today    = new Date().toISOString().slice(0, 10);
  const liveWins = ctx.windows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= today).length;

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background:
        'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), ' +
        'radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), ' +
        'linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
    }}>
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px', alignContent: 'start' }}>

        {/* Header */}
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Sweet404Peaches Intelligence Chat</h1>
              <p>Evidence-based assistant using your live dream windows, hit memory, dictionary, and backtest data. No hallucination — every recommendation shows its source.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
              <Link href="/performance"          className="btn-secondary">Performance</Link>
            </div>
          </div>
        </section>

        {/* Data context bar */}
        <section className="journal-card-flat" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--ink-light)', alignItems: 'center' }}>
          {loading ? (
            <span>Loading intelligence data…</span>
          ) : (
            <>
              <span>Active windows: <strong style={{ color: '#b0b8ff' }}>{liveWins}</strong></span>
              <span>Memory rows: <strong style={{ color: '#b0b8ff' }}>{ctx.mappings.length}</strong></span>
              <span>Dictionary: <strong style={{ color: '#b0b8ff' }}>{ctx.dictionaryTerms.length}</strong></span>
              <span>Hits: <strong style={{ color: '#b0b8ff' }}>{ctx.hits.length}</strong></span>
              <span>Backtests: <strong style={{ color: '#b0b8ff' }}>{ctx.backtests.length}</strong></span>
              <span>Loaded: <strong>{ctx.loadedAt.slice(11, 16)} UTC</strong></span>
              {error && <span style={{ color: '#f87171' }}>⚠ {error}</span>}
            </>
          )}
        </section>

        {/* Quick prompts */}
        <section className="journal-card">
          <div className="page-header" style={{ marginBottom: '12px' }}>
            <h1>Quick Questions</h1>
            <p>Click to get an immediate evidence-backed answer.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {QUICK_PROMPTS.map(p => (
              <button key={p} type="button" className="btn-secondary"
                onClick={() => ask(p)} disabled={loading}
                style={{ fontSize: '12px', padding: '6px 12px' }}>
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* Conversation */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div className="page-header">
            <h1>Conversation</h1>
            <p>The assistant answers from your dream intelligence data — evidence is always shown.</p>
          </div>

          <div style={{ display: 'grid', gap: '12px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
            {messages.map((msg, idx) => (
              <div key={idx} className="journal-card-flat" style={{
                borderLeft: msg.role === 'user'
                  ? '4px solid rgba(90,52,74,0.45)'
                  : '4px solid rgba(201,168,76,0.65)',
              }}>
                <strong style={{ fontSize: '12px', letterSpacing: '0.05em', opacity: 0.7 }}>
                  {msg.role === 'user' ? 'YOU' : 'SWEET404PEACHES AI'}
                </strong>
                <pre style={{
                  marginTop: '8px', color: 'var(--ink-light)', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13.5px',
                }}>
                  {msg.content}
                </pre>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display: 'grid', gap: '10px' }}>
            <label className="journal-label" htmlFor="chatInput">Ask a Question</label>
            <textarea
              id="chatInput"
              className="journal-textarea"
              rows={4}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's converging right now?  ·  Show me fear numbers.  ·  Build a Georgia playlist.  (Enter to send)"
              disabled={loading}
            />
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary"
                onClick={() => ask(input)} disabled={loading || !input.trim()}>
                Ask Intelligence Chat
              </button>
              {messages.length > 1 && (
                <button type="button" className="btn-secondary"
                  onClick={() => setMessages([WELCOME])}>
                  Clear Conversation
                </button>
              )}
            </div>
          </div>
        </section>

      </section>
    </main>
  );
}
