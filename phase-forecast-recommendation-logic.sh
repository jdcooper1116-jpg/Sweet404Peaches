#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/app/forecast-board"

[ -f src/app/forecast-board/page.tsx ] && cp src/app/forecast-board/page.tsx "$BACKUP_DIR/src/app/forecast-board/page.tsx.bak"

mkdir -p src/app/forecast-board
cat > src/app/forecast-board/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, Flame, Layers3, MapPinned, Sparkles, Target } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listActiveDreamWindows,
  listDreamers,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';
import type { ActiveDreamWindow, PersonalHitMapping } from '@/lib/types';
import { US_STATES } from '@/lib/types';
import { makeFamilyKey, summarizeNumberFamilies } from '@/lib/sync/numberFamilies';

type StateFamilyStat = {
  familyKey: string;
  gameType: 'cash3' | 'cash4';
  terms: string[];
  numbers: string[];
  totalHits: number;
  straightHits: number;
  boxedHits: number;
};

type ExactNumberStat = {
  number: string;
  gameType: 'cash3' | 'cash4';
  familyKey: string;
  terms: string[];
  totalHits: number;
  straightHits: number;
  boxedHits: number;
};

type AgreementRow = {
  key: string;
  familyKey: string;
  gameType: 'cash3' | 'cash4';
  forms: string[];
  activeTerms: string[];
  stateTerms: string[];
  overlapTerms: string[];
  totalHits: number;
  score: number;
  reasons: string[];
};

type BoxedPlayRow = {
  key: string;
  familyKey: string;
  gameType: 'cash3' | 'cash4';
  forms: string[];
  activeTerms: string[];
  overlapTerms: string[];
  boxedHits: number;
  totalHits: number;
  score: number;
  reasons: string[];
};

type StraightPlayRow = {
  key: string;
  number: string;
  gameType: 'cash3' | 'cash4';
  familyKey: string;
  activeTerms: string[];
  exactTerms: string[];
  overlapTerms: string[];
  straightHits: number;
  totalHits: number;
  score: number;
  reasons: string[];
};

type WatchOnlyRow = {
  key: string;
  familyKey: string;
  gameType: 'cash3' | 'cash4';
  forms: string[];
  terms: string[];
  score: number;
  reasons: string[];
};

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function intersect(a: string[], b: string[]): string[] {
  const bSet = new Set(b.map(item => item.toLowerCase()));
  return unique(a).filter(item => bSet.has(item.toLowerCase()));
}

