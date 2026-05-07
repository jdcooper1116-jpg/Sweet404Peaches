/**
 * POST /api/admin/repair-dreamer-attribution
 *
 * Resolves correct dreamer from source documents, rewrites misattributed rows.
 *
 * PREVIOUS BUG (repairsNeeded: 0):
 *   Scanned personalHitEvents.where(dreamerId=owner-self).limit(200).
 *   With 356+ owner-self rows, Sunshine\'s rows sat beyond position 200.
 *
 * FIX — per-backtestDream iteration:
 *   Query each collection per backtestDreamId. For each row, resolve expected
 *   dreamer from the backtestDream source. This finds all rows regardless of
 *   total collection size.
 *
 * Body:
 *   ownerUid        required
 *   backtestDreamId optional — repair one dream only (recommended first pass)
 *   dreamerId       optional — only repair rows expected under this dreamer
 *   term            optional — filter by termLabel
 *   dryRun          boolean, default true  ← ALWAYS DRY RUN FIRST
 *   limit           per-query cap, default 500, max 2000
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp }     from 'firebase-admin/firestore';
import { getAdminDb }                from '@/lib/firebase/admin';
import {
  canonicalPmDocId, canonicalEventId, normalizeTerm,
  canonicalDictDocId,
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
    const ownerUid      = String(body?.ownerUid        ?? '').trim();
    const btidFilter    = String(body?.backtestDreamId ?? '').trim();
    const didFilter     = String(body?.dreamerId       ?? '').trim();
    const termFilter    = String(body?.term            ?? '').trim().toLowerCase();
    const dryRun        = body?.dryRun !== false;
    const perQueryLimit = Math.min(Number(body?.limit  ?? 500), 2000);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid required.' }, { status: 400 });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();
    const BATCH = 400;

    // ── 1. Load backtestDreams as source-of-truth ─────────────────────────
    const bdMap = new Map<string, { dreamerId: string; dreamerName: string }>();
    let bdQ: any = db.collection('backtestDreams').where('ownerUid', '==', ownerUid);
    if (btidFilter) bdQ = bdQ.where('__name__', '==', btidFilter).limit(1);
    else            bdQ = bdQ.limit(200);
    const bdSnap = await bdQ.get();
    for (const doc of bdSnap.docs) {
      bdMap.set(doc.id, {
        dreamerId:   String(doc.data().dreamerId   ?? ''),
        dreamerName: String(doc.data().dreamerName ?? ''),
      });
    }

    if (bdMap.size === 0) {
      return NextResponse.json({ ok: false, error: 'No backtestDreams found for this ownerUid.' }, { status: 404 });
    }

    // ── 2. Collect all misattributed rows per-dream ───────────────────────
    // This is the fix: instead of scanning all rows with flat limit,
    // we query per-backtestDreamId for each known dream.
    type MisRow = {
      id: string; col: string; data: Record<string, any>;
      correctDid: string; correctName: string; btid: string;
    };
    const toFix: MisRow[] = [];
    const examples: any[] = [];

    async function collectMisattributed(col: string) {
      const seen = new Set<string>();
      const btids = btidFilter ? [btidFilter] : Array.from(bdMap.keys());

      await Promise.allSettled(btids.map(async btid => {
        const src = bdMap.get(btid);
        if (!src || !src.dreamerId || src.dreamerId === 'owner-self') return;
        if (didFilter && src.dreamerId !== didFilter) return;

        try {
          const snap = await db.collection(col)
            .where('ownerUid',       '==', ownerUid)
            .where('backtestDreamId','==', btid)
            .limit(perQueryLimit).get();

          for (const doc of snap.docs) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);

            const d = doc.data();
            if (d._deprecated || d._suspectedMisattributed) continue;

            const tl = String(d.termLabel ?? '').toLowerCase();
            if (termFilter && !tl.includes(termFilter)) continue;

            const storedDid = String(d.dreamerId ?? '');
            if (storedDid === src.dreamerId) continue;  // already correct

            const num = String(d.number ?? d.candidateNumber ?? '').trim();
            toFix.push({ id: doc.id, col, data: d, correctDid: src.dreamerId, correctName: src.dreamerName, btid });
            if (examples.length < 20) {
              examples.push({
                collection:           col,
                oldDocId:             doc.id,
                oldDreamerId:         storedDid || '(empty)',
                expectedDreamerId:    src.dreamerId,
                expectedDreamerName:  src.dreamerName,
                backtestDreamId:      btid,
                dreamEntryId:         String(d.sourceDreamEntryId ?? d.dreamEntryId ?? ''),
                activeWindowId:       String(d.activeWindowId ?? ''),
                termLabel:            String(d.termLabel ?? ''),
                number:               num,
                state:                String(d.state    ?? ''),
                gameType:             String(d.gameType ?? ''),
                plannedNewDocId:      (() => {
                  const nt = normalizeTerm(String(d.termLabel ?? ''));
                  const gt = resolveGT(String(d.gameType ?? ''));
                  const state = String(d.state ?? '');
                  if (col === 'personalHitEvents') {
                    const drawDate = String(d.drawDate ?? '');
                    const drawTime = String(d.drawTime ?? '');
                    const hitType  = String(d.hitType  ?? 'boxed');
                    return canonicalEventId(ownerUid, src.dreamerId, nt, num, gt, state, drawDate, drawTime, hitType, btid);
                  }
                  if (col === 'personalHitMappings') return canonicalPmDocId(ownerUid, src.dreamerId, nt, num, gt, state);
                  return `(${col} — no canonical ID defined)`;
                })(),
              });
            }
          }
        } catch { /* non-fatal — index may not exist */ }
      }));
    }

    await Promise.allSettled([
      collectMisattributed('backtestHits'),
      collectMisattributed('personalHitEvents'),
      collectMisattributed('personalHitMappings'),
    ]);

    const repairsNeeded = toFix.length;

    if (dryRun || repairsNeeded === 0) {
      return NextResponse.json({
        ok: true, dryRun: true, repairsNeeded, examples,
        scanned: { backtestDreams: bdSnap.size },
        message: repairsNeeded === 0
          ? 'No misattributed rows found.'
          : `Dry run: ${repairsNeeded} rows need repair. Set dryRun: false to apply.`,
      });
    }

    // ── 3. Apply repair ───────────────────────────────────────────────────
    let repairedEvents = 0, repairedMappings = 0, repairedDictRows = 0;

    // Aggregate event counts for personalHitMappings rebuild
    const pmGroups = new Map<string, {
      correctDid: string; correctName: string; data: Record<string, any>;
      count: number; straight: number; boxed: number; lastDate: string;
    }>();

    // Batch write corrections for personalHitEvents and backtestHits
    const evRows = toFix.filter(r => r.col === 'personalHitEvents' || r.col === 'backtestHits');
    for (let i = 0; i < evRows.length; i += BATCH) {
      const bw = db.batch();
      for (const { id: oldId, col, data: d, correctDid, correctName, btid } of evRows.slice(i, i + BATCH)) {
        const nt       = normalizeTerm(String(d.termLabel ?? ''));
        const num      = String(d.number ?? d.candidateNumber ?? '').trim();
        const gt       = resolveGT(String(d.gameType ?? ''));
        const state    = String(d.state     ?? '');
        const drawDate = String(d.drawDate  ?? '');
        const drawTime = String(d.drawTime  ?? '');
        const hitType  = String(d.hitType   ?? 'boxed');
        if (!num) continue;

        // Mark old row
        bw.set(db.collection(col).doc(oldId), {
          _suspectedMisattributed:  true,
          _repairedToDreamerId:     correctDid,
          _repairedToDreamerName:   correctName,
          _repairedAt:              now,
          _repairSource:            'dreamer-attribution-repair',
        }, { merge: true });

        if (col === 'personalHitEvents') {
          // Write corrected event
          const newEvId = canonicalEventId(ownerUid, correctDid, nt, num, gt, state, drawDate, drawTime, hitType, btid);
          bw.set(db.collection('personalHitEvents').doc(newEvId), {
            ...d, dreamerId: correctDid, dreamerName: correctName,
            _repairedAt: now, _repairSource: 'dreamer-attribution-repair', _originalDocId: oldId,
          }, { merge: true });

          // Track for aggregate rebuild
          const pmId = canonicalPmDocId(ownerUid, correctDid, nt, num, gt, state);
          if (!pmGroups.has(pmId)) {
            pmGroups.set(pmId, { correctDid, correctName, data: { ...d, dreamerId: correctDid, dreamerName: correctName }, count: 0, straight: 0, boxed: 0, lastDate: '' });
          }
          const pm = pmGroups.get(pmId)!;
          pm.count++;
          if (hitType === 'straight') pm.straight++; else pm.boxed++;
          if (drawDate > pm.lastDate) pm.lastDate = drawDate;

          repairedEvents++;
        }
      }
      await bw.commit();
    }

    // Rebuild personalHitMappings (absolute values from event ledger — never uses increment)
    const pmList = Array.from(pmGroups.entries());
    for (let i = 0; i < pmList.length; i += BATCH) {
      const bw = db.batch();
      for (const [pmId, pm] of pmList.slice(i, i + BATCH)) {
        const d = pm.data;
        bw.set(db.collection('personalHitMappings').doc(pmId), {
          ownerUid,
          dreamerId:        pm.correctDid,
          dreamerName:      pm.correctName,
          termLabel:        String(d.termLabel ?? ''),
          normalizedTerm:   normalizeTerm(String(d.termLabel ?? '')),
          number:           String(d.number ?? ''),
          gameType:         resolveGT(String(d.gameType ?? '')),
          state:            String(d.state   ?? ''),
          hitCount:         pm.count,
          straightCount:    pm.straight,
          boxedCount:       pm.boxed,
          stateStrengthScore: pm.straight * 3 + pm.boxed,
          lastHitDate:      pm.lastDate,
          source:           String(d.source ?? 'backtest-replay'),
          backtestDreamId:  String(d.backtestDreamId ?? ''),
          _rebuiltAt:       now,
          _repairSource:    'dreamer-attribution-repair',
          updatedAt:        now,
        }, { merge: true });
        repairedMappings++;
      }
      await bw.commit();
    }

    // ── Shadow old misattributed personalHitMappings rows ──────────────────
    // These were under owner-self but belong to another dreamer.
    // We built the correct canonical pm docs above from event truth.
    // Now mark the old ones as shadowed so fell-before excludes them.
    const pmRows = toFix.filter(r => r.col === 'personalHitMappings');
    for (let i = 0; i < pmRows.length; i += BATCH) {
      const bw = db.batch();
      for (const { id: oldId, data: d, correctDid, correctName } of pmRows.slice(i, i + BATCH)) {
        const nt    = normalizeTerm(String(d.termLabel ?? ''));
        const num   = String(d.number ?? d.candidateNumber ?? '').trim();
        const gt    = resolveGT(String(d.gameType ?? ''));
        const state = String(d.state ?? '');
        const correctedPmId = canonicalPmDocId(ownerUid, correctDid, nt, num, gt, state);

        bw.set(db.collection('personalHitMappings').doc(oldId), {
          _suspectedMisattributed:      true,
          _shadowedByCorrectedMapping:  true,
          _correctedMappingDocId:       correctedPmId,
          _repairedToDreamerId:         correctDid,
          _repairedToDreamerName:       correctName,
          _shadowedAt:                  now,
          _repairedAt:                  now,
          _repairSource:                'dreamer-attribution-repair',
        }, { merge: true });
        repairedMappings++;
      }
      await bw.commit();
    }

    // Repair dictionary rows
    const dictRows = toFix.filter(r => r.col === 'personalHitEvents');
    for (let i = 0; i < dictRows.length; i += BATCH) {
      const bw = db.batch();
      for (const { data: d, correctDid, correctName, btid } of dictRows.slice(i, i + BATCH)) {
        const nt  = normalizeTerm(String(d.termLabel ?? ''));
        const num = String(d.number ?? d.candidateNumber ?? '').trim();
        const gt  = resolveGT(String(d.gameType ?? ''));
        if (!nt || !num) continue;
        const dictId = canonicalDictDocId(ownerUid, correctDid, nt, num, gt);
        bw.set(db.collection('termNumberMappings').doc(dictId), {
          ownerUid, dreamerId: correctDid, dreamerName: correctName,
          termLabel:     String(d.termLabel ?? ''),
          normalizedTerm:nt, number: num, gameType: gt,
          source:        'backtest-replay', backtestDreamId: btid,
          hasHit: true, updatedAt: now, createdAt: now,
        }, { merge: true });
        repairedDictRows++;
      }
      await bw.commit();
    }

    return NextResponse.json({
      ok: true, dryRun: false, repairsNeeded,
      repairedEvents, repairedMappings, repairedDictRows,
      examples: examples.slice(0, 5),
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Repair failed.' },
      { status: 500 }
    );
  }
}
