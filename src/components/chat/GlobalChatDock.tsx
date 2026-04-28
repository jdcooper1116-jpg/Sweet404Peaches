'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MessageCircleHeart, Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { loadChatContext, EMPTY_CONTEXT, type ChatContext } from '@/lib/intelligence/chatContext';
import { answerQuestion } from '@/lib/intelligence/chatAnswering';

// ─── Context-aware quick prompts ──────────────────────────────────────────────

function promptsForPath(pathname: string): string[] {
  if (pathname.startsWith('/hot-numbers') || pathname.startsWith('/intelligence')) {
    return [
      "What are my hottest number families?",
      "Show strongest numbers by family.",
      "Which terms produce the most hits?",
      "Show Georgia families.",
    ];
  }
  if (pathname.startsWith('/dreamers')) {
    return [
      "What is active for me?",
      "Which dreamer has the most active windows?",
      "What's converging right now?",
      "Show my personal dictionary.",
    ];
  }
  if (pathname.startsWith('/fell-before') || pathname.startsWith('/dictionary')) {
    return [
      "What terms have the strongest memory?",
      "Show me fear numbers.",
      "What has sister done before?",
      "Which number appears under the most terms?",
    ];
  }
  if (pathname.startsWith('/hits') || pathname.startsWith('/windows')) {
    return [
      "Show boxed hits from active windows.",
      "Show straight hits.",
      "Which windows have new hits?",
      "Build a Georgia playlist.",
    ];
  }
  if (pathname.startsWith('/forecast-board') || pathname.startsWith('/daily-ops')) {
    return [
      "What's converging right now?",
      "Give me today's strongest plays.",
      "Which states should I watch next?",
      "Check my active windows.",
    ];
  }
  // Default
  return [
    "What's active now?",
    "Show strongest numbers.",
    "Which terms are hot?",
    "What should I watch today?",
    "Check my active windows.",
    "Explain my latest hits.",
    "Build a state playlist.",
  ];
}

// ─── Dock ─────────────────────────────────────────────────────────────────────

export default function GlobalChatDock() {
  const pathname     = usePathname();
  const { user, loading: authLoading } = useAuth();

  const [ctx,      setCtx]      = useState<ChatContext>(EMPTY_CONTEXT);
  const [open,     setOpen]     = useState(false);
  const [input,    setInput]    = useState('');
  const [answer,   setAnswer]   = useState('');
  const [dockLoad, setDockLoad] = useState(true);

  // Load on first open, not on mount (keeps initial page load fast)
  useEffect(() => {
    if (!open || !user || ctx.ownerUid) return;  // already loaded
    loadChatContext(user.uid)
      .then(c => setCtx(c))
      .catch(err => console.error('GlobalChatDock load:', err))
      .finally(() => setDockLoad(false));
  }, [open, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also stop loading state if auth finishes and dock was never opened
  useEffect(() => {
    if (!authLoading && !open) setDockLoad(false);
  }, [authLoading, open]);

  const prompts = useMemo(() => promptsForPath(pathname), [pathname]);

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    setInput(q);
    if (!ctx.ownerUid) {
      setAnswer('Still loading system data — please wait a moment.');
      return;
    }
    setAnswer(answerQuestion(q, ctx));
  }

  if (!user) return null;

  return (
    <div className="journal-card-flat" style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
      {/* Toggle button */}
      <button type="button" className="btn-secondary" onClick={() => setOpen(v => !v)}
        style={{ width: '100%' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <MessageCircleHeart size={16} />
          {open ? 'Hide Chat Dock' : 'Open Chat Dock'}
        </span>
      </button>

      {open && (
        <>
          {/* Quick prompts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--deep-plum)' }}>
            <Sparkles size={16} /><strong style={{ fontSize: '13px' }}>Quick Questions</strong>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {prompts.map(p => (
              <button key={p} type="button" className="btn-secondary"
                onClick={() => ask(p)} disabled={dockLoad}
                style={{ fontSize: '11px', padding: '5px 9px' }}>
                {p}
              </button>
            ))}
          </div>

          {/* Input */}
          <textarea className="journal-textarea" rows={3} value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about active windows, hot numbers, term history, or state playlists…"
            style={{ fontSize: '13px' }} />

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary"
              onClick={() => ask(input)} disabled={dockLoad || !input.trim()}
              style={{ fontSize: '13px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Send size={13} />Ask
              </span>
            </button>
            <Link href="/chat" className="btn-secondary" style={{ fontSize: '13px' }}>
              Open Full Chat
            </Link>
          </div>

          {/* Answer */}
          <div className="journal-card-flat" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="journal-label">Answer</div>
            <pre style={{
              whiteSpace: 'pre-wrap', lineHeight: 1.6,
              color: 'var(--ink-light)', fontFamily: 'inherit',
              fontSize: '12.5px', marginTop: '8px', maxHeight: '280px', overflowY: 'auto',
            }}>
              {dockLoad
                ? 'Loading system data…'
                : answer || 'Use a quick question above or type your own.'}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