export default function ForecastBoardPage() {
  const { user, loading } = useAuth();
  const [windows, setWindows] = useState<ActiveDreamWindow[]>([]);
  const [memory, setMemory] = useState<PersonalHitMapping[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [dreamerFilter, setDreamerFilter] = useState('ALL');
  const [selectedState, setSelectedState] = useState('GA');
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
        setError('Could not load forecast board data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

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

  const hotFamilies = useMemo(() => {
    return summarizeNumberFamilies(filteredWindows, filteredMemory);
  }, [filteredWindows, filteredMemory]);

  const selectedStateRows = useMemo(() => {
    return filteredMemory.filter(row => row.state === selectedState);
  }, [filteredMemory, selectedState]);

  const stateFamilyStats = useMemo(() => {
    const map = new Map<string, StateFamilyStat>();

    for (const row of selectedStateRows) {
      const familyKey = makeFamilyKey(row.number);
      const key = `${row.gameType}__${familyKey}`;

      if (!map.has(key)) {
        map.set(key, {
          familyKey,
          gameType: row.gameType,
          terms: [],
          numbers: [],
          totalHits: 0,
          straightHits: 0,
          boxedHits: 0,
        });
      }

      const item = map.get(key)!;
      const count = row.hitCount || 0;
      item.terms.push(row.termLabel);
      item.numbers.push(row.number);
      item.totalHits += count;
      if (row.hitType === 'straight') item.straightHits += count;
      if (row.hitType === 'boxed') item.boxedHits += count;
    }

    for (const item of map.values()) {
      item.terms = unique(item.terms).sort();
      item.numbers = unique(item.numbers).sort();
    }

    return map;
  }, [selectedStateRows]);

  const exactNumberStats = useMemo(() => {
    const map = new Map<string, ExactNumberStat>();

    for (const row of selectedStateRows) {
      const key = `${row.gameType}__${row.number}`;

      if (!map.has(key)) {
        map.set(key, {
          number: row.number,
          gameType: row.gameType,
          familyKey: makeFamilyKey(row.number),
          terms: [],
          totalHits: 0,
          straightHits: 0,
          boxedHits: 0,
        });
      }

      const item = map.get(key)!;
      const count = row.hitCount || 0;
      item.terms.push(row.termLabel);
      item.totalHits += count;
      if (row.hitType === 'straight') item.straightHits += count;
      if (row.hitType === 'boxed') item.boxedHits += count;
    }

    for (const item of map.values()) {
      item.terms = unique(item.terms).sort();
    }

    return map;
  }, [selectedStateRows]);

  const agreementRows = useMemo<AgreementRow[]>(() => {
    const rows: AgreementRow[] = [];

    for (const family of hotFamilies) {
      const key = `${family.gameType}__${family.familyKey}`;
      const stateStat = stateFamilyStats.get(key);
      if (!stateStat) continue;

      const overlapTerms = intersect(family.terms, stateStat.terms);
      const score =
        family.score +
        stateStat.totalHits * 8 +
        overlapTerms.length * 35 +
        stateStat.numbers.length * 4;

      rows.push({
        key,
        familyKey: family.familyKey,
        gameType: family.gameType,
        forms: family.forms,
        activeTerms: family.terms,
        stateTerms: stateStat.terms,
        overlapTerms,
        totalHits: stateStat.totalHits,
        score,
        reasons: [
          `Active family score ${family.score}`,
          `${selectedState} proven family hits ${stateStat.totalHits}`,
          overlapTerms.length
            ? `Term-family overlap: ${overlapTerms.join(', ')}`
            : `No direct term overlap yet, but state support exists`,
        ],
      });
    }

    return rows.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.familyKey.localeCompare(b.familyKey);
    });
  }, [hotFamilies, stateFamilyStats, selectedState]);

  const boxedPlayRows = useMemo<BoxedPlayRow[]>(() => {
    const rows: BoxedPlayRow[] = [];

    for (const family of hotFamilies) {
      const key = `${family.gameType}__${family.familyKey}`;
      const stateStat = stateFamilyStats.get(key);
      if (!stateStat) continue;
      if (stateStat.boxedHits <= 0) continue;

      const overlapTerms = intersect(family.terms, stateStat.terms);
      const score =
        family.score +
        stateStat.boxedHits * 22 +
        overlapTerms.length * 20 +
        stateStat.totalHits * 4;

      rows.push({
        key,
        familyKey: family.familyKey,
        gameType: family.gameType,
        forms: family.forms,
        activeTerms: family.terms,
        overlapTerms,
        boxedHits: stateStat.boxedHits,
        totalHits: stateStat.totalHits,
        score,
        reasons: [
          `Active family score ${family.score}`,
          `${selectedState} boxed support ${stateStat.boxedHits}`,
          overlapTerms.length
            ? `Matched terms: ${overlapTerms.join(', ')}`
            : `State boxed history supports this family`,
        ],
      });
    }

    return rows.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.familyKey.localeCompare(b.familyKey);
    });
  }, [hotFamilies, stateFamilyStats, selectedState]);

  const straightPlayRows = useMemo<StraightPlayRow[]>(() => {
    const rows: StraightPlayRow[] = [];

    for (const family of hotFamilies) {
      for (const form of family.forms) {
        const key = `${family.gameType}__${form}`;
        const exactStat = exactNumberStats.get(key);
        if (!exactStat) continue;
        if (exactStat.straightHits <= 0) continue;

        const overlapTerms = intersect(family.terms, exactStat.terms);
        const score =
          family.score +
          exactStat.straightHits * 25 +
          overlapTerms.length * 25 +
          exactStat.totalHits * 5;

        rows.push({
          key,
          number: form,
          gameType: family.gameType,
          familyKey: family.familyKey,
          activeTerms: family.terms,
          exactTerms: exactStat.terms,
          overlapTerms,
          straightHits: exactStat.straightHits,
          totalHits: exactStat.totalHits,
          score,
          reasons: [
            `Active family score ${family.score}`,
            `${selectedState} straight support ${exactStat.straightHits}`,
            overlapTerms.length
              ? `Exact number term overlap: ${overlapTerms.join(', ')}`
              : `Straight history supports this exact number`,
          ],
        });
      }
    }

    const deduped = new Map<string, StraightPlayRow>();
    for (const row of rows) {
      if (!deduped.has(row.key) || deduped.get(row.key)!.score < row.score) {
        deduped.set(row.key, row);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.number.localeCompare(b.number);
    });
  }, [hotFamilies, exactNumberStats, selectedState]);

  const watchOnlyRows = useMemo<WatchOnlyRow[]>(() => {
    const rows: WatchOnlyRow[] = [];

    for (const family of hotFamilies) {
      const key = `${family.gameType}__${family.familyKey}`;
      const stateStat = stateFamilyStats.get(key);

      if (stateStat && stateStat.totalHits > 0) continue;

      const score =
        family.score +
        family.forms.length * 4 +
        family.terms.length * 4;

      rows.push({
        key,
        familyKey: family.familyKey,
        gameType: family.gameType,
        forms: family.forms,
        terms: family.terms,
        score,
        reasons: [
          `Active family score ${family.score}`,
          `No ${selectedState} proven support yet`,
          `Watch only until evidence strengthens`,
        ],
      });
    }

    return rows.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.familyKey.localeCompare(b.familyKey);
    });
  }, [hotFamilies, stateFamilyStats, selectedState]);

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
            <h1>Forecast Board</h1>
            <p>
              Recommendation board separated into strongest agreement, boxed plays,
              straight plays, and watch-only families.
            </p>
          </div>
        </section>

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading forecast board...</p>
          </section>
        ) : error ? (
          <section className="journal-card" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : (
          <>
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

                <div>
                  <label className="journal-label">State Focus</label>
                  <select
                    className="journal-select"
                    value={selectedState}
                    onChange={e => setSelectedState(e.target.value)}
                  >
                    {US_STATES.map(state => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
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
                  <div>{filteredWindows.length}</div>
                </div>
                <div>
                  <div className="journal-label">Hot Families</div>
                  <div>{hotFamilies.length}</div>
                </div>
                <div>
                  <div className="journal-label">Strong Agreements</div>
                  <div>{agreementRows.length}</div>
                </div>
                <div>
                  <div className="journal-label">Boxed Plays</div>
                  <div>{boxedPlayRows.length}</div>
                </div>
                <div>
                  <div className="journal-label">Straight Plays</div>
                  <div>{straightPlayRows.length}</div>
                </div>
                <div>
                  <div className="journal-label">Watch Only</div>
                  <div>{watchOnlyRows.length}</div>
                </div>
              </div>
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Target size={18} />
                <strong>Strongest Term–Family Agreement</strong>
              </div>

              {agreementRows.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No strong term–family agreement rows in this scope yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {agreementRows.slice(0, 12).map((item, index) => (
                    <article key={item.key} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '20px', marginBottom: '8px' }}>
                            #{index + 1} — Family {item.familyKey} ({item.gameType})
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Forms: {item.forms.join(', ') || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                            Overlap Terms: {item.overlapTerms.join(', ') || 'None'}
                          </div>
                        </div>

                        <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                          <div className="journal-label">Agreement Score</div>
                          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                            {item.score}
                          </div>
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ marginTop: '14px' }}>
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
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Layers3 size={18} />
                <strong>Boxed Plays</strong>
              </div>

              {boxedPlayRows.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No boxed plays supported in this scope yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {boxedPlayRows.slice(0, 12).map((item, index) => (
                    <article key={item.key} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '20px', marginBottom: '8px' }}>
                            #{index + 1} — Family {item.familyKey} ({item.gameType})
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Forms to box: {item.forms.join(', ') || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                            Boxed hits in {selectedState}: {item.boxedHits}
                          </div>
                        </div>

                        <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                          <div className="journal-label">Box Score</div>
                          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                            {item.score}
                          </div>
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ marginTop: '14px' }}>
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
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Flame size={18} />
                <strong>Straight Plays</strong>
              </div>

              {straightPlayRows.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No straight plays supported in this scope yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {straightPlayRows.slice(0, 12).map((item, index) => (
                    <article key={item.key} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '20px', marginBottom: '8px' }}>
                            #{index + 1} — {item.number} ({item.gameType})
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Family: {item.familyKey}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                            Straight hits in {selectedState}: {item.straightHits}
                          </div>
                        </div>

                        <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                          <div className="journal-label">Straight Score</div>
                          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                            {item.score}
                          </div>
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ marginTop: '14px' }}>
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
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Eye size={18} />
                <strong>Watch Only</strong>
              </div>

              {watchOnlyRows.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No watch-only families right now. Current active families already have state support.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px' }}>
                  {watchOnlyRows.slice(0, 12).map((item, index) => (
                    <article key={item.key} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', fontSize: '20px', marginBottom: '8px' }}>
                            #{index + 1} — Family {item.familyKey} ({item.gameType})
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Forms: {item.forms.join(', ') || '—'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '6px' }}>
                            Terms: {item.terms.join(', ') || '—'}
                          </div>
                        </div>

                        <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                          <div className="journal-label">Watch Score</div>
                          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                            {item.score}
                          </div>
                        </div>
                      </div>

                      <div className="journal-card-flat" style={{ marginTop: '14px' }}>
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
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <BarChart3 size={18} />
                <strong>Board Snapshot</strong>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <div className="journal-card-flat">
                  <div className="journal-label">Current Scope</div>
                  <div>{dreamerFilter === 'ALL' ? 'All Dreamers' : dreamerFilter}</div>
                </div>

                <div className="journal-card-flat">
                  <div className="journal-label">Current State Focus</div>
                  <div>{selectedState}</div>
                </div>

                <div className="journal-card-flat">
                  <div className="journal-label">Top Straight Numbers</div>
                  <div>{straightPlayRows.slice(0, 8).map(item => item.number).join(', ') || 'None'}</div>
                </div>

                <div className="journal-card-flat">
                  <div className="journal-label">Top Box Families</div>
                  <div>{boxedPlayRows.slice(0, 8).map(item => item.familyKey).join(', ') || 'None'}</div>
                </div>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
TSX

echo "Forecast recommendation logic batch complete."
echo "Backups saved to: $BACKUP_DIR"
