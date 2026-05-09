/**
 * GET /api/dreams/entries?ownerUid=...&dreamerId=...&limit=...
 *
 * Storage-adapter read for dreamEntries collection.
 * Defaults to Firebase and can switch to Postgres with DREAM_DB_PROVIDER=postgres.
 *
 * Query params:
 *   ownerUid   required
 *   dreamerId  optional — filter to one dreamer (use "owner-self" for owner)
 *   limit      optional — max rows, default 200
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnerUid } from '@/lib/firebase/admin';
import { listDreamEntries } from '@/lib/storage/dreamEntries';

export const dynamic = 'force-dynamic';

function serializeTimestamp(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value.toDate?.()?.toISOString?.() ?? value;
}

function serializeEntry(entry: any) {
  return {
    ...entry,
    uploadedAt: serializeTimestamp(entry.uploadedAt),
    createdAt: serializeTimestamp(entry.createdAt),
    updatedAt: serializeTimestamp(entry.updatedAt),
  };
}

export async function GET(req: NextRequest) {
  try {
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = params.get('dreamerId') ?? '';
    const maxRows   = Math.min(Number(params.get('limit') ?? 200), 1000);

    const entries = (await listDreamEntries(ownerUid, {
      dreamerId: dreamerId || undefined,
      limit: maxRows,
    })).map(serializeEntry);

    // Sort by dreamDate desc, then uploadedAt desc
    entries.sort((a: any, b: any) => {
      const dateA = String(a.dreamDate ?? '');
      const dateB = String(b.dreamDate ?? '');
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;
      const upA = String(a.uploadedAt ?? '');
      const upB = String(b.uploadedAt ?? '');
      return upA < upB ? 1 : -1;
    });

    return NextResponse.json({ ok: true, entries, count: entries.length });
  } catch (err) {
    console.error('[api/dreams/entries] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dream entries.' },
      { status: 500 }
    );
  }
}
