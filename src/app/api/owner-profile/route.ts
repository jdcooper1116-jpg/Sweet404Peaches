import { NextRequest, NextResponse } from 'next/server';
import { getOwnerProfile, upsertOwnerProfile } from '@/lib/storage/ownerProfiles';
import type { UnknownRecord } from '@/lib/storage/types';

// ─── GET /api/owner-profile?ownerUid=... ─────────────────────────────────────
// Returns the owner profile for the given UID.
// If no profile exists yet, returns defaults.

export async function GET(req: NextRequest) {
  const ownerUid = req.nextUrl.searchParams.get('ownerUid');
  if (!ownerUid) {
    return NextResponse.json({ ok: false, error: 'ownerUid required' }, { status: 400 });
  }

  try {
    const profile = await getOwnerProfile(ownerUid);

    if (!profile) {
      return NextResponse.json({
        ok: true,
        profile: {
          ownerUid,
          displayName: '',
          updatedAt:   null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      profile: {
        ownerUid,
        displayName: profile.displayName ?? '',
        updatedAt:   profile.updatedAt   ?? null,
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
    const body: {
      ownerUid?: string;
      displayName?: string;
      email?: string;
      [key: string]: unknown;
    } = await req.json();
    const { ownerUid, displayName } = body;

    if (!ownerUid)    return NextResponse.json({ ok: false, error: 'ownerUid required' }, { status: 400 });
    if (!displayName?.trim()) return NextResponse.json({ ok: false, error: 'displayName required' }, { status: 400 });

    const { ownerUid: _ownerUid, displayName: _displayName, email, ...metadata } = body;
    const metadataPatch: UnknownRecord = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) metadataPatch[key] = value;
    }

    await upsertOwnerProfile(ownerUid, {
      displayName: displayName.trim(),
      ...(typeof email === 'string' ? { email } : {}),
      ...(Object.keys(metadataPatch).length > 0 ? { metadata: metadataPatch } : {}),
    });

    return NextResponse.json({ ok: true, displayName: displayName.trim() });
  } catch (err) {
    console.error('[owner-profile PATCH]', err);
    return NextResponse.json({ ok: false, error: 'Failed to save profile' }, { status: 500 });
  }
}
