/**
 * POST /api/dreams/refresh
 *
 * Triggers a refresh of all active dream windows.
 * Gap fix: falls back to SWEET404_OWNER_UID env var when no body is sent
 * (required for Vercel cron calls which send no body).
 */


import { NextRequest, NextResponse }             from 'next/server';
import { initializeApp, getApps, cert }          from 'firebase-admin/app';
import { getFirestore }                           from 'firebase-admin/firestore';
import { refreshAllActiveWindows }                from '@/lib/engine/dreamRefresh';
import { format }                                 from 'date-fns';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

function getAdminDb() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  }
  return getFirestore();
}

export async function POST(req: NextRequest) {
  let ownerUid: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    ownerUid   = body?.ownerUid ?? null;
  } catch {
    // body is optional
  }

  // Cron fallback — Vercel cron sends no body
  if (!ownerUid) {
    ownerUid = process.env.SWEET404_OWNER_UID ?? null;
  }

  if (!ownerUid) {
    return NextResponse.json(
      { error: 'ownerUid is required. Set SWEET404_OWNER_UID in Vercel env vars.' },
      { status: 400 }
    );
  }

  try {
    const db    = getAdminDb();    // AdminFirestore — no cast needed
    const today = format(new Date(), 'yyyy-MM-dd');
    const result = await refreshAllActiveWindows(db, ownerUid, today);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/dreams/refresh]', message);
    return NextResponse.json({ error: 'Dream refresh failed.', detail: message }, { status: 500 });
  }
}
