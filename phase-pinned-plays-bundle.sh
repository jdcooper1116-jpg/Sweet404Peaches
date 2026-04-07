#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".batch_backups/$STAMP"

mkdir -p "$BACKUP_DIR/src/lib/firebase"
mkdir -p "$BACKUP_DIR/src/app/forecast-board"
mkdir -p "$BACKUP_DIR/src/app/pinned-plays"
mkdir -p "$BACKUP_DIR/src/components/layout"

[ -f src/lib/firebase/firestore.ts ] && cp src/lib/firebase/firestore.ts "$BACKUP_DIR/src/lib/firebase/firestore.ts.bak"
[ -f src/app/forecast-board/page.tsx ] && cp src/app/forecast-board/page.tsx "$BACKUP_DIR/src/app/forecast-board/page.tsx.bak"
[ -f src/app/pinned-plays/page.tsx ] && cp src/app/pinned-plays/page.tsx "$BACKUP_DIR/src/app/pinned-plays/page.tsx.bak"
[ -f src/components/layout/Sidebar.tsx ] && cp src/components/layout/Sidebar.tsx "$BACKUP_DIR/src/components/layout/Sidebar.tsx.bak"

python3 - <<'PY'
from pathlib import Path
import re

path = Path("src/lib/firebase/firestore.ts")
text = path.read_text()

new_block = """const COLLECTIONS = {
  ownerProfiles: 'ownerProfiles',
  dreamEntries: 'dreamEntries',
  dreamers: 'dreamers',
  activeDreamWindows: 'activeDreamWindows',
  lotteryResults: 'lotteryResults',
  dreamHits: 'dreamHits',
  personalHitMappings: 'personalHitMappings',
  termNumberMappings: 'termNumberMappings',
  pinnedPlays: 'pinnedPlays',
} as const;"""

text, count = re.subn(
    r"const COLLECTIONS\s*=\s*\{.*?\}\s*as const;?",
    new_block,
    text,
    flags=re.S,
)

if count != 1:
    raise SystemExit("Could not safely patch the COLLECTIONS block.")

if "export async function listPinnedPlays" not in text:
    text += """

export async function listPinnedPlays(ownerUid: string): Promise<any[]> {
  const q = query(
    collection(db, COLLECTIONS.pinnedPlays),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<any>(d.id, d.data()));
}

export async function createPinnedPlay(ownerUid: string, input: {
  playDate: string;
  dreamerScope: string;
  state: string;
  playType: 'agreement' | 'boxed' | 'straight' | 'watch';
  label: string;
  number?: string;
  familyKey?: string;
  gameType: 'cash3' | 'cash4';
  score: number;
  reasons?: string[];
  notes?: string;
}) {
  const now = Timestamp.now();

  const payload = {
    ownerUid,
    playDate: input.playDate,
    dreamerScope: input.dreamerScope,
    state: input.state,
    playType: input.playType,
    label: input.label,
    number: input.number ?? '',
    familyKey: input.familyKey ?? '',
    gameType: input.gameType,
    score: input.score,
    reasons: input.reasons ?? [],
    notes: input.notes ?? '',
    status: 'pinned',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, COLLECTIONS.pinnedPlays), payload);
  return ref.id;
}

export async function updatePinnedPlay(
  pinnedPlayId: string,
  input: {
    status?: 'pinned' | 'played' | 'won' | 'archived';
    notes?: string;
    playDate?: string;
  }
) {
  const ref = doc(db, COLLECTIONS.pinnedPlays, pinnedPlayId);
  await updateDoc(ref, {
    ...input,
    updatedAt: Timestamp.now(),
  });
}
"""

path.write_text(text)
print("Patched firestore.ts for pinned plays.")
PY

