'use client';

import {
  Timestamp,
  addDoc,
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type {
  ActiveDreamWindow,
  DreamEntry,
  DreamEntryInput,
  DreamHit,
  Dreamer,
  DreamerInput,
  LotteryResult,
  OwnerProfile,
  PersonalHitMapping,
  TermMapping,
} from '@/lib/types';
import { US_STATES } from '@/lib/types';

const COLLECTIONS = {
  ownerProfiles: 'ownerProfiles',
  dreamEntries: 'dreamEntries',
  dreamers: 'dreamers',
  activeDreamWindows: 'activeDreamWindows',
  lotteryResults: 'lotteryResults',
  dreamHits: 'dreamHits',
  personalHitMappings: 'personalHitMappings',
  termNumberMappings: 'termNumberMappings',
  pinnedPlays: 'pinnedPlays',
} as const;

function nowTs() {
  return Timestamp.now();
}

function cleanUndefined<T extends Record<string, unknown>>(obj: T): T {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

function toDateOnly(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapDoc<T>(id: string, data: DocumentData): T {
  return { id, ...data } as T;
}

export async function upsertOwnerProfile(
  uid: string,
  profile: { displayName: string; email: string }
): Promise<void> {
  const ref = doc(db, COLLECTIONS.ownerProfiles, uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await updateDoc(ref, {
      displayName: profile.displayName,
      email: profile.email,
      updatedAt: nowTs(),
    });
    return;
  }

  const payload: OwnerProfile = {
    uid,
    displayName: profile.displayName,
    email: profile.email,
    createdAt: nowTs(),
    updatedAt: nowTs(),
  };

  await setDoc(ref, payload);
}

export async function getOwnerProfile(uid: string): Promise<OwnerProfile | null> {
  const ref = doc(db, COLLECTIONS.ownerProfiles, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as OwnerProfile;
}

export async function createDreamer(
  ownerUid: string,
  input: DreamerInput
): Promise<string> {
  const payload = cleanUndefined({
    ownerUid,
    ...input,
    createdAt: nowTs(),
    updatedAt: nowTs(),
  });

  const ref = await addDoc(collection(db, COLLECTIONS.dreamers), payload);
  return ref.id;
}

export async function updateDreamer(
  id: string,
  patch: Partial<DreamerInput>
): Promise<void> {
  const ref = doc(db, COLLECTIONS.dreamers, id);
  await updateDoc(
    ref,
    cleanUndefined({
      ...patch,
      updatedAt: nowTs(),
    })
  );
}

export async function listDreamers(ownerUid: string): Promise<Dreamer[]> {
  const q = query(
    collection(db, COLLECTIONS.dreamers),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<Dreamer>(d.id, d.data()));
}

export async function getDreamer(id: string): Promise<Dreamer | null> {
  const ref = doc(db, COLLECTIONS.dreamers, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapDoc<Dreamer>(snap.id, snap.data());
}

function flattenNumbers(termMappings: TermMapping[]): string[] {
  const values = new Set<string>();

  for (const mapping of termMappings) {
    mapping.cash3Numbers.forEach(n => values.add(n));
    mapping.cash4Numbers.forEach(n => values.add(n));
  }

  return Array.from(values);
}

export async function createDreamEntry(
  ownerUid: string,
  input: DreamEntryInput
): Promise<string> {
  const payload = cleanUndefined({
    ownerUid,
    ...input,
    uploadedAt: nowTs(),
  });

  const ref = await addDoc(collection(db, COLLECTIONS.dreamEntries), payload);
  return ref.id;
}

export async function createDreamEntryWithWindows(
  ownerUid: string,
  input: Omit<DreamEntryInput, 'allNumbers' | 'activeWindowStart' | 'activeWindowEnd'>
): Promise<string> {
  const activeWindowStart = input.dreamDate;
  const activeWindowEnd = addDays(input.dreamDate, 6);
  const allNumbers = flattenNumbers(input.termMappings);

  const dreamEntryId = await createDreamEntry(ownerUid, {
    ...input,
    allNumbers,
    activeWindowStart,
    activeWindowEnd,
  });

  const batch = writeBatch(db);

  for (const mapping of input.termMappings) {
    for (const value of mapping.cash3Numbers) {
      const ref = doc(collection(db, COLLECTIONS.activeDreamWindows));
      batch.set(ref, {
        ownerUid,
        dreamEntryId,
        dreamerId: input.dreamerId,
        dreamerName: input.dreamerName,
        termLabel: mapping.term,
        number: value,
        gameType: 'cash3',
        boxedKey: sortedDigits(value),
        activeStart: activeWindowStart,
        activeEnd: activeWindowEnd,
        isActive: true,
        statesTracked: [...US_STATES],
        createdAt: nowTs(),
        updatedAt: nowTs(),
      });
    }

    for (const value of mapping.cash4Numbers) {
      const ref = doc(collection(db, COLLECTIONS.activeDreamWindows));
      batch.set(ref, {
        ownerUid,
        dreamEntryId,
        dreamerId: input.dreamerId,
        dreamerName: input.dreamerName,
        termLabel: mapping.term,
        number: value,
        gameType: 'cash4',
        boxedKey: sortedDigits(value),
        activeStart: activeWindowStart,
        activeEnd: activeWindowEnd,
        isActive: true,
        statesTracked: [...US_STATES],
        createdAt: nowTs(),
        updatedAt: nowTs(),
      });
    }
  }

  await batch.commit();
  return dreamEntryId;
}

export async function listDreamEntries(ownerUid: string): Promise<DreamEntry[]> {
  const q = query(
    collection(db, COLLECTIONS.dreamEntries),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<DreamEntry>(d.id, d.data()));
}

export async function getDreamEntry(id: string): Promise<DreamEntry | null> {
  const ref = doc(db, COLLECTIONS.dreamEntries, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapDoc<DreamEntry>(snap.id, snap.data());
}

export async function listActiveDreamWindows(ownerUid: string): Promise<ActiveDreamWindow[]> {
  const q = query(
    collection(db, COLLECTIONS.activeDreamWindows),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<ActiveDreamWindow>(d.id, d.data()));
}

export async function listActiveDreamWindowsForDate(
  ownerUid: string,
  date: string
): Promise<ActiveDreamWindow[]> {
  const all = await listActiveDreamWindows(ownerUid);
  return all.filter(window => window.activeStart <= date && window.activeEnd >= date);
}

export async function createLotteryResult(
  ownerUid: string,
  input: Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt' | 'boxedKey'>
): Promise<string> {
  const normalizedResult = input.normalizedResult;
  const payload = {
    ownerUid,
    ...input,
    normalizedResult,
    boxedKey: sortedDigits(normalizedResult),
    importedAt: nowTs(),
  };

  const ref = await addDoc(collection(db, COLLECTIONS.lotteryResults), payload);
  return ref.id;
}

function daysBetweenDateStrings(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  return Math.max(0, Math.floor((endMs - startMs) / 86400000));
}

function safeKeyPart(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function makeDreamHitDocId(input: {
  sourceDreamEntryId: string;
  dreamerId: string;
  number: string;
  gameType: string;
  state: string;
  drawDate: string;
  drawTime: string;
  hitType: string;
  result: string;
}) {
  return [
    input.sourceDreamEntryId,
    input.dreamerId,
    input.number,
    input.gameType,
    input.state,
    input.drawDate,
    input.drawTime,
    input.hitType,
    input.result,
  ]
    .map(safeKeyPart)
    .join('__');
}

async function scanImportedLotteryRowsForHits(
  ownerUid: string,
  rows: Array<
    Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt'> & { boxedKey: string }
  >
): Promise<void> {
  const windowsByDate = new Map<string, ActiveDreamWindow[]>();

  for (const row of rows) {
    let windows = windowsByDate.get(row.date);

    if (!windows) {
      windows = await listActiveDreamWindowsForDate(ownerUid, row.date);
      windowsByDate.set(row.date, windows);
    }

    if (!windows.length) continue;

    for (const window of windows) {
      if (window.gameType !== row.gameType) continue;

      const trackedStates = Array.isArray((window as any).statesTracked)
        ? ((window as any).statesTracked as string[])
        : [];

      if (trackedStates.length && !trackedStates.includes(row.state)) continue;

      const isStraight = window.number === row.normalizedResult;
      const isBoxed = window.boxedKey === row.boxedKey;

      if (!isStraight && !isBoxed) continue;

      const hitType: 'straight' | 'boxed' = isStraight ? 'straight' : 'boxed';
      const daysFromDream = daysBetweenDateStrings(window.activeStart, row.date);
      const sameDay = daysFromDream === 0;

      const dreamHitDocId = makeDreamHitDocId({
        sourceDreamEntryId: window.dreamEntryId,
        dreamerId: window.dreamerId,
        number: window.number,
        gameType: row.gameType,
        state: row.state,
        drawDate: row.date,
        drawTime: row.drawTime,
        hitType,
        result: row.normalizedResult,
      });

      await setDoc(
        doc(db, COLLECTIONS.dreamHits, dreamHitDocId),
        {
          ownerUid,
          sourceDreamEntryId: window.dreamEntryId,
          dreamerId: window.dreamerId,
          dreamerName: window.dreamerName,
          termLabel: window.termLabel,
          number: window.number,
          boxedKey: window.boxedKey,
          gameType: row.gameType,
          state: row.state,
          drawDate: row.date,
          drawTime: row.drawTime,
          rawResult: row.rawResult,
          normalizedResult: row.normalizedResult,
          resultBoxedKey: row.boxedKey,
          hitType,
          daysFromDream,
          sameDay,
          createdAt: nowTs(),
        },
        { merge: true }
      );

      await upsertPersonalHitMapping(
        ownerUid,
        {
          dreamerId: window.dreamerId,
          dreamerName: window.dreamerName,
          termLabel: window.termLabel,
          number: window.number,
          gameType: row.gameType,
          state: row.state,
          drawTime: row.drawTime,
          drawDate: row.date,
          hitType,
          sourceDreamEntryId: window.dreamEntryId,
          daysFromDream,
          sameDay,
        } as any
      );
    }
  }
}

export async function bulkCreateLotteryResults(
  ownerUid: string,
  rows: Array<Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt' | 'boxedKey'>>
): Promise<void> {
  if (!rows.length) return;

  const batch = writeBatch(db);

  const preparedRows = rows.map(row => ({
    ...row,
    boxedKey: sortedDigits(row.normalizedResult),
    importedAt: nowTs(),
  }));

  for (const row of preparedRows) {
    const ref = doc(collection(db, COLLECTIONS.lotteryResults));
    batch.set(ref, {
      ownerUid,
      ...row,
    });
  }

  await batch.commit();
  await scanImportedLotteryRowsForHits(ownerUid, preparedRows);
}

export async function listLotteryResults(
  ownerUid: string,
  maxRows = 100
): Promise<LotteryResult[]> {
  const q = query(
    collection(db, COLLECTIONS.lotteryResults),
    where('ownerUid', '==', ownerUid),
    limit(maxRows)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<LotteryResult>(d.id, d.data()));
}

export async function listLotteryResultsByDateRange(
  ownerUid: string,
  start: string,
  end: string
): Promise<LotteryResult[]> {
  const constraints: QueryConstraint[] = [
    where('ownerUid', '==', ownerUid),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'desc'),
  ];

  const q = query(collection(db, COLLECTIONS.lotteryResults), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<LotteryResult>(d.id, d.data()));
}

export async function createDreamHit(
  ownerUid: string,
  input: Omit<DreamHit, 'id' | 'ownerUid' | 'createdAt'>
): Promise<string> {
  const payload = {
    ownerUid,
    ...input,
    createdAt: nowTs(),
  };

  const ref = await addDoc(collection(db, COLLECTIONS.dreamHits), payload);
  return ref.id;
}

export async function listDreamHits(ownerUid: string): Promise<DreamHit[]> {
  const q = query(
    collection(db, COLLECTIONS.dreamHits),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<DreamHit>(d.id, d.data()));
}

export async function upsertPersonalHitMapping(
  ownerUid: string,
  input: Omit<PersonalHitMapping, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt' | 'hitCount'>
): Promise<void> {
  const q = query(
    collection(db, COLLECTIONS.personalHitMappings),
    where('ownerUid', '==', ownerUid),
    where('dreamerId', '==', input.dreamerId),
    where('termLabel', '==', input.termLabel),
    where('number', '==', input.number),
    where('gameType', '==', input.gameType),
    limit(1)
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    const existing = snap.docs[0];
    const current = existing.data() as PersonalHitMapping;

    await updateDoc(doc(db, COLLECTIONS.personalHitMappings, existing.id), {
      hitCount: (current.hitCount ?? 0) + 1,
      state: input.state,
      drawTime: input.drawTime,
      drawDate: input.drawDate,
      hitType: input.hitType,
      sourceDreamEntryId: input.sourceDreamEntryId,
      daysFromDream: input.daysFromDream,
      sameDay: input.sameDay,
      updatedAt: nowTs(),
    });

    return;
  }

  await addDoc(collection(db, COLLECTIONS.personalHitMappings), {
    ownerUid,
    ...input,
    hitCount: 1,
    createdAt: nowTs(),
    updatedAt: nowTs(),
  });
}

export async function listPersonalHitMappings(
  ownerUid: string
): Promise<PersonalHitMapping[]> {
  const q = query(
    collection(db, COLLECTIONS.personalHitMappings),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<PersonalHitMapping>(d.id, d.data()));
}

export function buildDreamDateRange(date: Date | string) {
  const start = toDateOnly(date);
  const end = addDays(start, 6);
  return { start, end };
}

export function makeBoxedKey(value: string) {
  return sortedDigits(value);
}


export async function listTermNumberMappings(ownerUid: string): Promise<any[]> {
  const q = query(
    collection(db, COLLECTIONS.termNumberMappings),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<any>(d.id, d.data()));
}

export async function createTermNumberMapping(ownerUid: string, input: {
  termLabel: string;
  number: string;
  gameType: 'cash3' | 'cash4';
  source?: 'dreambook' | 'manual' | 'parsed';
  confidenceBasis?: string;
  rawContext?: string;
}) {
  const now = Timestamp.now();

  const payload = {
    ownerUid,
    termId: '',
    termLabel: input.termLabel,
    number: input.number,
    gameType: input.gameType,
    source: input.source ?? 'manual',
    confidenceBasis: input.confidenceBasis ?? '',
    rawContext: input.rawContext ?? '',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, COLLECTIONS.termNumberMappings), payload);
  return ref.id;
}


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


export async function deleteDreamEntryCascade(dreamEntryId: string) {
  const batch = writeBatch(db);

  const dreamRef = doc(db, COLLECTIONS.dreamEntries, dreamEntryId);
  batch.delete(dreamRef);

  const windowsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.activeDreamWindows),
      where('sourceDreamEntryId', '==', dreamEntryId)
    )
  );
  windowsSnap.forEach(d => batch.delete(d.ref));

  const hitsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.dreamHits),
      where('sourceDreamEntryId', '==', dreamEntryId)
    )
  );
  hitsSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

