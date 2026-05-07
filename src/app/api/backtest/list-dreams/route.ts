/**
 * GET /api/backtest/list-dreams?ownerUid=...
 *
 * Returns all backtestDreams with correct dreamerId + dreamerName.
 *
 * If dreamerName is missing from the backtestDream doc but dreamerId is present,
 * looks up the dreamer from the dreamers collection.
 *
 * owner-self displays as "Owner / Self".
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function isQuotaError(e: unknown) {
  return String(e).includes('RESOURCE_EXHAUSTED') || String(e).includes('quota');
}

export async function GET(req: NextRequest) {
  try {
    const params   = req.nextUrl.searchParams;
    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const dreamerFilter = (params.get('dreamerId') ?? '').trim();
    const limit    = Math.min(Number(params.get('limit') ?? 100), 300);

    const db = getAdminDb();

    // ── 1. Load backtest dreams ──────────────────────────────────────────
    let q: any = db.collection('backtestDreams').where('ownerUid', '==', ownerUid);
    if (dreamerFilter) q = q.where('dreamerId', '==', dreamerFilter);
    const snap = await q.limit(limit).get();

    // ── 2. Collect unique dreamerIds needing a name lookup ──────────────
    const dreamerIds = new Set<string>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const did = String(d.dreamerId ?? '');
      if (did && did !== 'owner-self' && !d.dreamerName) {
        dreamerIds.add(did);
      }
    }

    // ── 3. Load dreamer display names ────────────────────────────────────
    const dreamerNameCache = new Map<string, string>();
    // Also load owner profile display name
    let ownerDisplayName = 'Owner / Self';
    try {
      const ownerDoc = await db.collection('ownerProfiles').doc(ownerUid).get();
      if (ownerDoc.exists) ownerDisplayName = String(ownerDoc.data()?.displayName ?? 'Owner / Self');
    } catch { /* non-fatal */ }

    await Promise.allSettled([...dreamerIds].map(async did => {
      try {
        const d = await db.collection('dreamers').doc(did).get();
        if (d.exists) {
          dreamerNameCache.set(did, String(d.data()?.displayName ?? d.data()?.dreamerName ?? d.data()?.name ?? did));
        }
      } catch { /* non-fatal */ }
    }));

    // ── 4. Build response ────────────────────────────────────────────────
    const dreams = snap.docs.map((doc: any) => {
      const d   = doc.data();
      const did = String(d.dreamerId ?? 'owner-self');
      let dreamerName = String(d.dreamerName ?? '');
      if (!dreamerName) {
        if (did === 'owner-self') dreamerName = ownerDisplayName;
        else dreamerName = dreamerNameCache.get(did) ?? did;
      }

      return {
        id:           doc.id,
        ownerUid:     String(d.ownerUid     ?? ownerUid),
        dreamerId:    did,
        dreamerName,
        dreamDate:    String(d.dreamDate    ?? ''),
        rawText:      String(d.rawText      ?? '').slice(0, 200),
        status:       String(d.status       ?? ''),
        hitCount:     Number(d.hitCount     ?? 0),
        termCount:    Number(d.termCount    ?? (d.termMappings?.length ?? 0)),
        createdAt:    d.createdAt?.toDate?.()?.toISOString?.() ?? d.createdAt ?? null,
        updatedAt:    d.updatedAt?.toDate?.()?.toISOString?.() ?? d.updatedAt ?? null,
      };
    });

    // Sort by createdAt descending
    dreams.sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    const res = NextResponse.json({ ok: true, dreams, count: dreams.length });
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;

  } catch (err) {
    const q = isQuotaError(err);
    return NextResponse.json(
      { ok: false, error: q ? 'Quota exhausted.' : err instanceof Error ? err.message : 'Failed.' },
      { status: q ? 429 : 500 }
    );
  }
}
