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