export async function deleteDreamerCascade(dreamerId: string) {
  const batch = writeBatch(db);

  const dreamerRef = doc(db, COLLECTIONS.dreamers, dreamerId);
  batch.delete(dreamerRef);

  const dreamsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.dreamEntries),
      where('dreamerId', '==', dreamerId)
    )
  );
  dreamsSnap.forEach(d => batch.delete(d.ref));

  const windowsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.activeDreamWindows),
      where('dreamerId', '==', dreamerId)
    )
  );
  windowsSnap.forEach(d => batch.delete(d.ref));

  const hitsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.dreamHits),
      where('dreamerId', '==', dreamerId)
    )
  );
  hitsSnap.forEach(d => batch.delete(d.ref));

  const personalSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.personalHitMappings),
      where('dreamerId', '==', dreamerId)
    )
  );
  personalSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}


export async function deleteLotteryResultById(resultId: string) {
  await deleteDoc(doc(db, COLLECTIONS.lotteryResults, resultId));
}

export async function deletePinnedPlayById(pinnedPlayId: string) {
  await deleteDoc(doc(db, COLLECTIONS.pinnedPlays, pinnedPlayId));
}

export async function bulkDeleteTestDataByDreamer(dreamerId: string, dreamerName?: string) {
  const batch = writeBatch(db);

  const dreamerRef = doc(db, COLLECTIONS.dreamers, dreamerId);
  batch.delete(dreamerRef);

  const dreamsSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamEntries), where('dreamerId', '==', dreamerId))
  );
  dreamsSnap.forEach(d => batch.delete(d.ref));

  const windowsSnap = await getDocs(
    query(collection(db, COLLECTIONS.activeDreamWindows), where('dreamerId', '==', dreamerId))
  );
  windowsSnap.forEach(d => batch.delete(d.ref));

  const hitsSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamHits), where('dreamerId', '==', dreamerId))
  );
  hitsSnap.forEach(d => batch.delete(d.ref));

  const personalSnap = await getDocs(
    query(collection(db, COLLECTIONS.personalHitMappings), where('dreamerId', '==', dreamerId))
  );
  personalSnap.forEach(d => batch.delete(d.ref));

  const pinnedByScopeSnap = await getDocs(
    query(collection(db, COLLECTIONS.pinnedPlays), where('dreamerScope', '==', dreamerName || dreamerId))
  );
  pinnedByScopeSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

