/**
 * GET /api/admin/playlist-hits
 *
 * Returns recent statePlaylistHits for an ownerUid.
 * Called by the State Playlists page to populate the "Recent Playlist Hits" panel.
 *
 * ---
 *
 * POST /api/admin/repair-playlist-hits
 *
 * Backfills statePlaylistHits by cross-referencing personalHitEvents
 * against statePlaylistCandidates.
 *
 * If no statePlaylistCandidates exist yet, returns a friendly message.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDreamDbProvider } from '@/lib/storage/provider';
import { Timestamp }                 from 'firebase-admin/firestore';
import { getAdminDb }                from '@/lib/firebase/admin';
import { normalizeTerm as normT }    from '@/lib/intelligence/hitClassification';

export const dynamic = 'force-dynamic';

function safeId(v: unknown): string {
  return String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── GET handler (read recent playlist hits) ──────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const params   = req.nextUrl.searchParams;
    const ownerUid = String(params.get('ownerUid') ?? '').trim();
    const limit    = Math.min(Number(params.get('limit') ?? 50), 200);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid required.', hits: [] }, { status: 400 });
    }

    // ── Postgres branch ────────────────────────────────────────────────────────
    // Suppresses stale Firebase statePlaylistHits (celebrity/boat/beg test rows).
    // Postgres playlist hits will be implemented in E2B.
    if (getDreamDbProvider() === 'postgres') {
      return NextResponse.json({
        ok: true, provider: 'postgres', hits: [], count: 0,
        message: 'Postgres playlist hits are not persisted yet; stale Firebase playlist hits suppressed.',
      });
    }

    // ── Firebase branch (unchanged) ────────────────────────────────────────────
    const db   = getAdminDb();
    const snap = await db.collection('statePlaylistHits')
      .where('ownerUid', '==', ownerUid)
      .limit(limit).get();

    const hits = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Sort by drawDate desc in memory
    hits.sort((a: any, b: any) =>
      String(b.drawDate ?? '').localeCompare(String(a.drawDate ?? ''))
    );

    return NextResponse.json({ ok: true, hits, count: hits.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, hits: [], error: err instanceof Error ? err.message : 'Failed.' },
      { status: 500 }
    );
  }
}

// ── POST handler (repair / backfill) ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}));
    const ownerUid = String(body?.ownerUid ?? '').trim();
    const repair   = Boolean(body?.repair ?? true);
    const limit    = Math.min(Number(body?.limit ?? 500), 1000);

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid required.' }, { status: 400 });
    }

    if (getDreamDbProvider() === 'postgres') {
      return NextResponse.json({
        ok: true, provider: 'postgres', hitsFound: 0, hitsSkipped: 0, repairRan: false,
        message: 'Postgres playlist repair not implemented yet; suppressed in Postgres mode.',
      });
    }

    const db  = getAdminDb();
    const now = Timestamp.now();

    // Check if any statePlaylistCandidates exist
    const candSnap = await db.collection('statePlaylistCandidates')
      .where('ownerUid', '==', ownerUid)
      .limit(1).get();

    if (candSnap.empty) {
      return NextResponse.json({
        ok: true,
        message: 'No persisted playlist candidates found. Playlist attribution begins after next playlist snapshot.',
        hitsFound: 0,
        hitsSkipped: 0,
      });
    }

    // Load all candidates
    const allCandSnap = await db.collection('statePlaylistCandidates')
      .where('ownerUid', '==', ownerUid)
      .limit(limit).get();

    const candidateNums = new Set(
      allCandSnap.docs.map(d => {
        const data = d.data();
        return `${String(data.number ?? '')}::${String(data.gameType ?? '')}`;
      })
    );

    // Load personalHitEvents
    const evSnap = await db.collection('personalHitEvents')
      .where('ownerUid', '==', ownerUid)
      .limit(limit).get();

    // Load existing statePlaylistHits to avoid duplicates
    const existingHitsSnap = await db.collection('statePlaylistHits')
      .where('ownerUid', '==', ownerUid)
      .limit(limit).get();
    const existingHitIds = new Set(existingHitsSnap.docs.map(d => d.id));

    const toWrite: Array<{ id: string; data: Record<string, any> }> = [];
    let   hitsSkipped = 0;

    for (const evDoc of evSnap.docs) {
      const ev  = evDoc.data();
      const num = String(ev.number ?? ev.candidateNumber ?? '');
      const gt  = String(ev.gameType ?? '');
      if (!candidateNums.has(`${num}::${gt}`)) continue;

      const phId = [
        ownerUid,
        String(ev.dreamerId ?? 'owner-self'),
        normT(String(ev.termLabel ?? '')),
        num, gt,
        String(ev.state ?? ''),
        String(ev.drawDate ?? ''),
        String(ev.drawTime ?? ''),
      ].map(safeId).join('__');

      if (existingHitIds.has(phId)) { hitsSkipped++; continue; }

      toWrite.push({ id: phId, data: {
        ownerUid,
        dreamerId:     String(ev.dreamerId   ?? 'owner-self'),
        dreamerName:   String(ev.dreamerName ?? ''),
        termLabel:     String(ev.termLabel   ?? ''),
        normalizedTerm:normT(String(ev.termLabel ?? '')),
        number:        num,
        winningNumber: String(ev.winningNumber ?? ''),
        state:         String(ev.state   ?? ''),
        gameType:      gt,
        drawDate:      String(ev.drawDate ?? ''),
        drawTime:      String(ev.drawTime ?? ''),
        hitType:       String(ev.hitType  ?? ''),
        matchMode:     String(ev.hitType  ?? ''),
        source:        'state-playlist',
        sourceHitId:   evDoc.id,
        createdAt:     now,
      }});
    }

    let hitsFound = 0;
    if (repair && toWrite.length > 0) {
      const BATCH = 400;
      for (let i = 0; i < toWrite.length; i += BATCH) {
        const bw = db.batch();
        for (const { id, data } of toWrite.slice(i, i + BATCH)) {
          bw.set(db.collection('statePlaylistHits').doc(id), data, { merge: true });
        }
        await bw.commit();
        hitsFound += toWrite.slice(i, i + BATCH).length;
      }
    } else {
      hitsFound = toWrite.length;  // dry run
    }

    return NextResponse.json({
      ok: true,
      candidatesScanned: allCandSnap.size,
      eventsScanned:     evSnap.size,
      hitsFound,
      hitsSkipped,
      repairRan:         repair,
    });
  } catch (err) {
    console.error('[repair-playlist-hits]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Repair failed.' },
      { status: 500 }
    );
  }
}
