import { NextRequest, NextResponse }    from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const COLLECTIONS = [
  'dreamEntries', 'dreamers', 'activeDreamWindows', 'dreamHits',
  'lotteryResults', 'pinnedPlays', 'backtestDreams', 'backtestWindows',
  'backtestResults', 'backtestHits', 'backtestSummaries',
];

function getAdminDb() {
  if (getApps().length === 0) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set.');
    initializeApp({ credential: cert(JSON.parse(key)) });
  }
  return getFirestore();
}

async function deleteCollection(
  db: ReturnType<typeof getFirestore>,
  name: string,
  ownerUid: string
): Promise<number> {
  const snap = await db.collection(name).where('ownerUid', '==', ownerUid).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json().catch(() => ({}));
    const ownerUid = body?.ownerUid ?? process.env.SWEET404_OWNER_UID;
    if (!ownerUid) return NextResponse.json({ error: 'ownerUid required.' }, { status: 400 });
    const db      = getAdminDb();
    const report: Record<string, number> = {};
    for (const name of COLLECTIONS) {
      report[name] = await deleteCollection(db, name, ownerUid);
    }
    return NextResponse.json({ ok: true, report }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
