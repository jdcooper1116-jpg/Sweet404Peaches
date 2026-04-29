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
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

export const dynamic  = 'force-dynamic';
export const maxDuration = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeTerm(term: string): string {
  return String(term || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

function safeId(value: unknown): string {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
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

    const db  = getAdminDb();
    const now = Timestamp.now();

    const cash3Numbers       = Array.isArray(parseResult.cash3Numbers)   ? parseResult.cash3Numbers   : [];
    const cash4Numbers       = Array.isArray(parseResult.cash4Numbers)   ? parseResult.cash4Numbers   : [];
    const archivedNumbers    = Array.isArray(parseResult.archivedNumbers) ? parseResult.archivedNumbers : [];
    const parsedTermMappings = Array.isArray(parseResult.termMappings)   ? parseResult.termMappings   : [];

    const activeWindowStart = dreamDate;
    const activeWindowEnd   = addDays(dreamDate, 6);

    // ── 1. Write backtestDreams ───────────────────────────────────────────────

    const dreamRef       = db.collection('backtestDreams').doc();
    const backtestDreamId = dreamRef.id;

    const dreamDoc = {
      ownerUid,
      backtestDreamId,
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
      createdAt:    now,
      updatedAt:    now,
    };

    await dreamRef.set(dreamDoc, { merge: true });

    // ── 2. Write backtestWindows ──────────────────────────────────────────────

    await db.collection('backtestWindows').doc(backtestDreamId).set(
      {
        ownerUid,
        backtestDreamId,
        dreamerId,
        dreamerName,
        dreamDate,
        activeWindowStart,
        activeWindowEnd,
        lookaheadDays: 7,
        cash3Numbers,
        cash4Numbers,
        status:    'intake-saved',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    // ── 3. Write termNumberMappings (Universal Dream Dictionary) ──────────────
    //
    // SHAPE: flat, one doc per (ownerUid, dreamerId, normalizedTerm, number, gameType).
    // This matches the shape expected by /api/dictionary/terms route (Shape A in expandDoc).
    //
    // DEDUP: deterministic doc ID.  merge:true means re-saving the same dream
    //        just refreshes updatedAt — no duplicate rows.
    //
    // LEADING ZEROS: numbers stored as String(num).trim(), never coerced to int.
    //
    // Batch size: 400 (Firestore limit per batch.commit()).
    const BATCH_SIZE = 400;

    // Collect all flat rows first
    type TermRow = {
      docId:      string;
      termLabel:  string;
      normalizedTerm: string;
      number:     string;
      gameType:   'cash3' | 'cash4';
    };

    const rows: TermRow[] = [];

    for (const mapping of parsedTermMappings) {
      const termRaw   = String(mapping.term || '').trim();
      if (!termRaw) continue;
      const termLabel     = termRaw;
      const normalizedTerm = normalizeTerm(termRaw);

      for (const raw of (Array.isArray(mapping.cash3Numbers) ? mapping.cash3Numbers : [])) {
        const number = String(raw ?? '').trim();
        if (!number) continue;
        const docId = [ownerUid, dreamerId, normalizedTerm, number, 'cash3'].map(safeId).join('__');
        rows.push({ docId, termLabel, normalizedTerm, number, gameType: 'cash3' });
      }

      for (const raw of (Array.isArray(mapping.cash4Numbers) ? mapping.cash4Numbers : [])) {
        const number = String(raw ?? '').trim();
        if (!number) continue;
        const docId = [ownerUid, dreamerId, normalizedTerm, number, 'cash4'].map(safeId).join('__');
        rows.push({ docId, termLabel, normalizedTerm, number, gameType: 'cash4' });
      }
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const row of rows.slice(i, i + BATCH_SIZE)) {
        batch.set(
          db.collection('termNumberMappings').doc(row.docId),
          {
            ownerUid,
            dreamerId,
            dreamerName,
            termLabel:       row.termLabel,
            normalizedTerm:  row.normalizedTerm,
            number:          row.number,        // stored as string — leading zeros preserved
            gameType:        row.gameType,
            source:          'historical-dream-intake',
            backtestDreamId,
            dreamDate,
            createdAt:       now,
            updatedAt:       now,
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      backtestDreamId,
      dreamerId,
      dreamerName,
      termMappingsWritten: rows.length,
      dream: { id: backtestDreamId, ...dreamDoc },
    });
  } catch (err) {
    console.error('[save-dream-intake] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save dream intake.' },
      { status: 500 }
    );
  }
}
