'use client';

import {
  Timestamp,
  addDoc,
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
  ownerProfile: 'ownerProfile',
  dreamers: 'dreamers',
  dreamEntries: 'dreamEntries',
  activeDreamWindows: 'activeDreamWindows',
  lotteryResults: 'lotteryResults',
  dreamHits: 'dreamHits',
  personalHitMappings: 'personalHitMappings',
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
  const ref = doc(db, COLLECTIONS.ownerProfile, uid);
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
  const ref = doc(db, COLLECTIONS.ownerProfile, uid);
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
  const q = query(
    collection(db, COLLECTIONS.activeDreamWindows),
    where('ownerUid', '==', ownerUid),
    where('activeStart', '<=', date),
    where('activeEnd', '>=', date)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => mapDoc<ActiveDreamWindow>(d.id, d.data()));
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

export async function bulkCreateLotteryResults(
  ownerUid: string,
  rows: Array<Omit<LotteryResult, 'id' | 'ownerUid' | 'importedAt' | 'boxedKey'>>
): Promise<void> {
  if (!rows.length) return;

  const batch = writeBatch(db);

  for (const row of rows) {
    const ref = doc(collection(db, COLLECTIONS.lotteryResults));
    batch.set(ref, {
      ownerUid,
      ...row,
      boxedKey: sortedDigits(row.normalizedResult),
      importedAt: nowTs(),
    });
  }

  await batch.commit();
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