export async function bulkDeleteTestDataByDate(date: string) {
  const batch = writeBatch(db);

  const dreamsSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamEntries), where('dreamDate', '==', date))
  );
  dreamsSnap.forEach(d => batch.delete(d.ref));

  const windowsByStartSnap = await getDocs(
    query(collection(db, COLLECTIONS.activeDreamWindows), where('activeStart', '==', date))
  );
  windowsByStartSnap.forEach(d => batch.delete(d.ref));

  const windowsByEndSnap = await getDocs(
    query(collection(db, COLLECTIONS.activeDreamWindows), where('activeEnd', '==', date))
  );
  windowsByEndSnap.forEach(d => batch.delete(d.ref));

  const hitsByDateSnap = await getDocs(
    query(collection(db, COLLECTIONS.dreamHits), where('drawDate', '==', date))
  );
  hitsByDateSnap.forEach(d => batch.delete(d.ref));

  const resultsSnap = await getDocs(
    query(collection(db, COLLECTIONS.lotteryResults), where('date', '==', date))
  );
  resultsSnap.forEach(d => batch.delete(d.ref));

  const pinnedSnap = await getDocs(
    query(collection(db, COLLECTIONS.pinnedPlays), where('playDate', '==', date))
  );
  pinnedSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}


export async function deletePersonalHitMappingById(mappingId: string) {
  await deleteDoc(doc(db, COLLECTIONS.personalHitMappings, mappingId));
}

