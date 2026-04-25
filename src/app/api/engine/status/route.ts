import { NextResponse } from 'next/server';
import { getIngestStatus } from '@/lib/engine/client';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const status = await getIngestStatus();

    // Engine returns status fields — handle both flat and nested shapes
    const raw        = (status as any);
    const inner      = raw?.status ?? raw;
    const last_run_at =
      inner?.finished_at ?? inner?.started_at ?? raw?.last_run_at ?? null;
    const failure_count  = inner?.failure_count  ?? raw?.failure_count  ?? 0;
    const success_count  = inner?.pair_count     ?? raw?.success_count  ?? 0;
    const is_current     = !!last_run_at && failure_count === 0;

    return NextResponse.json({
      is_current,
      last_run_at,
      success_count,
      failure_count,
      has_errors: failure_count > 0,
      raw: status,
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/engine/status]', message);
    return NextResponse.json({
      is_current:  false,
      last_run_at: null,
      has_errors:  true,
      error:       message,
    }, { status: 502 });
  }
}
