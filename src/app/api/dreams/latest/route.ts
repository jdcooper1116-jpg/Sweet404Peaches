/**
 * GET /api/dreams/latest?ownerUid=...&dreamerId=...&n=...
 *
 * Storage-adapter read — returns the n most recent dreamEntries.
 * Replaces getLatestDreamEntry() / listDreamEntries() calls
 * in Forecast Board, Daily Ops, Chat, and Dashboard.
 *
 * Query params:
 *   ownerUid   required
 *   dreamerId  optional — filter to one dreamer
 *   n          optional — number of entries to return, default 1, max 20
 *
 * When n=1 (default), response.entry is the single latest entry (or null).
 * When n>1, response.entries is an array sorted most-recent-first.
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
    const n         = Math.min(Math.max(Number(params.get('n') ?? 1), 1), 20);

    // Fetch slightly more than n to handle sort + dedupe
    const entries = (await listDreamEntries(ownerUid, {
      dreamerId: dreamerId || undefined,
      limit: 50,
    })).map(serializeEntry);

    // Sort: dreamDate desc, then uploadedAt desc (most recent first)
    entries.sort((a: any, b: any) => {
      const dateA = String(a.dreamDate ?? '');
      const dateB = String(b.dreamDate ?? '');
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;
      const upA = String(a.uploadedAt ?? a.createdAt ?? '');
      const upB = String(b.uploadedAt ?? b.createdAt ?? '');
      return upA < upB ? 1 : -1;
    });

    const topN = entries.slice(0, n);

    // Convenience: n=1 exposes a single `entry` field (matches getLatestDreamEntry usage)
    return NextResponse.json({
      ok:      true,
      entry:   topN[0] ?? null,       // single-entry shortcut
      entries: topN,                  // always an array
      count:   topN.length,
    });
  } catch (err) {
    console.error('[api/dreams/latest] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load latest dream entry.' },
      { status: 500 }
    );
  }
}
