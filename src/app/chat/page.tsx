// @ts-nocheck
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getBacktestSummaryForDream,
  getLatestDreamEntry,
  listActiveDreamWindows,
  listBacktestDreams,
  listDreamHits,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import {
  buildGroupedTermDictionary,
  flattenDictionary,
  type PersonalMappingRow,
} from '@/lib/intelligence/termDictionary';
import { buildLatestDreamForecast } from '@/lib/intelligence/liveForecast';
import { buildFamilyAnalytics } from '@/lib/intelligence/familyLogic';
import { applyBacktestLearningBoost, buildEvidencePromotionModel } from '@/lib/intelligence/evidencePromotion';
import { buildPerformanceInsights, compareEntities, diagnoseLatestDream } from '@/lib/intelligence/analystEngine';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export default function ChatPage() {
  const { user } = useAuth();

  const [mappingRows, setMappingRows] = useState<PersonalMappingRow[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [backtestSummaries, setBacktestSummaries] = useState<any[]>([]);
  const [latestDream, setLatestDream] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to the Sweet404Peaches Intelligence Chat. I can now compare states, compare terms, diagnose the latest dream, and explain evidence promotion and learning boosts.',
    },
  ]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setMappingRows([]);
        setActiveWindows([]);
        setDreamHits([]);
        setBacktestSummaries([]);
        setLatestDream(null);
        setLoading(false);
        return;
      }

      try {
        const [mappings, windows, hits, dreams, latest] = await Promise.all([
          listPersonalHitMappings(user.uid),
          listActiveDreamWindows(user.uid),
          listDreamHits(user.uid),
          listBacktestDreams(user.uid),
          getLatestDreamEntry(user.uid),
        ]);

        const summaries = await Promise.all(
          dreams.map((dream: any) => getBacktestSummaryForDream(user.uid, dream.id))
        );

        setMappingRows(mappings as PersonalMappingRow[]);
        setActiveWindows(windows);
        setDreamHits(hits);
        setBacktestSummaries(summaries.filter(Boolean));
        setLatestDream(latest);
      } catch (err) {
        console.error(err);
        setError('Could not load intelligence data for chat.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const flat = useMemo(() => {
    const grouped = buildGroupedTermDictionary(mappingRows);
    return flattenDictionary(grouped);
  }, [mappingRows]);

  const familyAnalytics = useMemo(() => buildFamilyAnalytics(flat), [flat]);

  const forecast = useMemo(
    () =>
      buildLatestDreamForecast({
        latestDream,
        activeWindows,
        dreamHits,
        mappingRows,
      }),
    [latestDream, activeWindows, dreamHits, mappingRows]
  );

  const boosted = useMemo(
    () =>
      applyBacktestLearningBoost({
        recommendationRows: forecast.recommendationRows,
        backtestSummaries,
        familyAnalytics,
      }),
    [forecast.recommendationRows, backtestSummaries, familyAnalytics]
  );

  const promotionModel = useMemo(
    () =>
      buildEvidencePromotionModel({
        liveRows: flat,
        backtestSummaries,
        familyAnalytics,
      }),
    [flat, backtestSummaries, familyAnalytics]
  );

  const insights = useMemo(
    () =>
      buildPerformanceInsights({
        dreamHits,
        personalRows: mappingRows,
        backtestSummaries,
      }),
    [dreamHits, mappingRows, backtestSummaries]
  );

  const diagnosis = useMemo(
    () =>
      diagnoseLatestDream({
        latestDream,
        forecast,
        boosted,
        dreamHits,
      }),
    [latestDream, forecast, boosted, dreamHits]
  );

  function answerQuestion(question: string) {
    const q = normalizeText(question);

    if (!flat.length && !boosted.boostedRows.length) {
      return 'There is not enough live or backtest evidence loaded yet for a strong answer.';
    }

    if (q.startsWith('compare state ')) {
      const body = question.replace(/^compare state\s+/i, '');
      const parts = body.split(' vs ').map((s) => s.trim()).filter(Boolean);
      if (parts.length !== 2) return 'Use compare state like this: compare state Illinois vs Georgia';
      const cmp = compareEntities({
        personalRows: mappingRows,
        entityType: 'state',
        a: parts[0],
        b: parts[1],
      });
      return `${cmp.left.label}: ${cmp.left.hits} hits, ${cmp.left.straight} straight, ${cmp.left.boxed} boxed, ${cmp.left.uniqueNumbers} numbers. ${cmp.right.label}: ${cmp.right.hits} hits, ${cmp.right.straight} straight, ${cmp.right.boxed} boxed, ${cmp.right.uniqueNumbers} numbers.`;
    }

    if (q.startsWith('compare term ')) {
      const body = question.replace(/^compare term\s+/i, '');
      const parts = body.split(' vs ').map((s) => s.trim()).filter(Boolean);
      if (parts.length !== 2) return 'Use compare term like this: compare term dancing vs man';
      const cmp = compareEntities({
        personalRows: mappingRows,
        entityType: 'term',
        a: parts[0],
        b: parts[1],
      });
      return `${cmp.left.label}: ${cmp.left.hits} hits, ${cmp.left.straight} straight, ${cmp.left.boxed} boxed, ${cmp.left.uniqueStates} states. ${cmp.right.label}: ${cmp.right.hits} hits, ${cmp.right.straight} straight, ${cmp.right.boxed} boxed, ${cmp.right.uniqueStates} states.`;
    }

    if (q.includes('diagnose latest dream') || q.includes('why is my latest dream')) {
      return `Latest dream diagnosis: ${diagnosis.status}. ${diagnosis.findings.join(' ')}`;
    }

    if (q.includes('performance summary')) {
      return `Performance summary: average days to hit ${insights.avgDaysToHit}; fastest hit day ${insights.fastestHitDay ?? '—'}; slowest hit day ${insights.slowestHitDay ?? '—'}; top state ${insights.topState?.state ?? '—'}; top term ${insights.topTerm?.term ?? '—'}; top game ${insights.topGame?.gameType ?? '—'}.`;
    }

    if (q.includes('universal dictionary') || q.includes('universal candidates')) {
      const top = promotionModel.termCandidates.slice(0, 5);
      if (!top.length) return 'I do not yet see strong Universal Dictionary candidates.';
      return `Top Universal Dictionary candidates: ${top
        .map((row: any) => `${row.term} (${row.promotionTier}, score ${row.promotionScore})`)
        .join('; ')}.`;
    }

    if (q.includes('personal dictionary') || q.includes('personal candidates') || q.includes('as they fell before')) {
      const top = promotionModel.comboCandidates.slice(0, 5);
      if (!top.length) return 'I do not yet see strong Personal Dictionary candidates.';
      return `Top Personal Dictionary candidates: ${top
        .map((row: any) => `${row.term} → ${row.number} in ${row.state} (${row.promotionTier}, score ${row.promotionScore})`)
        .join('; ')}.`;
    }

    if (q.includes('learning boost') || q.includes('backtest boost')) {
      const top = boosted.boostedRows.slice(0, 5);
      if (!top.length) return 'I do not yet see boosted live recommendations.';
      return `Top backtest-to-live learning boosts: ${top
        .map((row: any) => `${row.number} in ${row.state} (${row.term}) → boost ${row.learningBoost}, boosted score ${row.boostedScore}`)
        .join('; ')}.`;
    }

    if (q.includes('hot family') || q.includes('strongest family')) {
      const top = familyAnalytics.families[0];
      if (!top) return 'No family intelligence is available yet.';
      return `The strongest family right now is ${top.familyKey}. It is tagged as ${top.patternTag}, has ${top.totalHits} hit(s), and is strongest in ${top.topStates[0]?.state ?? 'unknown state'}.`;
    }

    if (q.includes('watch next') || q.includes('which states should i watch')) {
      const top = boosted.boostedStateGroups.slice(0, 5);
      if (!top.length) return 'I do not yet have enough historical state evidence to recommend next watches.';
      return `The strongest states to watch next are ${top
        .map((group: any) => `${group.state} (${group.topLearningTier}, boosted score ${group.boostedScore})`)
        .join('; ')}.`;
    }

    if (q.includes('latest dream')) {
      if (!latestDream) return 'I do not see a saved latest live dream yet.';
      return `Your latest dream is dated ${latestDream.dreamDate || 'unknown date'}. There are ${forecast.unresolvedWindows.length} unresolved watch item(s), ${forecast.resolvedHitsForLatestDream.length} resolved hit(s), and ${boosted.boostedRows.length} boosted recommendation(s).`;
    }

    if (q.includes('help')) {
      return 'Try asking: compare state Illinois vs Georgia, compare term dancing vs man, diagnose latest dream, performance summary, universal dictionary, personal dictionary, learning boost, or which states should I watch next.';
    }

    return 'I can answer questions about compare mode, diagnostic mode, performance summary, evidence promotion, learning boosts, hot families, and strongest next states.';
  }

  function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    const reply = answerQuestion(trimmed);

    setMessages((current) => [
      ...current,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: reply },
    ]);

    setInput('');
  }

  const quickPrompts = [
    'compare state Illinois vs Georgia',
    'compare term dancing vs man',
    'diagnose latest dream',
    'performance summary',
    'universal dictionary',
    'personal dictionary',
    'which states should I watch next',
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div className="page-header">
              <h1>Sweet404Peaches Intelligence Chat</h1>
              <p>
                Ask evidence-based questions about compare mode, diagnostic mode, performance, promotion rules, and strongest next-state recommendations.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
              <Link href="/performance" className="btn-secondary">Performance</Link>
            </div>
          </div>
        </section>

        {loading ? <section className="journal-card"><p>Loading intelligence chat...</p></section> : null}
        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div className="page-header">
            <h1>Quick Prompts</h1>
            <p>Click one to test compare mode and diagnostic mode.</p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
            {quickPrompts.map((prompt) => (
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
          <div className="page-header">
            <h1>Conversation</h1>
            <p>The assistant answers from evidence promotion, performance metrics, compare mode, and boosted live forecast memory.</p>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className="journal-card-flat"
                style={{
                  borderLeft:
                    message.role === 'user'
                      ? '4px solid rgba(90, 52, 74, 0.35)'
                      : '4px solid rgba(201, 168, 76, 0.65)',
                }}
              >
                <strong>{message.role === 'user' ? 'You' : 'Sweet404Peaches AI'}</strong>
                <p style={{ marginTop: '8px', color: 'var(--ink-light)', lineHeight: 1.7 }}>
                  {message.content}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <label className="journal-label" htmlFor="chatPrompt">Ask a Question</label>
            <textarea
              id="chatPrompt"
              className="journal-textarea"
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: compare state Illinois vs Georgia, diagnose latest dream, or performance summary'
            />

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleAsk(input)}
              >
                Ask Intelligence Chat
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
