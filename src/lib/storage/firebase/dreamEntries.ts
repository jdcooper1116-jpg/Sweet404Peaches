import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { DreamEntry, DreamEntryInput, TermMapping } from '@/lib/types';
import type { DreamEntriesStorage, StorageId, UnknownRecord } from '@/lib/storage/types';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

function normalizeTerm(term: string): string {
  return String(term ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function flattenNumbers(mappings: TermMapping[]): string[] {
  return Array.from(new Set([
    ...mappings.flatMap((m) => (m.cash3Numbers ?? []).map(String)),
    ...mappings.flatMap((m) => (m.cash4Numbers ?? []).map(String)),
  ]));
}

function mapDreamEntry(id: string, data: FirebaseFirestore.DocumentData): DreamEntry {
  return { id, ...data } as DreamEntry;
}

function sortDreamEntries<T extends { dreamDate?: string; uploadedAt?: unknown; createdAt?: unknown }>(
  entries: T[]
): T[] {
  return [...entries].sort((a, b) => {
    const dateA = String(a.dreamDate ?? '');
    const dateB = String(b.dreamDate ?? '');
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;
    const upA = String(a.uploadedAt ?? a.createdAt ?? '');
    const upB = String(b.uploadedAt ?? b.createdAt ?? '');
    return upA < upB ? 1 : -1;
  });
}

export const firebaseDreamEntriesStorage: DreamEntriesStorage = {
  async createDreamEntry(ownerUid: string, input: DreamEntryInput): Promise<StorageId> {
    const db = getAdminDb();
    const ref = db.collection('dreamEntries').doc();
    await ref.set({
      ownerUid,
      ...input,
      uploadedAt: Timestamp.now(),
    });
    return ref.id;
  },

  async createDreamEntryWithWindows(
    ownerUid: string,
    input: Omit<DreamEntryInput, 'allNumbers' | 'activeWindowStart' | 'activeWindowEnd'>
  ): Promise<StorageId> {
    const db = getAdminDb();
    const now = Timestamp.now();
    const activeWindowStart = input.dreamDate;
    const activeWindowEnd = addDays(input.dreamDate, 6);
    const mappings = input.termMappings ?? [];
    const allNumbers = flattenNumbers(mappings);

    const dreamRef = db.collection('dreamEntries').doc();
    const dreamEntryId = dreamRef.id;

    await dreamRef.set({
      ownerUid,
      ...input,
      allNumbers,
      activeWindowStart,
      activeWindowEnd,
      uploadedAt: now,
    });

    const windowDocs: Array<Record<string, unknown>> = [];
    const dictRows: Array<{ docId: string; fields: Record<string, unknown> }> = [];

    for (const mapping of mappings) {
      const termLabel = String(mapping.term || '').trim() || 'unknown-term';
      const normalizedTerm = normalizeTerm(termLabel);

      for (const [gameType, numbers] of [
        ['cash3', mapping.cash3Numbers ?? []],
        ['cash4', mapping.cash4Numbers ?? []],
      ] as const) {
        for (const value of numbers) {
          const number = String(value ?? '').trim();
          if (!number) continue;

          windowDocs.push({
            ownerUid,
            dreamEntryId,
            dreamerId: input.dreamerId,
            dreamerName: input.dreamerName,
            termLabel,
            number,
            gameType,
            boxedKey: sortedDigits(number),
            activeStart: activeWindowStart,
            activeEnd: activeWindowEnd,
            isActive: true,
            statesTracked: [...US_STATES],
            createdAt: now,
            updatedAt: now,
          });

          const docId = [ownerUid, input.dreamerId, normalizedTerm, number, gameType]
            .map(safeId)
            .join('__');
          dictRows.push({
            docId,
            fields: {
              ownerUid,
              dreamerId: input.dreamerId,
              dreamerName: input.dreamerName,
              termLabel,
              normalizedTerm,
              number,
              gameType,
              source: 'live-dream-intake',
              dreamEntryId,
              sourceDreamEntryId: dreamEntryId,
              dreamDate: input.dreamDate,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      }
    }

    for (let i = 0; i < windowDocs.length; i += 400) {
      const batch = db.batch();
      windowDocs.slice(i, i + 400).forEach((data) => {
        batch.set(db.collection('activeDreamWindows').doc(), data);
      });
      await batch.commit();
    }

    for (let i = 0; i < dictRows.length; i += 400) {
      const batch = db.batch();
      dictRows.slice(i, i + 400).forEach(({ docId, fields }) => {
        batch.set(db.collection('termNumberMappings').doc(docId), fields, { merge: true });
      });
      await batch.commit();
    }

    return dreamEntryId;
  },

  async listDreamEntries(
    ownerUid: string,
    options?: { dreamerId?: string; limit?: number }
  ): Promise<DreamEntry[]> {
    const db = getAdminDb();
    let query = db.collection('dreamEntries').where('ownerUid', '==', ownerUid);
    if (options?.dreamerId) query = query.where('dreamerId', '==', options.dreamerId) as any;

    const snap = await (query as any).limit(Math.min(options?.limit ?? 200, 1000)).get();
    return sortDreamEntries(snap.docs.map((doc: any) => mapDreamEntry(doc.id, doc.data())));
  },

  async getDreamEntry(id: string): Promise<DreamEntry | null> {
    const db = getAdminDb();
    const snap = await db.collection('dreamEntries').doc(id).get();
    if (!snap.exists) return null;
    return mapDreamEntry(snap.id, snap.data() ?? {});
  },

  async getLatestDreamEntry(
    ownerUid: string,
    options?: { dreamerId?: string }
  ): Promise<UnknownRecord | null> {
    const entries = await this.listDreamEntries(ownerUid, {
      dreamerId: options?.dreamerId,
      limit: 50,
    });
    return (entries[0] as unknown as UnknownRecord) ?? null;
  },

  async deleteDreamEntryCascade(dreamEntryId: string): Promise<void> {
    const db = getAdminDb();
    const batch = db.batch();
    batch.delete(db.collection('dreamEntries').doc(dreamEntryId));

    const windowsSnap = await db
      .collection('activeDreamWindows')
      .where('dreamEntryId', '==', dreamEntryId)
      .get();
    windowsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const hitsSnap = await db
      .collection('dreamHits')
      .where('sourceDreamEntryId', '==', dreamEntryId)
      .get();
    hitsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
  },
};
