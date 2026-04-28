import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

// ─── GET /api/owner-profile?ownerUid=... ─────────────────────────────────────
// Returns the owner profile for the given UID.
// If no profile exists yet, returns defaults.

export async function GET(req: NextRequest) {
  const ownerUid = req.nextUrl.searchParams.get('ownerUid');
  if (!ownerUid) {
    return NextResponse.json({ ok: false, error: 'ownerUid required' }, { status: 400 });
  }

  try {
    const db   = getAdminDb();
    const snap = await db.collection('ownerProfiles').doc(ownerUid).get();

    if (!snap.exists) {
      return NextResponse.json({
        ok: true,
        profile: {
          ownerUid,
          displayName: '',
          updatedAt:   null,
        },
      });
    }

    const data = snap.data() ?? {};
    return NextResponse.json({
      ok: true,
      profile: {
        ownerUid,
        displayName: data.displayName ?? '',
        updatedAt:   data.updatedAt   ?? null,
      },
    });
  } catch (err) {
    console.error('[owner-profile GET]', err);
    return NextResponse.json({ ok: false, error: 'Failed to load profile' }, { status: 500 });
  }
}

// ─── PATCH /api/owner-profile ─────────────────────────────────────────────────
// Body: { ownerUid, displayName }
// Sets the display name for the owner profile.

export async function PATCH(req: NextRequest) {
  try {
    const body: { ownerUid?: string; displayName?: string } = await req.json();
    const { ownerUid, displayName } = body;

    if (!ownerUid)    return NextResponse.json({ ok: false, error: 'ownerUid required' }, { status: 400 });
    if (!displayName?.trim()) return NextResponse.json({ ok: false, error: 'displayName required' }, { status: 400 });

    const db = getAdminDb();
    await db.collection('ownerProfiles').doc(ownerUid).set(
      {
        ownerUid,
        displayName: displayName.trim(),
        updatedAt:   new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, displayName: displayName.trim() });
  } catch (err) {
    console.error('[owner-profile PATCH]', err);
    return NextResponse.json({ ok: false, error: 'Failed to save profile' }, { status: 500 });
  }
}
