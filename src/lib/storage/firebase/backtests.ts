import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { BacktestsStorage, BacktestDreamIntakeInput, UnknownRecord } from '@/lib/storage/types';

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeTerm(term: string): string {
  return String(term || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isoDate(value: any): string | null {
  return value?.toDate?.()?.toISOString?.() ?? value ?? null;
}

function parseResultObject(input: unknown): Record<string, any> {
  return input && typeof input === 'object' ? input as Record<string, any> : {};
}

const unsupported: BacktestsStorage = {
  createBacktestDreamIntake: async () => {
    throw new Error('overridden below');
  },
  listBacktestDreams: async () => {
    throw new Error('overridden below');
  },
  bulkCreateBacktestResults: async () => {
    throw new Error('Firebase backtest bulkCreateBacktestResults is provided by firestore adapter.');
  },
  listBacktestResultsForDream: async () => {
    throw new Error('Firebase backtest listBacktestResultsForDream is provided by firestore adapter.');
  },
  getBacktestDreamById: async () => {
    throw new Error('Firebase backtest getBacktestDreamById is provided by firestore adapter.');
  },
  listBacktestHitsForDream: async () => {
    throw new Error('Firebase backtest listBacktestHitsForDream is provided by firestore adapter.');
  },
  listAllBacktestHits: async () => {
    throw new Error('Firebase backtest listAllBacktestHits is provided by firestore adapter.');
  },
  getBacktestSummaryForDream: async () => {
    throw new Error('Firebase backtest getBacktestSummaryForDream is provided by firestore adapter.');
  },
  runBacktestReplayForDream: async () => {
    throw new Error('Firebase backtest runBacktestReplayForDream is provided by firestore adapter.');
  },
  listSafeBacktestSummariesForDreams: async () => {
    throw new Error('Firebase backtest listSafeBacktestSummariesForDreams is provided by firestore adapter.');
  },
  saveEngineReplayHits: async () => {
    throw new Error('Firebase backtest saveEngineReplayHits is provided by firestore adapter.');
  },
};

export const firebaseBacktestsStorage: Pick<
  BacktestsStorage,
  | 'createBacktestDreamIntake'
  | 'listBacktestDreams'
  | 'getBacktestDreamById'
  | 'listBacktestHitsForDream'
  | 'getBacktestSummaryForDream'
> = {
  async createBacktestDreamIntake(
    ownerUid: string,
    input: BacktestDreamIntakeInput
  ): Promise<string> {
    const db = getAdminDb();
    const now = Timestamp.now();
    const parseResult = parseResultObject(input.parseResult);
    const dreamerId = String(input.dreamerId || 'owner-self');
    const dreamerName = String(input.dreamerName || '');
    const parsedTermMappings = Array.isArray(parseResult.termMappings) ? parseResult.termMappings : [];
    const cash3Numbers = Array.isArray(parseResult.cash3Numbers) ? parseResult.cash3Numbers : [];
    const cash4Numbers = Array.isArray(parseResult.cash4Numbers) ? parseResult.cash4Numbers : [];
    const archivedNumbers = Array.isArray(parseResult.archivedNumbers) ? parseResult.archivedNumbers : [];
    const activeWindowStart = input.dreamDate;
    const activeWindowEnd = addDays(input.dreamDate, 6);

    const dreamRef = db.collection('backtestDreams').doc();
    const backtestDreamId = dreamRef.id;

    const dreamDoc = {
      ownerUid,
      backtestDreamId,
      dreamerId,
      dreamerName,
      dreamDate: input.dreamDate,
      rawText: input.rawText,
      source: input.source,
      confidence: input.confidence,
      notes: input.notes ?? '',
      parseResult,
      parsedTermMappings,
      cash3Numbers,
      cash4Numbers,
      archivedNumbers,
      activeWindowStart,
      activeWindowEnd,
      status: 'intake-saved',
      replaySource: '',
      createdAt: now,
      updatedAt: now,
    };

    await dreamRef.set(dreamDoc, { merge: true });

    await db.collection('backtestWindows').doc(backtestDreamId).set(
      {
        ownerUid,
        backtestDreamId,
        dreamerId,
        dreamerName,
        dreamDate: input.dreamDate,
        activeWindowStart,
        activeWindowEnd,
        lookaheadDays: 7,
        cash3Numbers,
        cash4Numbers,
        status: 'intake-saved',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const rows: Array<{
      docId: string;
      termLabel: string;
      normalizedTerm: string;
      number: string;
      gameType: 'cash3' | 'cash4';
    }> = [];

    for (const mapping of parsedTermMappings) {
      const termLabel = String(mapping?.term || '').trim();
      if (!termLabel) continue;
      const normalizedTerm = normalizeTerm(termLabel);

      for (const raw of Array.isArray(mapping?.cash3Numbers) ? mapping.cash3Numbers : []) {
        const number = String(raw ?? '').trim();
        if (!number) continue;
        rows.push({
          docId: [ownerUid, dreamerId, normalizedTerm, number, 'cash3'].map(safeId).join('__'),
          termLabel,
          normalizedTerm,
          number,
          gameType: 'cash3',
        });
      }

      for (const raw of Array.isArray(mapping?.cash4Numbers) ? mapping.cash4Numbers : []) {
        const number = String(raw ?? '').trim();
        if (!number) continue;
        rows.push({
          docId: [ownerUid, dreamerId, normalizedTerm, number, 'cash4'].map(safeId).join('__'),
          termLabel,
          normalizedTerm,
          number,
          gameType: 'cash4',
        });
      }
    }

    for (let i = 0; i < rows.length; i += 400) {
      const batch = db.batch();
      for (const row of rows.slice(i, i + 400)) {
        batch.set(
          db.collection('termNumberMappings').doc(row.docId),
          {
            ownerUid,
            dreamerId,
            dreamerName,
            termLabel: row.termLabel,
            normalizedTerm: row.normalizedTerm,
            number: row.number,
            gameType: row.gameType,
            source: 'historical-dream-intake',
            backtestDreamId,
            dreamDate: input.dreamDate,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    return backtestDreamId;
  },

  async listBacktestDreams(
    ownerUid: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<UnknownRecord[]> {
    const db = getAdminDb();
    let q: any = db.collection('backtestDreams').where('ownerUid', '==', ownerUid);
    if (options?.dreamerId) q = q.where('dreamerId', '==', options.dreamerId);

    const snap = await q.limit(Math.min(options?.limit ?? 100, 300)).get();
    const rows = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return rows.sort((a: any, b: any) =>
      String(b.createdAt?.toDate?.()?.toISOString?.() ?? b.createdAt ?? '').localeCompare(
        String(a.createdAt?.toDate?.()?.toISOString?.() ?? a.createdAt ?? '')
      )
    ).map((row: any) => ({
      ...row,
      createdAt: isoDate(row.createdAt),
      updatedAt: isoDate(row.updatedAt),
    }));
  },

  async getBacktestDreamById(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null> {
    const db = getAdminDb();
    const snap = await db.collection('backtestDreams').doc(backtestDreamId).get();
    if (!snap.exists) return null;

    const row = { id: snap.id, ...snap.data() } as any;
    if (row.ownerUid !== ownerUid) return null;
    return row;
  },

  async listBacktestHitsForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord[]> {
    const db = getAdminDb();
    const snap = await db
      .collection('backtestHits')
      .where('ownerUid', '==', ownerUid)
      .where('backtestDreamId', '==', backtestDreamId)
      .limit(2000)
      .get();

    return snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => {
        const ak = `${a.drawDate ?? ''} ${a.drawTime ?? ''}`;
        const bk = `${b.drawDate ?? ''} ${b.drawTime ?? ''}`;
        return ak < bk ? -1 : ak > bk ? 1 : 0;
      });
  },

  async getBacktestSummaryForDream(
    ownerUid: string,
    backtestDreamId: string
  ): Promise<UnknownRecord | null> {
    const db = getAdminDb();
    const snap = await db.collection('backtestSummaries').doc(backtestDreamId).get();
    if (!snap.exists) return null;

    const row = { id: snap.id, ...snap.data() } as any;
    if (row.ownerUid !== ownerUid) return null;
    return row;
  },
};

export const firebaseBacktestsUnsupported = unsupported;
