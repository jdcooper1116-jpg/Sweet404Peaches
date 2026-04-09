import { NextRequest, NextResponse } from 'next/server';
import { fetchGeorgiaBacktestWindow } from '@/lib/backtesting/providers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dreamDate = String(body?.dreamDate ?? '').trim();

    if (!dreamDate || !/^\d{4}-\d{2}-\d{2}$/.test(dreamDate)) {
      return NextResponse.json(
        { error: 'A valid dreamDate (YYYY-MM-DD) is required.' },
        { status: 400 }
      );
    }

    const result = await fetchGeorgiaBacktestWindow(dreamDate);

    return NextResponse.json({
      ok: true,
      rows: result.rows,
      attempts: result.attempts,
      providerStrategy: 'Georgia → Lottery.net primary → LotteryGuru fallback',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Auto-fetch failed.' },
      { status: 500 }
    );
  }
}
