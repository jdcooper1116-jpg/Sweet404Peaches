/**
 * GET  /api/dreamers?ownerUid=...
 * POST /api/dreamers  { ownerUid, displayName, alias?, preferredStates, preferredGames,
 *                       preferredDrawTimes, isGuest, notes? }
 *
 * Server-side Firebase Admin read/write for dreamers collection.
 * Replaces listDreamers() / createDreamer() client Firestore calls.
 *
 * GET returns all dreamers for the owner sorted alphabetically.
 * POST creates a new dreamer and returns the new dreamerId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ownerUid = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const db = getAdminDb();

    const snap = await db
      .collection('dreamers')
      .where('ownerUid', '==', ownerUid)
      .get();

    const dreamers = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? null,
      };
    });

    dreamers.sort((a: any, b: any) =>
      String(a.displayName ?? '').localeCompare(String(b.displayName ?? ''))
    );

    return NextResponse.json({ ok: true, dreamers, count: dreamers.length });
  } catch (err) {
    console.error('[api/dreamers GET] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dreamers.' },
      { status: 500 }
    );
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid        = String(body.ownerUid        || '').trim();
    const displayName     = String(body.displayName     || '').trim();
    const alias           = String(body.alias           || '').trim() || null;
    const preferredStates = Array.isArray(body.preferredStates)
      ? body.preferredStates.map(String)
      : ['GA'];
    const preferredGames  = Array.isArray(body.preferredGames)
      ? body.preferredGames.map(String)
      : ['cash3', 'cash4'];
    const preferredDrawTimes = Array.isArray(body.preferredDrawTimes)
      ? body.preferredDrawTimes.map(String)
      : ['midday', 'evening', 'night'];
    const isGuest = Boolean(body.isGuest ?? false);
    const notes   = String(body.notes ?? '').trim();

    if (!ownerUid)    return NextResponse.json({ ok: false, error: 'ownerUid is required.'    }, { status: 400 });
    if (!displayName) return NextResponse.json({ ok: false, error: 'displayName is required.' }, { status: 400 });

    const db  = getAdminDb();
    const now = Timestamp.now();

    const payload: Record<string, unknown> = {
      ownerUid,
      displayName,
      preferredStates,
      preferredGames,
      preferredDrawTimes,
      isGuest,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    if (alias) payload.alias = alias;

    const ref = await db.collection('dreamers').add(payload);

    return NextResponse.json({
      ok:        true,
      dreamerId: ref.id,
      dreamer:   { id: ref.id, ...payload },
    });
  } catch (err) {
    console.error('[api/dreamers POST] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to create dreamer.' },
      { status: 500 }
    );
  }
}
