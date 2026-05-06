/**
 * POST /api/admin/repair-dreamer-attribution
 *
 * Resolves the correct dreamer for misattributed personalHitEvents and
 * personalHitMappings rows, then rewrites them under the correct dreamerId.
 *
 * Strategy:
 *   1. Load suspected misattributed rows (dreamerId = owner-self with source pointers)
 *   2. Resolve correct dreamerId from source backtestDream/dreamEntry/activeWindow
 *   3. Write corrected docs under new canonical IDs
 *   4. Mark old docs with _suspectedMisattributed: true
 *   5. Rebuild termNumberMappings for the corrected dreamer
 *
 * Body:
 *   ownerUid        required
 *   dreamerId       optional — only fix rows for this expected dreamer
 *   backtestDreamId optional — only fix rows from this backtest
 *   term            optional — only fix rows for this term
 *   dryRun          boolean, default true
 *   limit           max, default 200
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue }     from 'firebase-admin/firestore';
import { getAdminDb }                from '@/lib/firebase/admin';
import {
  canonicalPmDocId, canonicalEventId, normalizeTerm,
  resolveDreamerScope, canonicalDictDocId,
} from '@/lib/intelligence/hitClassification';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

function resolveGT(raw: string): string {
  if (raw === 'pick3') return 'cash3';
  if (raw === 'pick4') return 'cash4';
  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const body          = await req.json().catch(() => ({}));
    const ownerUid      = String(body?.ownerUid      ?? '').trim();
    const dreamerFilter = String(body?.dreamerId     ?? '').trim();
    const btidFilter    = String(body?.backtestDreamId ?? '').trim();
    const termFilter    = String(body?.term          ?? '').trim().toLowerCase();
    const dryRun        = body?.dryRun !== false;  // default true
    const limit         = Math.min(Number(body?.limit ?? 200), 500);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid required.' }, { status: 400 });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();
    const BATCH = 400;

    // Counters
    let scanned = 0, repairsNeeded = 0, repairedEvents = 0,
        repairedMappings = 0, repairedDictRows = 0, skippedExisting = 0;
    const examples: any[] = [];

    // ── 1. Load candidate misattributed events ──────────────────────────
    let evQ: any = db.collection('personalHitEvents')
      .where('ownerUid', '==', ownerUid)
      .where('dreamerId', '==', 'owner-self');  // focused on the misattribution pattern
    if (btidFilter) evQ = evQ.where('backtestDreamId', '==', btidFilter);
    const evSnap = await evQ.limit(limit).get();

    const toFix: Array<{ id: string; data: Record<string, any>; correctDreamer: string; correctName: string }> = [];

    for (const doc of evSnap.docs) {
      scanned++;
      const d = doc.data();
      const tl  = String(d.termLabel ?? '').toLowerCase();
      if (termFilter && !tl.includes(termFilter)) continue;

      const scope = await resolveDreamerScope(db, {
        ownerUid,
        explicitDreamerId:   null,
        backtestDreamId:     String(d.backtestDreamId          ?? ''),
        dreamEntryId:        String(d.dreamEntryId             ?? ''),
        sourceDreamEntryId:  String(d.sourceDreamEntryId       ?? ''),
        activeWindowId:      String(d.activeWindowId           ?? ''),
      });

      if (scope.resolvedFrom === 'owner-self') continue;           // no source found — skip
      if (scope.dreamerId === 'owner-self') continue;               // same as stored — skip
      if (dreamerFilter && scope.dreamerId !== dreamerFilter) continue;

      repairsNeeded++;
      toFix.push({ id: doc.id, data: d, correctDreamer: scope.dreamerId, correctName: scope.dreamerName });
      if (examples.length < 5) {
        examples.push({ id: doc.id, storedDreamer: 'owner-self', correctDreamer: scope.dreamerId, resolvedFrom: scope.resolvedFrom, termLabel: d.termLabel });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true, dryRun: true, scanned, repairsNeeded,
        repairedEvents: 0, repairedMappings: 0, repairedDictRows: 0,
        skippedExisting: 0, examples,
        message: `Dry run complete. Set dryRun: false to apply ${repairsNeeded} repairs.`,
      });
    }

    // ── 2. Apply repairs ────────────────────────────────────────────────
    // Track canonical aggregate docs we need to rebuild (avoid double-increment)
    const pmToRebuild = new Map<string, { data: Record<string, any>; straight: number; boxed: number; count: number; lastDate: string }>();

    for (let i = 0; i < toFix.length; i += BATCH) {
      const bw = db.batch();
      for (const { id: oldId, data: d, correctDreamer, correctName } of toFix.slice(i, i + BATCH)) {

        const nt       = normalizeTerm(String(d.termLabel ?? ''));
        const num      = String(d.number ?? d.candidateNumber ?? '');
        const gt       = resolveGT(String(d.gameType ?? ''));
        const state    = String(d.state ?? '');
        const drawDate = String(d.drawDate ?? '');
        const drawTime = String(d.drawTime ?? '');
        const hitType  = String(d.hitType  ?? 'boxed');
        const btid     = String(d.backtestDreamId ?? '');
        const wid      = String(d.activeWindowId ?? d.sourceDreamEntryId ?? '');

        if (!num || !state || !gt) { skippedExisting++; continue; }

        // New canonical IDs under corrected dreamer
        const newEvId = canonicalEventId(ownerUid, correctDreamer, nt, num, gt, state, drawDate, drawTime, hitType, btid || wid);
        const newPmId = canonicalPmDocId(ownerUid, correctDreamer, nt, num, gt, state);

        // Write corrected personalHitEvent
        bw.set(db.collection('personalHitEvents').doc(newEvId), {
          ...d,
          dreamerId:   correctDreamer,
          dreamerName: correctName,
          _repairedAt:     now,
          _repairSource:   'dreamer-attribution-repair',
          _originalDocId:  oldId,
        }, { merge: true });

        // Mark old doc as misattributed (don't delete)
        bw.set(db.collection('personalHitEvents').doc(oldId), {
          _suspectedMisattributed: true,
          _repairedToDreamerId:    correctDreamer,
          _repairedAt:             now,
          _repairSource:           'dreamer-attribution-repair',
        }, { merge: true });

        repairedEvents++;

        // Track aggregate rebuild
        const pmKey = newPmId;
        if (!pmToRebuild.has(pmKey)) {
          pmToRebuild.set(pmKey, { data: { ...d, dreamerId: correctDreamer, dreamerName: correctName }, straight: 0, boxed: 0, count: 0, lastDate: '' });
        }
        const pm = pmToRebuild.get(pmKey)!;
        pm.count++;
        if (hitType === 'straight') pm.straight++; else pm.boxed++;
        if (drawDate > pm.lastDate) pm.lastDate = drawDate;
      }
      await bw.commit();
    }

    // ── 3. Upsert personalHitMappings (absolute, not increment) ─────────
    const pmList = Array.from(pmToRebuild.entries());
    for (let i = 0; i < pmList.length; i += BATCH) {
      const bw = db.batch();
      for (const [pmId, pm] of pmList.slice(i, i + BATCH)) {
        const d = pm.data;
        bw.set(db.collection('personalHitMappings').doc(pmId), {
          ownerUid, dreamerId: d.dreamerId, dreamerName: d.dreamerName,
          termLabel:     String(d.termLabel ?? ''),
          normalizedTerm:normalizeTerm(String(d.termLabel ?? '')),
          number:        String(d.number ?? ''),
          gameType:      resolveGT(String(d.gameType ?? '')),
          state:         String(d.state ?? ''),
          hitCount:      pm.count, straightCount: pm.straight, boxedCount: pm.boxed,
          stateStrengthScore: pm.straight * 3 + pm.boxed,
          lastHitDate:   pm.lastDate,
          source:        String(d.source ?? ''),
          backtestDreamId: String(d.backtestDreamId ?? ''),
          _rebuiltAt:    now,
          _repairSource: 'dreamer-attribution-repair',
          createdAt: now, updatedAt: now,
        }, { merge: true });
        repairedMappings++;
      }
      await bw.commit();
    }

    // ── 4. Repair dictionary rows ────────────────────────────────────────
    for (let i = 0; i < toFix.length; i += BATCH) {
      const bw = db.batch();
      for (const { data: d, correctDreamer, correctName } of toFix.slice(i, i + BATCH)) {
        const nt  = normalizeTerm(String(d.termLabel ?? ''));
        const num = String(d.number ?? d.candidateNumber ?? '');
        const gt  = resolveGT(String(d.gameType ?? ''));
        if (!nt || !num || !gt) continue;

        const dictId = canonicalDictDocId(ownerUid, correctDreamer, nt, num, gt);
        bw.set(db.collection('termNumberMappings').doc(dictId), {
          ownerUid, dreamerId: correctDreamer, dreamerName: correctName,
          termLabel:     String(d.termLabel ?? ''),
          normalizedTerm:nt, number: num, gameType: gt,
          source:        String(d.source ?? ''),
          backtestDreamId: String(d.backtestDreamId ?? ''),
          hasHit: true, hitCount: FieldValue.increment(0),  // merge only
          _repairedAt: now,
          createdAt: now, updatedAt: now,
        }, { merge: true });
        repairedDictRows++;
      }
      await bw.commit();
    }

    return NextResponse.json({
      ok: true, dryRun: false, scanned, repairsNeeded,
      repairedEvents, repairedMappings, repairedDictRows, skippedExisting, examples,
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Repair failed.' },
      { status: 500 }
    );
  }
}