export async function deleteTermNumberMappingById(mappingId: string) {
  await deleteDoc(doc(db, COLLECTIONS.termNumberMappings, mappingId));
}

export async function bulkDeletePersonalHitMappingsByDreamer(
  dreamerId: string,
  dreamerName?: string
) {
  const batch = writeBatch(db);

  const byIdSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.personalHitMappings),
      where('dreamerId', '==', dreamerId)
    )
  );
  byIdSnap.forEach(d => batch.delete(d.ref));

  if (dreamerName) {
    const byNameSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.personalHitMappings),
        where('dreamerName', '==', dreamerName)
      )
    );
    byNameSnap.forEach(d => batch.delete(d.ref));
  }

  await batch.commit();
}

export async function bulkDeletePersonalHitMappingsByDate(date: string) {
  const batch = writeBatch(db);

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.personalHitMappings),
      where('drawDate', '==', date)
    )
  );
  snap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

export async function bulkDeleteManualDictionaryEntries() {
  const batch = writeBatch(db);

  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.termNumberMappings),
      where('source', '==', 'manual')
    )
  );
  snap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

export async function rescanLotteryResultsForDateRange(
  ownerUid: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const allRows = await listLotteryResults(ownerUid, 5000);

  const preparedRows = allRows
    .filter(row => row.date >= startDate && row.date <= endDate)
    .map(row => ({
      state: row.state,
      date: row.date,
      gameType: row.gameType,
      drawTime: row.drawTime,
      rawResult: row.rawResult,
      normalizedResult: row.normalizedResult,
      sourceType: row.sourceType,
      boxedKey: row.boxedKey || sortedDigits(row.normalizedResult),
    })) as Array<
      Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt'> & { boxedKey: string }
    >;

  await scanImportedLotteryRowsForHits(ownerUid, preparedRows);
  return preparedRows.length;
}


