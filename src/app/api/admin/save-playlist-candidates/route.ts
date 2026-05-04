/**
 * POST /api/admin/save-playlist-candidates
 *
 * Persists the current State Playlist candidates for an ownerUid.
 * Called when user clicks "Save Playlist Snapshot" on the playlists page.
 *
 * Also cross-references existing personalHitEvents against these candidates
 * and writes statePlaylistHits for any confirmed matches.
 *
 * IDEMPOTENCY: Candidate doc ID includes snapshotDate so daily snapshots
 * don't overwrite each other. Running twice same day is safe (merge:true).
 *
 * Inputs:
 *   ownerUid   required
 *   candidates optional array — if omitted, route reads active windows to build candidates
 *   limit      optional, max 500
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp }                 from 'firebase-admin/firestore';
import { getAdminDb }                from '@/lib/firebase/admin';
import {
  canonicalPmDocId, normalizeTerm as normT, classifyHit,
} from '@/lib/intelligence/hitClassification';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function safeId(v: unknown): string {
  return String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function candidateDocId(ownerUid: string, dreamerId: string, normalizedTerm: string,
                        number: string, gameType: string, state: string, snapshotDate: string): string {
  return [ownerUid, dreamerId, normalizedTerm, number, gameType, state, snapshotDate].map(safeId).join('__');
}

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}));
    const ownerUid = String(body?.ownerUid ?? '').trim();
    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid is required.' }, { status: 400 });
    }

    const db           = getAdminDb();
    const now          = Timestamp.now();
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const BATCH        = 400;

    // ── 1. Build candidates from active windows ───────────────────────────────
    const winSnap = await db.collection('activeDreamWindows')
      .where('ownerUid', '==', ownerUid)
      .limit(200).get();

    const candidates: Array<{ id: string; data: Record<string, any> }> = [];

    for (const doc of winSnap.docs) {
      const w          = doc.data();
      const dreamerId  = String(w.dreamerId  ?? 'owner-self');
      const dreamerName= String(w.dreamerName ?? '');
      const termLabel  = String(w.termLabel   ?? '');
      const number     = String(w.number      ?? '');
      const gameType   = (() => {
        const raw = String(w.gameType ?? w.game_type ?? '');
        if (raw === 'pick3') return 'cash3';
        if (raw === 'pick4') return 'cash4';
        return raw;
      })();
      const activeEnd  = String(w.activeEnd   ?? '');

      if (!termLabel || !number || !gameType) continue;

      const nt    = normT(termLabel);
      // State Playlists project candidates across all states for the gameType
      // We record one candidate per (ownerUid, dreamer, term, number, gameType, state='ALL')
      const candId = candidateDocId(ownerUid, dreamerId, nt, number, gameType, 'ALL', snapshotDate);

      candidates.push({ id: candId, data: {
        ownerUid,
        dreamerId,
        dreamerName,
        termLabel,
        normalizedTerm:   nt,
        number,
        gameType,
        state:            'ALL',  // playlist candidates cover all states
        source:           'state-playlist',
        activeWindowId:   doc.id,
        activeWindowStart:String(w.activeStart ?? ''),
        activeWindowEnd:  activeEnd,
        snapshotDate,
        createdAt:        now,
        updatedAt:        now,
      }});
    }

    // Write candidates in batches
    let candidatesSaved = 0;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const bw = db.batch();
      for (const { id, data } of candidates.slice(i, i + BATCH)) {
        bw.set(db.collection('statePlaylistCandidates').doc(id), data, { merge: true });
      }
      await bw.commit();
      candidatesSaved += candidates.slice(i, i + BATCH).length;
    }

    // ── 2. Check personalHitEvents against these candidates ──────────────────
    // A playlist hit exists when a personalHitEvent number+gameType matches a candidate
    const evSnap = await db.collection('personalHitEvents')
      .where('ownerUid', '==', ownerUid)
      .limit(500).get();

    const candidateNums = new Set(
      candidates.map(c => `${c.data.number}::${c.data.gameType}`)
    );

    const playlistHitsToWrite: Array<{ id: string; data: Record<string, any> }> = [];

    for (const evDoc of evSnap.docs) {
      const ev   = evDoc.data();
      const num  = String(ev.number ?? ev.candidateNumber ?? '');
      const gt   = String(ev.gameType ?? '');
      const key  = `${num}::${gt}`;
      if (!candidateNums.has(key)) continue;

      const phId = [ownerUid, String(ev.dreamerId ?? 'owner-self'), normT(String(ev.termLabel ?? '')),
                    num, gt, String(ev.state ?? ''), String(ev.drawDate ?? ''), String(ev.drawTime ?? '')]
                    .map(safeId).join('__');

      playlistHitsToWrite.push({ id: phId, data: {
        ownerUid,
        dreamerId:     String(ev.dreamerId   ?? 'owner-self'),
        dreamerName:   String(ev.dreamerName ?? ''),
        termLabel:     String(ev.termLabel   ?? ''),
        normalizedTerm:normT(String(ev.termLabel ?? '')),
        number:        num,
        winningNumber: String(ev.winningNumber ?? ''),
        state:         String(ev.state  ?? ''),
        gameType:      gt,
        drawDate:      String(ev.drawDate ?? ''),
        drawTime:      String(ev.drawTime ?? ''),
        hitType:       String(ev.hitType  ?? ''),
        matchMode:     String(ev.hitType  ?? ''),
        source:        'state-playlist',
        sourceHitId:   evDoc.id,
        snapshotDate,
        createdAt:     now,
      }});
    }

    let hitsFound = 0;
    for (let i = 0; i < playlistHitsToWrite.length; i += BATCH) {
      const bw = db.batch();
      for (const { id, data } of playlistHitsToWrite.slice(i, i + BATCH)) {
        bw.set(db.collection('statePlaylistHits').doc(id), data, { merge: true });
      }
      await bw.commit();
      hitsFound += playlistHitsToWrite.slice(i, i + BATCH).length;
    }

    return NextResponse.json({ ok: true, candidatesSaved, hitsFound, snapshotDate });
  } catch (err) {
    console.error('[save-playlist-candidates]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed.' },
      { status: 500 }
    );
  }
}
