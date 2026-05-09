/**
 * POST /api/dreams/save-entry
 *
 * Storage-adapter write for new current dream entries.
 * Defaults to Firebase and can switch to Postgres with DREAM_DB_PROVIDER=postgres.
 *
 * Writes:
 *   - dreamEntries (one doc)
 *   - activeDreamWindows (one doc per candidate number per game type)
 *   - termNumberMappings (one doc per term+number combo for Universal Dream Dictionary)
 *
 * Returns: dreamEntryId, windowsCreated, termMappingsWritten
 */
import { NextRequest, NextResponse } from 'next/server';
import { createDreamEntryWithWindows } from '@/lib/storage/dreamEntries';

export const maxDuration = 30;

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface TermMapping {
  term: string;
  normalizedTerm?: string;
  cash3Numbers: string[];
  cash4Numbers: string[];
  relatedTerms?: string[];
  archivedNumbers?: string[];
  lineContexts?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid     = String(body.ownerUid     || '');
    const dreamerId    = String(body.dreamerId    || 'owner-self');
    const dreamerName  = String(body.dreamerName  || '');   // never default to a hardcoded name
    const dreamDate    = String(body.dreamDate    || '');
    const rawText      = String(body.rawText      || '');
    const cleanedText  = String(body.cleanedText  || rawText.trim());
    const sourceType   = String(body.sourceType   || 'manual');
    const notes        = String(body.notes        || '');
    const isReviewed   = Boolean(body.isReviewed  ?? true);
    const termMappings: TermMapping[] = Array.isArray(body.termMappings) ? body.termMappings : [];

    if (!ownerUid)   return NextResponse.json({ ok: false, error: 'ownerUid is required.'  }, { status: 400 });
    if (!dreamDate)  return NextResponse.json({ ok: false, error: 'dreamDate is required.' }, { status: 400 });
    if (!rawText.trim()) return NextResponse.json({ ok: false, error: 'rawText is required.' }, { status: 400 });

    const activeWindowStart = dreamDate;
    const activeWindowEnd   = addDays(dreamDate, 6);

    // Flatten all numbers from term mappings
    const allNumbers = Array.from(new Set([
      ...termMappings.flatMap(m => m.cash3Numbers ?? []),
      ...termMappings.flatMap(m => m.cash4Numbers ?? []),
    ]));

    const windowsCreated = termMappings.reduce(
      (sum, mapping) =>
        sum +
        (mapping.cash3Numbers ?? []).filter((value) => String(value ?? '').trim()).length +
        (mapping.cash4Numbers ?? []).filter((value) => String(value ?? '').trim()).length,
      0
    );
    const termMappingsWritten = windowsCreated;

    const dreamEntryId = await createDreamEntryWithWindows(ownerUid, {
      dreamerId,
      dreamerName,
      rawText,
      cleanedText,
      dreamDate,
      termMappings: termMappings as any,
      sourceType: sourceType as any,
      notes,
      isReviewed,
    });

    return NextResponse.json({
      ok: true,
      dreamEntryId,
      dreamDate,
      activeWindowStart,
      activeWindowEnd,
      windowsCreated,
      termMappingsWritten,
      allNumbersCount: allNumbers.length,
    });
  } catch (err) {
    console.error('[save-entry] failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save dream entry.' },
      { status: 500 }
    );
  }
}
