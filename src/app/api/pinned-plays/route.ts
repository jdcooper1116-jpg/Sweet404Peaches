/**
 * GET   /api/pinned-plays?ownerUid=...&playDate=...&status=...&dreamerScope=...
 * PATCH /api/pinned-plays  { ownerUid, pinnedPlayId, status?, notes?, playDate? }
 *
 * Server-side Firebase Admin read/write for pinnedPlays collection.
 * Replaces listPinnedPlays() / updatePinnedPlay() client Firestore calls.
 *
 * GET supports optional filters:
 *   playDate      — ISO date string, filters to exact date
 *   status        — "pinned" | "played" | "won" | "archived"
 *   dreamerScope  — dreamer name or "ALL"
 *   limit         — default 500
 *
 * PATCH updates status, notes, and/or playDate on an existing pinned play.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const params       = req.nextUrl.searchParams;
    const ownerUid     = resolveOwnerUid(params.get('ownerUid'));
    const playDate     = params.get('playDate')     ?? '';
    const status       = params.get('status')       ?? '';
    const dreamerScope = params.get('dreamerScope') ?? '';
    const maxRows      = Math.min(Number(params.get('limit') ?? 500), 2000);

    const db = getAdminDb();

    let query = db
      .collection('pinnedPlays')
      .where('ownerUid', '==', ownerUid);

    if (playDate)     query = query.where('playDate',     '==', playDate)     as any;
    if (status)       query = query.where('status',       '==', status)       as any;
    if (dreamerScope && dreamerScope !== 'ALL') {
      query = query.where('dreamerScope', '==', dreamerScope) as any;
    }

    const snap = await (query as any).limit(maxRows).get();

    const plays = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? null,
      };
    });

    // Sort by playDate desc, then score desc
    plays.sort((a: any, b: any) => {
      const dateA = String(a.playDate ?? '');
      const dateB = String(b.playDate ?? '');
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });

    return NextResponse.json({ ok: true, plays, count: plays.length });
  } catch (err) {
    console.error('[api/pinned-plays GET] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load pinned plays.' },
      { status: 500 }
    );
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid     = String(body.ownerUid     || '').trim();
    const pinnedPlayId = String(body.pinnedPlayId  || '').trim();

    if (!ownerUid)     return NextResponse.json({ ok: false, error: 'ownerUid is required.'     }, { status: 400 });
    if (!pinnedPlayId) return NextResponse.json({ ok: false, error: 'pinnedPlayId is required.' }, { status: 400 });

    const db  = getAdminDb();
    const ref = db.collection('pinnedPlays').doc(pinnedPlayId);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ ok: false, error: 'Pinned play not found.' }, { status: 404 });
    }

    if (doc.data()?.ownerUid !== ownerUid) {
      return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updatedAt: Timestamp.now() };

    if (body.status   !== undefined) patch.status   = String(body.status);
    if (body.notes    !== undefined) patch.notes     = String(body.notes);
    if (body.playDate !== undefined) patch.playDate  = String(body.playDate);

    await ref.update(patch);

    return NextResponse.json({ ok: true, pinnedPlayId, updated: patch });
  } catch (err) {
    console.error('[api/pinned-plays PATCH] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to update pinned play.' },
      { status: 500 }
    );
  }
}
