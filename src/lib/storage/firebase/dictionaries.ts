import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { GameType, TermNumberMapping } from '@/lib/types';
import type { DictionariesStorage, StorageId, TermNumberMappingInput } from '@/lib/storage/types';

function mapTermNumberMapping(
  id: string,
  data: FirebaseFirestore.DocumentData,
  ownerUid: string
): TermNumberMapping {
  return {
    id,
    sourceDocId: id,
    ownerUid: data.ownerUid ?? ownerUid,
    ...data,
  } as unknown as TermNumberMapping;
}

export const firebaseDictionariesStorage: DictionariesStorage = {
  async listTermNumberMappings(
    ownerUid: string,
    options?: {
      dreamerId?: string;
      term?: string;
      number?: string;
      gameType?: GameType;
      source?: string;
      limit?: number;
    }
  ): Promise<TermNumberMapping[]> {
    const db = getAdminDb();
    let query: any = db.collection('termNumberMappings').where('ownerUid', '==', ownerUid);

    if (options?.dreamerId) query = query.where('dreamerId', '==', options.dreamerId);
    if (options?.source) query = query.where('source', '==', options.source);
    if (options?.gameType) query = query.where('gameType', '==', options.gameType);
    if (options?.number) query = query.where('number', '==', options.number);

    const snap = await query.limit(Math.min(options?.limit ?? 500, 1000)).get();
    let rows = snap.docs.map((doc: any) => mapTermNumberMapping(doc.id, doc.data(), ownerUid));

    if (options?.term) {
      const term = options.term.toLowerCase().trim();
      rows = rows.filter((row: any) =>
        String(row.termLabel ?? row.term ?? '').toLowerCase().includes(term)
      );
    }

    return rows;
  },

  async createTermNumberMapping(
    ownerUid: string,
    input: TermNumberMappingInput
  ): Promise<StorageId> {
    const db = getAdminDb();
    const now = Timestamp.now();
    const dreamerId = (input as any).dreamerId || 'owner-self';
    const termLabel = input.termLabel.trim();
    const number = String(input.number ?? '').trim();
    const gameType = input.gameType;
    const docId = [ownerUid, dreamerId, termLabel, number, gameType]
      .map((value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_'))
      .join('__');

    const payload: Record<string, unknown> = {
      ownerUid,
      dreamerId,
      dreamerName: (input as any).dreamerName || (dreamerId === 'owner-self' ? 'Owner / Self' : ''),
      termLabel,
      normalizedTerm: termLabel.toLowerCase().trim(),
      number,
      gameType,
      source: input.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
    };

    if (input.rawContext) payload.rawContext = input.rawContext;
    if (input.confidenceBasis) payload.confidenceBasis = input.confidenceBasis;
    if ((input as any).dreamDate) payload.dreamDate = (input as any).dreamDate;
    if ((input as any).sourceDreamEntryId) payload.sourceDreamEntryId = (input as any).sourceDreamEntryId;
    if ((input as any).backtestDreamId) payload.backtestDreamId = (input as any).backtestDreamId;

    await db.collection('termNumberMappings').doc(docId).set(payload, { merge: true });
    return docId;
  },

  async deleteTermNumberMappingById(ownerUid: string, mappingId: string): Promise<void> {
    const db = getAdminDb();
    const ref = db.collection('termNumberMappings').doc(mappingId);
    const snap = await ref.get();
    if (!snap.exists) return;
    if (snap.data()?.ownerUid !== ownerUid) return;
    await ref.delete();
  },

  async bulkDeleteManualDictionaryEntries(ownerUid: string): Promise<void> {
    const db = getAdminDb();
    const snap = await db
      .collection('termNumberMappings')
      .where('ownerUid', '==', ownerUid)
      .where('source', '==', 'manual')
      .limit(1000)
      .get();

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  },
};
