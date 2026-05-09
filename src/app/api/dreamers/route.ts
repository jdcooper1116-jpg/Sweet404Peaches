/**
 * GET  /api/dreamers?ownerUid=...
 * POST /api/dreamers  { ownerUid, displayName, alias?, preferredStates, preferredGames,
 *                       preferredDrawTimes, isGuest, notes? }
 *
 * Storage-adapter backed dreamers collection.
 * Defaults to Firebase and can switch to Postgres with DREAM_DB_PROVIDER=postgres.
 *
 * GET returns all dreamers for the owner sorted alphabetically.
 * POST creates a new dreamer and returns the new dreamerId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnerUid } from '@/lib/firebase/admin';
import { createDreamer, getDreamer, listDreamers } from '@/lib/storage/dreamers';

export const dynamic = 'force-dynamic';

function serializeTimestamp(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value.toDate?.()?.toISOString?.() ?? value;
}

function serializeDreamer(dreamer: any) {
  return {
    ...dreamer,
    createdAt: serializeTimestamp(dreamer.createdAt),
    updatedAt: serializeTimestamp(dreamer.updatedAt),
  };
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ownerUid = resolveOwnerUid(req.nextUrl.searchParams.get('ownerUid'));
    const dreamers = (await listDreamers(ownerUid)).map(serializeDreamer);

    dreamers.sort((a, b) =>
      String(a.displayName ?? '').localeCompare(String(b.displayName ?? ''))
    );

    const res = NextResponse.json({ ok: true, dreamers, count: dreamers.length });
    res.headers.set('Cache-Control', 'private, max-age=60');  // dreamers change infrequently
    return res;
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

    const dreamerInput = {
      displayName,
      preferredStates,
      preferredGames: preferredGames as any,
      preferredDrawTimes: preferredDrawTimes as any,
      isGuest,
      notes,
    };

    const dreamerId = await createDreamer(ownerUid, alias ? { ...dreamerInput, alias } : dreamerInput);
    const dreamer = await getDreamer(dreamerId);

    return NextResponse.json({
      ok:        true,
      dreamerId,
      dreamer:   dreamer ? serializeDreamer(dreamer) : { id: dreamerId, ownerUid, ...dreamerInput },
    });
  } catch (err) {
    console.error('[api/dreamers POST] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to create dreamer.' },
      { status: 500 }
    );
  }
}