mkdir -p src/app/forecast-board
cat > src/app/forecast-board/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, Flame, Layers3, MapPinned, Pin, Sparkles, Target } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  createPinnedPlay,
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ForecastBoardPage() {
  const { user, loading } = useAuth();
  const [windows, setWindows] = useState<ActiveDreamWindow[]>([]);
  const [memory, setMemory] = useState<PersonalHitMapping[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [dreamerFilter, setDreamerFilter] = useState('ALL');
  const [selectedState, setSelectedState] = useState('GA');
  const [playDate, setPlayDate] = useState(todayIso());
  const [pinningKey, setPinningKey] = useState('');
  const [pinMessage, setPinMessage] = useState('');
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

  async function pinPlay(input: {
    pinKey: string;
    playType: 'agreement' | 'boxed' | 'straight' | 'watch';
    label: string;
    number?: string;
    familyKey?: string;
    gameType: 'cash3' | 'cash4';
    score: number;
    reasons: string[];
  }) {
    if (!user) return;

    try {
      setPinningKey(input.pinKey);
      setPinMessage('');

      await createPinnedPlay(user.uid, {
        playDate,
        dreamerScope: dreamerFilter,
        state: selectedState,
        playType: input.playType,
        label: input.label,
        number: input.number,
        familyKey: input.familyKey,
        gameType: input.gameType,
        score: input.score,
        reasons: input.reasons,
        notes: '',
      });

      setPinMessage(`Pinned: ${input.label}`);
    } catch (err) {
      console.error(err);
      setPinMessage('Could not pin play.');
    } finally {
      setPinningKey('');
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

                <div>
                  <label className="journal-label">Play Date</label>
                  <input
                    type="date"
                    className="journal-input"
                    value={playDate}
                    onChange={e => setPlayDate(e.target.value)}
                  />
                </div>
              </div>

              {pinMessage ? (
                <div
                  className="journal-card-flat"
                  style={{
                    marginTop: '14px',
                    borderColor: '#cfe5c8',
                    background: '#f5fbf2',
                    color: '#315a2b',
                  }}
                >
                  {pinMessage}
                </div>
              ) : null}
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

                        <div style={{ display: 'grid', gap: '10px' }}>
                          <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                            <div className="journal-label">Agreement Score</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {item.score}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn-primary"
                            disabled={pinningKey === item.key}
                            onClick={() =>
                              pinPlay({
                                pinKey: item.key,
                                playType: 'agreement',
                                label: `Agreement Family ${item.familyKey}`,
                                familyKey: item.familyKey,
                                gameType: item.gameType,
                                score: item.score,
                                reasons: item.reasons,
                              })
                            }
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Pin size={14} />
                              {pinningKey === item.key ? 'Pinning...' : 'Pin Agreement'}
                            </span>
                          </button>
                        </div>
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

                        <div style={{ display: 'grid', gap: '10px' }}>
                          <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                            <div className="journal-label">Box Score</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {item.score}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn-primary"
                            disabled={pinningKey === item.key}
                            onClick={() =>
                              pinPlay({
                                pinKey: item.key,
                                playType: 'boxed',
                                label: `Box Family ${item.familyKey}`,
                                familyKey: item.familyKey,
                                gameType: item.gameType,
                                score: item.score,
                                reasons: item.reasons,
                              })
                            }
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Pin size={14} />
                              {pinningKey === item.key ? 'Pinning...' : 'Pin Boxed'}
                            </span>
                          </button>
                        </div>
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

                        <div style={{ display: 'grid', gap: '10px' }}>
                          <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                            <div className="journal-label">Straight Score</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {item.score}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn-primary"
                            disabled={pinningKey === item.key}
                            onClick={() =>
                              pinPlay({
                                pinKey: item.key,
                                playType: 'straight',
                                label: `Straight ${item.number}`,
                                number: item.number,
                                familyKey: item.familyKey,
                                gameType: item.gameType,
                                score: item.score,
                                reasons: item.reasons,
                              })
                            }
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Pin size={14} />
                              {pinningKey === item.key ? 'Pinning...' : 'Pin Straight'}
                            </span>
                          </button>
                        </div>
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

                        <div style={{ display: 'grid', gap: '10px' }}>
                          <div className="journal-card-flat" style={{ minWidth: '150px', textAlign: 'center' }}>
                            <div className="journal-label">Watch Score</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {item.score}
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn-primary"
                            disabled={pinningKey === item.key}
                            onClick={() =>
                              pinPlay({
                                pinKey: item.key,
                                playType: 'watch',
                                label: `Watch Family ${item.familyKey}`,
                                familyKey: item.familyKey,
                                gameType: item.gameType,
                                score: item.score,
                                reasons: item.reasons,
                              })
                            }
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Pin size={14} />
                              {pinningKey === item.key ? 'Pinning...' : 'Pin Watch'}
                            </span>
                          </button>
                        </div>
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
                  <div className="journal-label">Play Date</div>
                  <div>{playDate}</div>
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

mkdir -p src/app/pinned-plays
cat > src/app/pinned-plays/page.tsx <<'TSX'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, Pin, Save, Sparkles } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { listPinnedPlays, updatePinnedPlay } from '@/lib/firebase/firestore';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type PinStatus = 'pinned' | 'played' | 'won' | 'archived';

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export default function PinnedPlaysPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playDateFilter, setPlayDateFilter] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<'ALL' | PinStatus>('ALL');
  const [dreamerScopeFilter, setDreamerScopeFilter] = useState('ALL');
  const [savingId, setSavingId] = useState('');

  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [statusById, setStatusById] = useState<Record<string, PinStatus>>({});

  useEffect(() => {
    async function load() {
      if (!user) {
        setRows([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        const result = await listPinnedPlays(user.uid);
        setRows(result);

        const notesState: Record<string, string> = {};
        const statusState: Record<string, PinStatus> = {};

        for (const row of result) {
          notesState[row.id] = row.notes || '';
          statusState[row.id] = (row.status || 'pinned') as PinStatus;
        }

        setNotesById(notesState);
        setStatusById(statusState);
      } catch (err) {
        console.error(err);
        setError('Could not load pinned plays.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const visibleScopes = useMemo(() => {
    return unique(rows.map(row => row.dreamerScope || 'ALL')).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows
      .filter(row => !playDateFilter || row.playDate === playDateFilter)
      .filter(row => statusFilter === 'ALL' || row.status === statusFilter)
      .filter(row => dreamerScopeFilter === 'ALL' || row.dreamerScope === dreamerScopeFilter)
      .sort((a, b) => {
        if ((a.playDate || '') !== (b.playDate || '')) return (b.playDate || '').localeCompare(a.playDate || '');
        if ((a.score || 0) !== (b.score || 0)) return (b.score || 0) - (a.score || 0);
        return (a.label || '').localeCompare(b.label || '');
      });
  }, [rows, playDateFilter, statusFilter, dreamerScopeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();

    for (const row of filteredRows) {
      const key = row.playType || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    return [
      { key: 'agreement', label: 'Strong Agreements' },
      { key: 'boxed', label: 'Boxed Plays' },
      { key: 'straight', label: 'Straight Plays' },
      { key: 'watch', label: 'Watch Only' },
    ].map(section => ({
      ...section,
      rows: map.get(section.key) || [],
    }));
  }, [filteredRows]);

  async function saveRow(rowId: string) {
    if (!user) return;

    try {
      setSavingId(rowId);
      setError('');
      setMessage('');

      await updatePinnedPlay(rowId, {
        status: statusById[rowId],
        notes: notesById[rowId] || '',
      });

      const refreshed = await listPinnedPlays(user.uid);
      setRows(refreshed);
      setMessage('Pinned play updated.');
    } catch (err) {
      console.error(err);
      setError('Could not update pinned play.');
    } finally {
      setSavingId('');
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
            <h1>Pinned Plays</h1>
            <p>
              Your daily shortlist of pinned families and numbers from the Forecast Board.
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
              <label className="journal-label">Play Date</label>
              <input
                type="date"
                className="journal-input"
                value={playDateFilter}
                onChange={e => setPlayDateFilter(e.target.value)}
              />
            </div>

            <div>
              <label className="journal-label">Status</label>
              <select
                className="journal-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'ALL' | PinStatus)}
              >
                <option value="ALL">All</option>
                <option value="pinned">pinned</option>
                <option value="played">played</option>
                <option value="won">won</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div>
              <label className="journal-label">Dreamer Scope</label>
              <select
                className="journal-select"
                value={dreamerScopeFilter}
                onChange={e => setDreamerScopeFilter(e.target.value)}
              >
                <option value="ALL">All</option>
                {visibleScopes.map(scope => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {message ? (
          <div className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </div>
        ) : null}

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading pinned plays...</p>
          </section>
        ) : filteredRows.length === 0 ? (
          <section className="journal-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: 'var(--deep-plum)' }}>
              <Sparkles size={18} />
              <strong>No pinned plays in this view yet</strong>
            </div>
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>
              Pin items from the Forecast Board to build your daily shortlist.
            </p>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: '20px' }}>
            {grouped.map(section => (
              <article key={section.key} className="journal-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '14px' }}>
                  <BookmarkCheck size={18} />
                  <strong style={{ fontSize: '22px' }}>{section.label}</strong>
                </div>

                {section.rows.length === 0 ? (
                  <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                    Nothing pinned in this section for the current filters.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '14px' }}>
                    {section.rows.map(row => (
                      <div key={row.id} className="journal-card-flat">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--deep-plum)', marginBottom: '8px' }}>
                              <Pin size={16} />
                              <strong style={{ fontSize: '18px' }}>{row.label}</strong>
                            </div>

                            <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                              {row.number ? `Number: ${row.number}` : `Family: ${row.familyKey || '—'}`}
                            </div>
                            <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginTop: '4px' }}>
                              Scope: {row.dreamerScope} • State: {row.state} • Date: {row.playDate}
                            </div>
                          </div>

                          <div className="journal-card-flat" style={{ minWidth: '140px', textAlign: 'center' }}>
                            <div className="journal-label">Score</div>
                            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--deep-plum)' }}>
                              {row.score || 0}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: '14px' }}>
                          <div>
                            <label className="journal-label">Status</label>
                            <select
                              className="journal-select"
                              value={statusById[row.id] || 'pinned'}
                              onChange={e =>
                                setStatusById(current => ({
                                  ...current,
                                  [row.id]: e.target.value as PinStatus,
                                }))
                              }
                            >
                              <option value="pinned">pinned</option>
                              <option value="played">played</option>
                              <option value="won">won</option>
                              <option value="archived">archived</option>
                            </select>
                          </div>

                          <div>
                            <label className="journal-label">Notes</label>
                            <textarea
                              className="journal-textarea"
                              rows={3}
                              value={notesById[row.id] || ''}
                              onChange={e =>
                                setNotesById(current => ({
                                  ...current,
                                  [row.id]: e.target.value,
                                }))
                              }
                              placeholder="Add notes about why you pinned this, results, or outcome..."
                            />
                          </div>
                        </div>

                        <div style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={savingId === row.id}
                            onClick={() => saveRow(row.id)}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <Save size={14} />
                              {savingId === row.id ? 'Saving...' : 'Save Update'}
                            </span>
                          </button>
                        </div>

                        {row.reasons?.length ? (
                          <div className="journal-card-flat" style={{ marginTop: '12px' }}>
                            <div className="journal-label">Reasons</div>
                            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-light)' }}>
                              {row.reasons.map((reason: string) => (
                                <li key={reason} style={{ marginBottom: '6px' }}>
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
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
  BarChart3,
  BookMarked,
  BookOpen,
  BookText,
  BookType,
  BookmarkCheck,
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
  { href: '/dreams', label: 'Dream Journal', icon: BookText },
  { href: '/dreams/new', label: 'New Dream', icon: BookOpen },
  { href: '/dreamers', label: 'Dreamers', icon: Users },
  { href: '/dictionary', label: 'Universal Dictionary', icon: BookType },
  { href: '/windows', label: 'Active Windows', icon: CalendarRange },
  { href: '/results', label: 'Results Log', icon: ReceiptText },
  { href: '/results/import', label: 'Results Import', icon: Download },
  { href: '/hits', label: 'Hit Scanner', icon: SearchCheck },
  { href: '/fell-before', label: 'As They Fell Before', icon: BookMarked },
  { href: '/hot-numbers', label: 'Hot Families', icon: Flame },
  { href: '/playlists', label: 'State Playlists', icon: MapPinned },
  { href: '/universal-scope', label: 'Universal Scope', icon: Sparkles },
  { href: '/forecast-board', label: 'Forecast Board', icon: BarChart3 },
  { href: '/pinned-plays', label: 'Pinned Plays', icon: BookmarkCheck },
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
            <div style={{ fontSize: '24px', fontStyle: 'italic', color: 'var(--deep-plum)', lineHeight: 1 }}>
              Sweet404Peaches
            </div>
            <div style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-light)', marginTop: '6px' }}>
              Where Dreams Leave Numbers
            </div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink-light)', lineHeight: 1.5 }}>
          Your private dream journal for symbols, numbers, synchronicity, and future tracking.
        </p>
      </div>

      <nav className="journal-card-flat" style={{ display: 'grid', gap: '10px' }}>
        <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '4px' }}>
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
                border: active ? '1px solid rgba(201,168,76,0.55)' : '1px solid transparent',
                background: active ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.55)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--deep-plum)' }}>
          <Sparkles size={16} />
          <strong>Current Build Phase</strong>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink-light)', lineHeight: 1.5 }}>
          Pinned plays are ready. The next step would be exports, auto-suggested pins, and stronger post-play outcome tracking.
        </p>
      </div>
    </aside>
  );
}
TSX

echo "Pinned plays bundle complete."
echo "Backups saved to: $BACKUP_DIR"
