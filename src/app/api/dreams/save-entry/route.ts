/**
 * POST /api/dreams/save-entry
 *
 * Server-side Firebase Admin write for new current dream entries.
 * Replaces client-side createDreamEntryWithWindows() calls.
 *
 * Writes:
 *   - dreamEntries (one doc)
 *   - activeDreamWindows (one doc per candidate number per game type)
 *   - termNumberMappings (one doc per term+number combo for Universal Dream Dictionary)
 *
 * Returns: dreamEntryId, windowsCreated, termMappingsWritten
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

export const maxDuration = 30;

// US states that get tracked for each active window.
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

function sortedDigits(value: string): string {
  return value.split('').sort().join('');
}

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
    const dreamerName  = String(body.dreamerName  || 'Sweet404Peaches');
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

    const db = getAdminDb();
    const now = Timestamp.now();

    const activeWindowStart = dreamDate;
    const activeWindowEnd   = addDays(dreamDate, 6);

    // Flatten all numbers from term mappings
    const allNumbers = Array.from(new Set([
      ...termMappings.flatMap(m => m.cash3Numbers ?? []),
      ...termMappings.flatMap(m => m.cash4Numbers ?? []),
    ]));

    // ── 1. Write dreamEntries ─────────────────────────────────────────────────
    const dreamRef = db.collection('dreamEntries').doc();
    const dreamEntryId = dreamRef.id;

    await dreamRef.set({
      ownerUid,
      dreamerId,
      dreamerName,
      rawText,
      cleanedText,
      dreamDate,
      termMappings,
      allNumbers,
      activeWindowStart,
      activeWindowEnd,
      sourceType,
      notes,
      isReviewed,
      uploadedAt: now,
    });

    // ── 2. Write activeDreamWindows (batch) ───────────────────────────────────
    // One document per candidate number per game type.
    let windowsCreated = 0;
    const BATCH_SIZE = 400;
    const windowDocs: Array<{ data: Record<string, unknown> }> = [];

    for (const mapping of termMappings) {
      const termLabel = String(mapping.term || '').trim() || 'unknown-term';

      for (const value of (mapping.cash3Numbers ?? [])) {
        windowDocs.push({
          data: {
            ownerUid,
            dreamEntryId,
            dreamerId,
            dreamerName,
            termLabel,
            number:      value,
            gameType:    'cash3',
            boxedKey:    sortedDigits(value),
            activeStart: activeWindowStart,
            activeEnd:   activeWindowEnd,
            isActive:    true,
            statesTracked: [...US_STATES],
            createdAt:   now,
            updatedAt:   now,
          },
        });
      }

      for (const value of (mapping.cash4Numbers ?? [])) {
        windowDocs.push({
          data: {
            ownerUid,
            dreamEntryId,
            dreamerId,
            dreamerName,
            termLabel,
            number:      value,
            gameType:    'cash4',
            boxedKey:    sortedDigits(value),
            activeStart: activeWindowStart,
            activeEnd:   activeWindowEnd,
            isActive:    true,
            statesTracked: [...US_STATES],
            createdAt:   now,
            updatedAt:   now,
          },
        });
      }
    }

    for (let i = 0; i < windowDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const { data } of windowDocs.slice(i, i + BATCH_SIZE)) {
        batch.set(db.collection('activeDreamWindows').doc(), data);
      }
      await batch.commit();
      windowsCreated += windowDocs.slice(i, i + BATCH_SIZE).length;
    }

    // ── 3. Write termNumberMappings (Universal Dream Dictionary) ──────────────
    // One doc per term+number+gameType combination.
    let termMappingsWritten = 0;

    for (const mapping of termMappings) {
      const termLabel = String(mapping.term || '').trim() || 'unknown-term';

      for (const value of (mapping.cash3Numbers ?? [])) {
        const docId = [ownerUid, termLabel, value, 'cash3'].join('__').replace(/[^a-zA-Z0-9_-]/g, '_');
        await db.collection('termNumberMappings').doc(docId).set(
          {
            ownerUid,
            termLabel,
            number:           value,
            gameType:         'cash3',
            source:           'parsed',
            confidenceBasis:  `current-dream:${dreamDate}`,
            rawContext:       rawText.slice(0, 500),
            dreamEntryId,
            createdAt:        now,
            updatedAt:        now,
          },
          { merge: true }
        );
        termMappingsWritten++;
      }

      for (const value of (mapping.cash4Numbers ?? [])) {
        const docId = [ownerUid, termLabel, value, 'cash4'].join('__').replace(/[^a-zA-Z0-9_-]/g, '_');
        await db.collection('termNumberMappings').doc(docId).set(
          {
            ownerUid,
            termLabel,
            number:           value,
            gameType:         'cash4',
            source:           'parsed',
            confidenceBasis:  `current-dream:${dreamDate}`,
            rawContext:       rawText.slice(0, 500),
            dreamEntryId,
            createdAt:        now,
            updatedAt:        now,
          },
          { merge: true }
        );
        termMappingsWritten++;
      }
    }

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