async function deleteOwnedDocsInCollection(
  ownerUid: string,
  collectionName: string
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, collectionName), where('ownerUid', '==', ownerUid))
  );

  if (snap.empty) return 0;

  const docs = snap.docs;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + 400);

    for (const docSnap of chunk) {
      batch.delete(docSnap.ref);
      deleted += 1;
    }

    await batch.commit();
  }

  return deleted;
}

export async function hardResetOwnerData(ownerUid: string): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  const resetCollections = [
    COLLECTIONS.dreamers,
    COLLECTIONS.dreamEntries,
    COLLECTIONS.activeDreamWindows,
    COLLECTIONS.lotteryResults,
    COLLECTIONS.dreamHits,
    COLLECTIONS.pinnedPlays,

    // legacy / optional collections — harmless if empty
    'predictionSnapshots',
    'universalScopeSnapshots',
    'chatLogs',
    'performanceSnapshots',
    'forecastBoardSnapshots',
    'intelligenceSnapshots',
    'hotFamilies',
  ];

  for (const name of resetCollections) {
    deleted[name] = await deleteOwnedDocsInCollection(ownerUid, name);
  }

  return deleted;
}

async function fullResetDeleteOwnedDocsInCollection(
  ownerUid: string,
  collectionName: string
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, collectionName), where('ownerUid', '==', ownerUid))
  );

  if (snap.empty) return 0;

  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = snap.docs.slice(i, i + 400);

    for (const docSnap of chunk) {
      batch.delete(docSnap.ref);
      deleted += 1;
    }

    await batch.commit();
  }

  return deleted;
}

