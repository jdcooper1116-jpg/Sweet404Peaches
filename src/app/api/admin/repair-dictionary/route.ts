/**
 * POST /api/admin/repair-dictionary
 *
 * Rebuilds termNumberMappings (Universal Dictionary) from:
 *   1. dreamEntries.termMappings (live dreams)
 *   2. backtestDreams.parseResult.termMappings (backtest dreams)
 *   3. personalHitMappings (as fallback — term/number hit memory)
 *
 * Canonical dict doc ID:
 *   ownerUid__dreamerId__normalizedTerm__number__gameType
 *
 * Preserves leading zeros. Uses merge:true — idempotent.
 *
 * Body:
 *   ownerUid    required
 *   dreamerId   optional — rebuild only for this dreamer
 *   dryRun      boolean, default true
 *   limit       max dream entries to scan, default 100
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp }                 from 'firebase-admin/firestore';
import { getAdminDb }                from '@/lib/firebase/admin';
import {
  canonicalDictDocId, normalizeTerm,
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
    const ownerUid      = String(body?.ownerUid  ?? '').trim();
    const dreamerFilter = String(body?.dreamerId  ?? '').trim();
    const dryRun        = body?.dryRun !== false;
    const limit         = Math.min(Number(body?.limit ?? 100), 300);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid required.' }, { status: 400 });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();
    const BATCH = 400;

    // Collect: dictId → row data
    const toWrite = new Map<string, Record<string, any>>();
    let scanned = 0;

    // Helper to emit a dictionary row
    function emit(dreamerId: string, dreamerName: string, termLabel: string,
                  number: string, gameType: string, extras: Record<string, any> = {}) {
      if (!termLabel || !number || !gameType) return;
      const nt    = normalizeTerm(termLabel);
      const gt    = resolveGT(gameType);
      const num   = String(number).trim();
      if (!nt || !num) return;
      const dictId = canonicalDictDocId(ownerUid, dreamerId, nt, num, gt);
      if (!toWrite.has(dictId)) {
        toWrite.set(dictId, {
          ownerUid, dreamerId, dreamerName,
          termLabel: termLabel.trim(), normalizedTerm: nt,
          number: num, gameType: gt,
          hasHit: false, hitCount: 0,
          ...extras,
          createdAt: now, updatedAt: now,
        });
      }
    }

    // ── Source 1: dreamEntries ───────────────────────────────────────────
    let deQ: any = db.collection('dreamEntries').where('ownerUid', '==', ownerUid);
    if (dreamerFilter) deQ = deQ.where('dreamerId', '==', dreamerFilter);
    const deSnap = await deQ.limit(limit).get();
    scanned += deSnap.size;

    for (const doc of deSnap.docs) {
      const d = doc.data();
      const dreamerId  = String(d.dreamerId  ?? 'owner-self');
      const dreamerName= String(d.dreamerName ?? '');
      const termMaps   = Array.isArray(d.termMappings) ? d.termMappings
                       : Array.isArray(d.parseResult?.termMappings) ? d.parseResult.termMappings
                       : [];

      for (const tm of termMaps) {
        const tl = String(tm.term ?? tm.termLabel ?? '');
        for (const num of (tm.cash3Numbers ?? [])) {
          emit(dreamerId, dreamerName, tl, num, 'cash3', {
            source: 'live-dream', dreamEntryId: doc.id, dreamDate: String(d.dreamDate ?? ''),
          });
        }
        for (const num of (tm.cash4Numbers ?? [])) {
          emit(dreamerId, dreamerName, tl, num, 'cash4', {
            source: 'live-dream', dreamEntryId: doc.id, dreamDate: String(d.dreamDate ?? ''),
          });
        }
      }
    }

    // ── Source 2: backtestDreams ─────────────────────────────────────────
    let bdQ: any = db.collection('backtestDreams').where('ownerUid', '==', ownerUid);
    if (dreamerFilter) bdQ = bdQ.where('dreamerId', '==', dreamerFilter);
    const bdSnap = await bdQ.limit(limit).get();
    scanned += bdSnap.size;

    for (const doc of bdSnap.docs) {
      const d = doc.data();
      const dreamerId  = String(d.dreamerId  ?? 'owner-self');
      const dreamerName= String(d.dreamerName ?? '');
      const termMaps   = Array.isArray(d.termMappings) ? d.termMappings
                       : Array.isArray(d.parseResult?.termMappings) ? d.parseResult.termMappings
                       : Array.isArray(d.parsedTermMappings) ? d.parsedTermMappings
                       : [];

      for (const tm of termMaps) {
        const tl = String(tm.term ?? tm.termLabel ?? '');
        for (const num of (tm.cash3Numbers ?? [])) {
          emit(dreamerId, dreamerName, tl, num, 'cash3', {
            source: 'backtest-replay', backtestDreamId: doc.id, dreamDate: String(d.dreamDate ?? ''),
          });
        }
        for (const num of (tm.cash4Numbers ?? [])) {
          emit(dreamerId, dreamerName, tl, num, 'cash4', {
            source: 'backtest-replay', backtestDreamId: doc.id, dreamDate: String(d.dreamDate ?? ''),
          });
        }
      }
    }

    // ── Source 3: personalHitMappings (fallback for hit-memory-only terms) ──
    let pmQ: any = db.collection('personalHitMappings').where('ownerUid', '==', ownerUid);
    if (dreamerFilter) pmQ = pmQ.where('dreamerId', '==', dreamerFilter);
    const pmSnap = await pmQ.limit(200).get();
    for (const doc of pmSnap.docs) {
      const d = doc.data();
      if (d._deprecated) continue;
      const dreamerId  = String(d.dreamerId  ?? 'owner-self');
      const dreamerName= String(d.dreamerName ?? '');
      emit(dreamerId, dreamerName, String(d.termLabel ?? ''), String(d.number ?? ''), String(d.gameType ?? ''), {
        source:  String(d.source ?? ''),
        hasHit:  true,
        hitCount:Number(d.hitCount ?? 1),
        backtestDreamId: String(d.backtestDreamId ?? ''),
      });
    }

    const totalRows = toWrite.size;

    if (dryRun) {
      return NextResponse.json({
        ok: true, dryRun: true, scanned, totalRows,
        dreamerCount: new Set([...toWrite.values()].map(r => r.dreamerId)).size,
        termCount: new Set([...toWrite.values()].map(r => r.normalizedTerm)).size,
        message: `Dry run: would write ${totalRows} dictionary rows. Set dryRun: false to apply.`,
        sampleRows: [...toWrite.values()].slice(0, 5),
      });
    }

    // Write in batches
    let written = 0;
    const entries = Array.from(toWrite.entries());
    for (let i = 0; i < entries.length; i += BATCH) {
      const bw = db.batch();
      for (const [dictId, row] of entries.slice(i, i + BATCH)) {
        bw.set(db.collection('termNumberMappings').doc(dictId), row, { merge: true });
      }
      await bw.commit();
      written += entries.slice(i, i + BATCH).length;
    }

    return NextResponse.json({
      ok: true, dryRun: false, scanned, totalRows, written,
      dreamerCount: new Set([...toWrite.values()].map(r => r.dreamerId)).size,
      termCount: new Set([...toWrite.values()].map(r => r.normalizedTerm)).size,
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Repair failed.' },
      { status: 500 }
    );
  }
}
