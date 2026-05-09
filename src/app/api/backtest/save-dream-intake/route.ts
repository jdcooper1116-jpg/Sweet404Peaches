/**
 * POST /api/backtest/save-dream-intake
 *
 * Saves a historical dream intake record to:
 *   1. backtestDreams   — the dream entry with dreamerId/dreamerName
 *   2. backtestWindows  — 7-day research window
 *   3. termNumberMappings — Universal Dream Dictionary, flat per-number shape,
 *                           one doc per term::number::gameType::dreamer combination
 *
 * Dreamer scope:
 *   - dreamerId  from body (selected by intake UI; falls back to 'owner-self')
 *   - dreamerName from body (resolved by intake UI from owner profile or dreamer list)
 *
 * Dictionary dedup:
 *   Doc ID = ownerUid__dreamerId__normalizedTerm__number__gameType (safeId-joined)
 *   merge:true → safe to re-save the same dream without creating duplicates.
 *
 * Leading-zero preservation:
 *   Numbers are stored as strings. String(num ?? '').trim() — never coerced to int.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createBacktestDreamIntake } from '@/lib/storage/backtests';

export const dynamic  = 'force-dynamic';
export const maxDuration = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid    = String(body.ownerUid    || '').trim();
    const dreamDate   = String(body.dreamDate   || '').trim();
    const rawText     = String(body.rawText     || '').trim();
    const source      = String(body.source      || 'historical-intake');
    const confidence  = String(body.confidence  || 'high');
    const notes       = String(body.notes       || '');
    const parseResult = body.parseResult || {};

    // Dreamer scope — required by Batch 9A.
    // Falls back to owner-self if the UI did not pass a selected dreamer.
    const dreamerId   = String(body.dreamerId   || 'owner-self');
    const dreamerName = String(body.dreamerName || '');

    if (!ownerUid)       return NextResponse.json({ ok: false, error: 'ownerUid is required.'  }, { status: 400 });
    if (!dreamDate)      return NextResponse.json({ ok: false, error: 'dreamDate is required.'  }, { status: 400 });
    if (!rawText.trim()) return NextResponse.json({ ok: false, error: 'rawText is required.'    }, { status: 400 });

    const cash3Numbers       = Array.isArray(parseResult.cash3Numbers)   ? parseResult.cash3Numbers   : [];
    const cash4Numbers       = Array.isArray(parseResult.cash4Numbers)   ? parseResult.cash4Numbers   : [];
    const archivedNumbers    = Array.isArray(parseResult.archivedNumbers) ? parseResult.archivedNumbers : [];
    const parsedTermMappings = Array.isArray(parseResult.termMappings)   ? parseResult.termMappings   : [];

    const activeWindowStart = dreamDate;
    const activeWindowEnd   = addDays(dreamDate, 6);

    const dreamDoc = {
      ownerUid,
      dreamerId,
      dreamerName,
      dreamDate,
      rawText,
      source,
      confidence,
      notes,
      parseResult,
      parsedTermMappings,
      cash3Numbers,
      cash4Numbers,
      archivedNumbers,
      activeWindowStart,
      activeWindowEnd,
      status:       'intake-saved',
      replaySource: '',
    };

    const termMappingsWritten = parsedTermMappings.reduce((sum: number, mapping: any) => {
      return sum +
        (Array.isArray(mapping?.cash3Numbers) ? mapping.cash3Numbers.filter((n: any) => String(n ?? '').trim()).length : 0) +
        (Array.isArray(mapping?.cash4Numbers) ? mapping.cash4Numbers.filter((n: any) => String(n ?? '').trim()).length : 0);
    }, 0);

    const backtestDreamId = await createBacktestDreamIntake(ownerUid, {
      dreamDate,
      rawText,
      source,
      confidence,
      notes,
      parseResult,
      dreamerId,
      dreamerName,
    });

    return NextResponse.json({
      ok: true,
      backtestDreamId,
      dreamerId,
      dreamerName,
      termMappingsWritten,
      dream: { id: backtestDreamId, backtestDreamId, ...dreamDoc },
    });
  } catch (err) {
    console.error('[save-dream-intake] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save dream intake.' },
      { status: 500 }
    );
  }
}
