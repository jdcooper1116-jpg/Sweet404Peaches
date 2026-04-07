'use client';

import { useEffect, useMemo, useState } from 'react';
import { SearchCheck, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  createDreamHit,
  listActiveDreamWindows,
  listDreamHits,
  listLotteryResults,
  upsertPersonalHitMapping,
} from '@/lib/firebase/firestore';
import { matchActiveWindowsToResults, type MatchedHit } from '@/lib/lottery/hitMatcher';
import type { ActiveDreamWindow, LotteryResult, DreamHit } from '@/lib/types';

function hitKey(hit: MatchedHit) {
  return [
    hit.windowId,
    hit.dreamEntryId,
    hit.termLabel,
    hit.trackedNumber,
    hit.winningResult,
    hit.state,
    hit.drawDate,
    hit.drawTime,
    hit.gameType,
    hit.hitType,
  ].join('__');
}

function existingHitKey(hit: DreamHit) {
  return [
    hit.dreamEntryId,
    hit.termLabel ?? '',
    hit.trackedNumber,
    hit.winningResult,
    hit.state,
    hit.drawDate,
    hit.drawTime,
    hit.gameType,
    hit.hitType,
  ].join('__');
}

function dedupeMatchedHits(items: MatchedHit[]): MatchedHit[] {
  const seen = new Set<string>();
  const unique: MatchedHit[] = [];

  for (const item of items) {
    const key = hitKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

export default function HitsPage() {
  const { user, loading } = useAuth();

  const [windows, setWindows] = useState<ActiveDreamWindow[]>([]);
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [existingHits, setExistingHits] = useState<DreamHit[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const [windowRows, resultRows, hitRows] = await Promise.all([
          listActiveDreamWindows(user.uid),
          listLotteryResults(user.uid, 500),
          listDreamHits(user.uid),
        ]);

        setWindows(windowRows);
        setResults(resultRows);
        setExistingHits(hitRows);
      } catch (err) {
        console.error(err);
        setError('Could not load data needed for hit scanning.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const matches = useMemo(() => {
    return dedupeMatchedHits(matchActiveWindowsToResults(windows, results));
  }, [windows, results]);

  const unsavedMatches = useMemo(() => {
    const existingKeys = new Set(existingHits.map(existingHitKey));
    return matches.filter(match => !existingKeys.has(hitKey(match)));
  }, [matches, existingHits]);

  async function handleSaveMatches() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (!unsavedMatches.length) {
      setMessage('No new matches to save.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      for (const match of unsavedMatches) {
        await createDreamHit(user.uid, {
          dreamerId: match.dreamerId,
          dreamerName: match.dreamerName,
          dreamEntryId: match.dreamEntryId,
          termLabel: match.termLabel,
          trackedNumber: match.trackedNumber,
          gameType: match.gameType,
          state: match.state,
          drawTime: match.drawTime,
          drawDate: match.drawDate,
          winningResult: match.winningResult,
          hitType: match.hitType,
          sameDay: match.sameDay,
          daysFromDream: match.daysFromDream,
          isPersonalizedCandidate: true,
        });

        await upsertPersonalHitMapping(user.uid, {
          dreamerId: match.dreamerId,
          dreamerName: match.dreamerName,
          termLabel: match.termLabel,
          number: match.trackedNumber,
          gameType: match.gameType,
          hitType: match.hitType,
          state: match.state,
          drawTime: match.drawTime,
          drawDate: match.drawDate,
          sourceDreamEntryId: match.dreamEntryId,
          daysFromDream: match.daysFromDream,
          sameDay: match.sameDay,
        });
      }

      setMessage(`Saved ${unsavedMatches.length} new hit(s).`);

      const refreshed = await listDreamHits(user.uid);
      setExistingHits(refreshed);
    } catch (err) {
      console.error(err);
      setError('Could not save hit matches.');
    } finally {
      setSaving(false);
    }
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
            <h1>Hit Scanner</h1>
            <p>
              Scan active dream windows against imported results and save straight
              or boxed hits into your journal memory.
            </p>
          </div>
        </section>

        <section className="journal-card-flat">
          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            }}
          >
            <div>
              <div className="journal-label">Active Windows</div>
              <div>{windows.length}</div>
            </div>
            <div>
              <div className="journal-label">Imported Results</div>
              <div>{results.length}</div>
            </div>
            <div>
              <div className="journal-label">Detected Matches</div>
              <div>{matches.length}</div>
            </div>
            <div>
              <div className="journal-label">Unsaved Matches</div>
              <div>{unsavedMatches.length}</div>
            </div>
          </div>
        </section>

        {message ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#cfe5c8',
              background: '#f5fbf2',
              color: '#315a2b',
            }}
          >
            {message}
          </section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : null}

        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--deep-plum)',
              }}
            >
              <SearchCheck size={18} />
              <strong>Detected Matches</strong>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveMatches}
              disabled={saving || !unsavedMatches.length}
            >
              {saving ? 'Saving Hits...' : 'Save New Hits'}
            </button>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading scanner data...</p>
          </section>
        ) : matches.length === 0 ? (
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
              <strong>No matches found yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Import more results or create more active dream windows first.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '14px' }}>
            {matches.map(match => {
              const alreadySaved = !unsavedMatches.some(m => hitKey(m) === hitKey(match));

              return (
                <article key={hitKey(match)} className="journal-card-flat">
                  <div
                    style={{
                      display: 'grid',
                      gap: '10px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    }}
                  >
                    <div>
                      <div className="journal-label">Dreamer</div>
                      <div>{match.dreamerName}</div>
                    </div>

                    <div>
                      <div className="journal-label">Term</div>
                      <div>{match.termLabel}</div>
                    </div>

                    <div>
                      <div className="journal-label">Tracked Number</div>
                      <div>{match.trackedNumber}</div>
                    </div>

                    <div>
                      <div className="journal-label">Winning Result</div>
                      <div>{match.winningResult}</div>
                    </div>

                    <div>
                      <div className="journal-label">Type</div>
                      <div>{match.hitType}</div>
                    </div>

                    <div>
                      <div className="journal-label">State</div>
                      <div>{match.state}</div>
                    </div>

                    <div>
                      <div className="journal-label">Draw</div>
                      <div>{match.drawTime}</div>
                    </div>

                    <div>
                      <div className="journal-label">Date</div>
                      <div>{match.drawDate}</div>
                    </div>

                    <div>
                      <div className="journal-label">Dream Offset</div>
                      <div>
                        {match.sameDay ? 'Same day' : `${match.daysFromDream} day(s) later`}
                      </div>
                    </div>

                    <div>
                      <div className="journal-label">Status</div>
                      <div>{alreadySaved ? 'Saved' : 'New'}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}
