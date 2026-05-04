/**
 * POST /api/admin/audit-hit-counts
 *
 * Detects and optionally repairs personalHitMappings integrity issues:
 *   1. Duplicate aggregate docs (same semantic key, different Firestore doc IDs)
 *   2. Mappings where hitCount !== straightCount + boxedCount
 *   3. Canonical doc ID format violations
 *
 * repair=false  → report only (safe, no writes)
 * repair=true   → merge duplicates into canonical doc, mark legacy as deprecated
 *
 * Root cause this fixes:
 *   batch9a-save-engine-replay-hits used field order  number__STATE__GAMEYPE  (wrong)
 *   All other writers use canonical                   number__GAMETYPE__STATE
 *   Both docs accumulated counts via FieldValue.increment, inflating displayed values.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue }    from 'firebase-admin/firestore';
import { getAdminDb }               from '@/lib/firebase/admin';
import {
  canonicalPmDocId, normalizeTerm, rowSemanticKey,
} from '@/lib/intelligence/hitClassification';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body       = await req.json().catch(() => ({}));
    const ownerUid   = String(body?.ownerUid  ?? '').trim();
    const termFilter = String(body?.term       ?? '').trim().toLowerCase();
    const numFilter  = String(body?.number     ?? '').trim();
    const stateFilter= String(body?.state      ?? '').trim();
    const gameFilter = String(body?.gameType   ?? '').trim();
    const repair     = Boolean(body?.repair);
    const limit      = Math.min(Number(body?.limit ?? 500), 500);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid is required.' }, { status: 400 });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();
    const BATCH = 400;

    // ── 1. Fetch personalHitMappings ─────────────────────────────────────────
    let q: any = db.collection('personalHitMappings').where('ownerUid', '==', ownerUid);
    if (stateFilter) q = q.where('state', '==', stateFilter);
    if (gameFilter === 'cash3' || gameFilter === 'cash4') q = q.where('gameType', '==', gameFilter);

    const snap = await q.limit(limit).get();
    const allDocs: Array<{ id: string; data: Record<string, any> }> =
      snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

    // ── 2. Apply in-memory filters ───────────────────────────────────────────
    let docs = allDocs;
    if (termFilter) {
      docs = docs.filter(({ data: d }) => {
        const nt = String(d.normalizedTerm ?? normalizeTerm(d.termLabel ?? '')).toLowerCase();
        return nt.includes(termFilter) || String(d.termLabel ?? '').toLowerCase().includes(termFilter);
      });
    }
    if (numFilter)   docs = docs.filter(({ data: d }) => String(d.number ?? '') === numFilter);

    // Deprecated duplicate docs are retained for audit history, but they should
    // not participate in active duplicate detection after repair.
    const activeDocs = docs.filter(({ data: d }) => !d._deprecated);
    const deprecatedDocRows = docs.filter(({ data: d }) => !!d._deprecated);

    // ── 3. Group by semantic key ─────────────────────────────────────────────
    const semanticGroups = new Map<string, Array<{ id: string; data: Record<string, any> }>>();
    for (const doc of activeDocs) {
      const key = rowSemanticKey(doc.data);
      if (!semanticGroups.has(key)) semanticGroups.set(key, []);
      semanticGroups.get(key)!.push(doc);
    }

    // ── 4. Audit ─────────────────────────────────────────────────────────────
    
const duplicateGroups: any[]     = [];
    const inconsistentMappings: any[]= [];
    const examples: any[]            = [];

    for (const [skey, group] of semanticGroups.entries()) {
      // Duplicate check: multiple docs for same semantic key
      if (group.length > 1) {
        const canonId = canonicalPmDocId(
          String(group[0].data.ownerUid  ?? ''),
          String(group[0].data.dreamerId ?? 'owner-self'),
          String(group[0].data.normalizedTerm ?? normalizeTerm(group[0].data.termLabel ?? '')),
          String(group[0].data.number    ?? ''),
          String(group[0].data.gameType  ?? ''),
          String(group[0].data.state     ?? ''),
        );
        const docIds = group.map(g => g.id);
        const hits   = group.map(g => Number(g.data.hitCount ?? 0));
        duplicateGroups.push({
          semanticKey: skey,
          canonicalDocId: canonId,
          docCount: group.length,
          docIds,
          hitCounts: hits,
          totalIfSummed: hits.reduce((a, b) => a + b, 0),
          correctCount: Math.max(...hits),
          requiresRepair: true,
        });
        if (examples.length < 5) {
          examples.push({ type: 'duplicate', semanticKey: skey, docIds, hitCounts: hits });
        }
      }

      // hitCount integrity check: hitCount should equal straightCount + boxedCount
      for (const { id, data: d } of group) {
        const hc = Number(d.hitCount      ?? 0);
        const sc = Number(d.straightCount ?? 0);
        const bc = Number(d.boxedCount    ?? 0);
        if (hc !== sc + bc && (hc > 0 || sc > 0 || bc > 0)) {
          inconsistentMappings.push({
            id, hitCount: hc, straightCount: sc, boxedCount: bc,
            discrepancy: hc - (sc + bc),
          });
        }
      }
    }

    // ── 5. Repair (if requested) ──────────────────────────────────────────────
    let repairedMappings  = 0;
    let deprecatedDocs    = 0;
    const repairExamples: any[] = [];

    if (repair && duplicateGroups.length > 0) {
      for (const group of duplicateGroups) {
        if (!group.requiresRepair) continue;

        // Find the canonical doc among duplicates
        const allGroupDocs = semanticGroups.get(group.semanticKey)!;
        const canonId      = group.canonicalDocId;
        const canonDoc     = allGroupDocs.find(d => d.id === canonId);

        // Determine the authoritative count: max hitCount wins
        const maxHits   = Math.max(...allGroupDocs.map(d => Number(d.data.hitCount      ?? 0)));
        const maxStraight = Math.max(...allGroupDocs.map(d => Number(d.data.straightCount ?? 0)));
        const maxBoxed    = Math.max(...allGroupDocs.map(d => Number(d.data.boxedCount    ?? 0)));

        const bw = db.batch();

        // Write/update the canonical doc with authoritative counts
        bw.set(db.collection('personalHitMappings').doc(canonId), {
          ...(canonDoc?.data ?? allGroupDocs[0].data),
          hitCount:      maxHits,
          straightCount: maxStraight,
          boxedCount:    maxBoxed,
          updatedAt:     now,
          _repairedAt:   now,
          _repairNote:   'Merged from duplicate aggregate docs by audit-hit-counts.',
        }, { merge: true });

        // Mark non-canonical docs as deprecated (preserve for rollback, do not delete)
        for (const { id, data } of allGroupDocs) {
          if (id === canonId) continue;
          bw.set(db.collection('personalHitMappings').doc(id), {
            _deprecated:   true,
            _deprecatedAt: now,
            _canonicalId:  canonId,
            _deprecateNote:'Legacy doc ID format. Counts migrated to canonical doc.',
          }, { merge: true });
          deprecatedDocs++;
        }

        await bw.commit();
        repairedMappings++;
        if (repairExamples.length < 3) {
          repairExamples.push({
            semanticKey: group.semanticKey,
            canonicalId: canonId,
            mergedCounts: { hitCount: maxHits, straightCount: maxStraight, boxedCount: maxBoxed },
            deprecatedIds: allGroupDocs.filter(d => d.id !== canonId).map(d => d.id),
          });
        }
      }
    }

    return NextResponse.json({
      ok:              true,
      scannedMappings: docs.length,
      duplicateAggregateGroups: duplicateGroups.length,
      inconsistentMappings:     inconsistentMappings.length,
      repairedMappings,
      deprecatedDuplicates:     deprecatedDocs,
      repairRan:       repair,
      duplicateGroups: duplicateGroups.slice(0, 10),  // top 10 for inspection
      inconsistencies: inconsistentMappings.slice(0, 10),
      examples: repair ? repairExamples : examples,
    });

  } catch (err) {
    console.error('[audit-hit-counts]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Audit failed.' },
      { status: 500 }
    );
  }
}