export async function fullResetOwnerData(ownerUid: string): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  // owner profile is keyed by uid, not ownerUid
  const ownerProfileRef = doc(db, COLLECTIONS.ownerProfiles, ownerUid);
  const ownerProfileSnap = await getDoc(ownerProfileRef);
  if (ownerProfileSnap.exists()) {
    await deleteDoc(ownerProfileRef);
    deleted[COLLECTIONS.ownerProfiles] = 1;
  } else {
    deleted[COLLECTIONS.ownerProfiles] = 0;
  }

  const resetCollections = [
    COLLECTIONS.dreamers,
    COLLECTIONS.dreamEntries,
    COLLECTIONS.activeDreamWindows,
    COLLECTIONS.lotteryResults,
    COLLECTIONS.dreamHits,
    COLLECTIONS.personalHitMappings,
    COLLECTIONS.termNumberMappings,
    COLLECTIONS.pinnedPlays,

    // optional legacy collections
    'predictionSnapshots',
    'universalScopeSnapshots',
    'chatLogs',
    'performanceSnapshots',
    'forecastBoardSnapshots',
    'intelligenceSnapshots',
    'hotFamilies',
  ];

  for (const name of resetCollections) {
    deleted[name] = await fullResetDeleteOwnedDocsInCollection(ownerUid, name);
  }

  return deleted;
}
