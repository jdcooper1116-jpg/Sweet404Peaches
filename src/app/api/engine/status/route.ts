import { NextResponse } from 'next/server';
import { getIngestStatus } from '@/lib/engine/client';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const status = await getIngestStatus();
    return NextResponse.json({ is_current: status.is_current, last_run_at: status.last_run_at, success_count: status.success_count, failure_count: status.failure_count, skipped_count: status.skipped_count, has_errors: status.failure_count > 0, raw: status }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/engine/status]', message);
    return NextResponse.json({ is_current: false, last_run_at: null, has_errors: true, error: message }, { status: 502 });
  }
}
