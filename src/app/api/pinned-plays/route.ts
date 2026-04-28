import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

const COLLECTION = 'pinnedPlays';
const ALLOWED_STATUSES = new Set(['suggested', 'pinned', 'archived']);

function cleanString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function cleanArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => String(x).trim()).filter(Boolean);
}

function normalizeGameType(v: unknown): 'cash3' | 'cash4' {
  return v === 'cash4' ? 'cash4' : 'cash3';
}

function normalizeStatus(v: unknown): 'suggested' | 'pinned' | 'archived' {
  const s = cleanString(v) || 'suggested';
  return ALLOWED_STATUSES.has(s) ? (s as 'suggested' | 'pinned' | 'archived') : 'suggested';
}

function dedupKeyFor(data: {
  ownerUid: string;
  number: string;
  gameType: string;
  state?: string;
  sourceTerm?: string;
  source?: string;
}) {
  return [
    data.ownerUid,
    data.number,
    data.gameType,
    (data.state || '').toUpperCase(),
    (data.sourceTerm || '').toLowerCase(),
    (data.source || '').toLowerCase(),
  ].join('::');
}

function serializeDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() || {};

  function ts(v: any) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    return v;
  }

  return {
    id: doc.id,
    ...data,
    createdAt: ts((data as any).createdAt),
    updatedAt: ts((data as any).updatedAt),
  };
}

function sortPinnedRows(rows: any[]) {
  const rank: Record<string, number> = { suggested: 0, pinned: 1, archived: 2 };
  return rows.sort((a, b) => {
    const ar = rank[a.status] ?? 99;
    const br = rank[b.status] ?? 99;
    if (ar !== br) return ar - br;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

// GET /api/pinned-plays?ownerUid=...&status=...
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const status = cleanString(params.get('status'));

    const db = getAdminDb();
    const snap = await db.collection(COLLECTION)
      .where('ownerUid', '==', ownerUid)
      .get();

    let plays = snap.docs.map(serializeDoc);

    // Hide soft-deleted rows if that field ever exists.
    plays = plays.filter((p: any) => !p.deletedAt);

    if (status && status !== 'all') {
      plays = plays.filter((p: any) => p.status === status);
    }

    plays = sortPinnedRows(plays);

    return NextResponse.json({
      ok: true,
      ownerUid,
      plays,
      count: plays.length,
    });
  } catch (err) {
    console.error('GET /api/pinned-plays failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load pinned plays.' },
      { status: 500 }
    );
  }
}

// POST /api/pinned-plays
// Creates or upserts by ownerUid::number::gameType::state::sourceTerm::source
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid = resolveOwnerUid(body.ownerUid);
    const number = cleanString(body.number);
    const gameType = normalizeGameType(body.gameType);
    const state = cleanString(body.state).toUpperCase();
    const source = cleanString(body.source) || 'manual';
    const sourceTerm = cleanString(body.sourceTerm || body.termLabel || body.term);
    const sourceTerms = cleanArray(body.sourceTerms);
    const evidenceBadges = cleanArray(body.evidenceBadges);
    const states = cleanArray(body.states).map(s => s.toUpperCase());
    const status = normalizeStatus(body.status);

    if (!number) {
      return NextResponse.json({ ok: false, error: 'number is required.' }, { status: 400 });
    }

    if (!/^\d{3,4}$/.test(number)) {
      return NextResponse.json(
        { ok: false, error: 'number must be exactly 3 or 4 digits. Leading zeros are allowed.' },
        { status: 400 }
      );
    }

    const dedupKey = dedupKeyFor({ ownerUid, number, gameType, state, sourceTerm, source });
    const db = getAdminDb();
    const now = Timestamp.now();

    const existing = await db.collection(COLLECTION)
      .where('ownerUid', '==', ownerUid)
      .where('dedupKey', '==', dedupKey)
      .limit(1)
      .get();

    const payload = {
      ownerUid,
      dreamerId: cleanString(body.dreamerId),
      dreamerName: cleanString(body.dreamerName),
      number,
      gameType,
      state,
      sourceTerm,
      sourceTerms: sourceTerms.length ? sourceTerms : (sourceTerm ? [sourceTerm] : []),
      source,
      reason: cleanString(body.reason),
      evidenceBadges,
      status,
      boxedKey: cleanString(body.boxedKey),
      hitCount: typeof body.hitCount === 'number' ? body.hitCount : Number(body.hitCount || 0),
      states,
      dedupKey,
      updatedAt: now,
    };

    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      await ref.set(payload, { merge: true });
      return NextResponse.json({
        ok: true,
        duplicate: true,
        id: ref.id,
        play: { id: ref.id, ...payload, updatedAt: new Date().toISOString() },
      });
    }

    const ref = await db.collection(COLLECTION).add({
      ...payload,
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      duplicate: false,
      id: ref.id,
      play: { id: ref.id, ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error('POST /api/pinned-plays failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save pinned play.' },
      { status: 500 }
    );
  }
}

// PATCH /api/pinned-plays
// Body: { ownerUid, id, status }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid = resolveOwnerUid(body.ownerUid);
    const id = cleanString(body.id || body.playId);
    const nextStatus = cleanString(body.status);

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id is required.' }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return NextResponse.json(
        { ok: false, error: 'status must be suggested, pinned, or archived. Played/Won are not supported yet.' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Pinned play not found.' }, { status: 404 });
    }

    const data = snap.data() || {};
    if (data.ownerUid !== ownerUid) {
      return NextResponse.json({ ok: false, error: 'Not authorized for this pinned play.' }, { status: 403 });
    }

    await ref.update({
      status: nextStatus,
      updatedAt: Timestamp.now(),
    });

    const updated = await ref.get();

    return NextResponse.json({
      ok: true,
      play: serializeDoc(updated),
    });
  } catch (err) {
    console.error('PATCH /api/pinned-plays failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to update pinned play.' },
      { status: 500 }
    );
  }
}
