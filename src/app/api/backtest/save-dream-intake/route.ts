import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export const maxDuration = 60;

function adminDb() {
  if (!getApps().length) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId) {
      throw new Error(
        'Firebase project id is missing. Set FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
      );
    }

    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
    } else {
      initializeApp({ projectId });
    }
  }

  return getFirestore();
}

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid = String(body.ownerUid || '');
    const displayName = String(body.displayName || 'Sweet404Peaches');
    const email = String(body.email || '');
    const dreamDate = String(body.dreamDate || '');
    const rawText = String(body.rawText || '');
    const source = String(body.source || 'historical-intake');
    const confidence = String(body.confidence || 'high');
    const notes = String(body.notes || '');
    const parseResult = body.parseResult || {};

    if (!ownerUid) {
      return NextResponse.json({ ok: false, error: 'ownerUid is required.' }, { status: 400 });
    }

    if (!dreamDate) {
      return NextResponse.json({ ok: false, error: 'dreamDate is required.' }, { status: 400 });
    }

    if (!rawText.trim()) {
      return NextResponse.json({ ok: false, error: 'rawText is required.' }, { status: 400 });
    }

    const db = adminDb();
    const now = Timestamp.now();

    const cash3Numbers = Array.isArray(parseResult.cash3Numbers) ? parseResult.cash3Numbers : [];
    const cash4Numbers = Array.isArray(parseResult.cash4Numbers) ? parseResult.cash4Numbers : [];
    const archivedNumbers = Array.isArray(parseResult.archivedNumbers) ? parseResult.archivedNumbers : [];
    const parsedTermMappings = Array.isArray(parseResult.termMappings) ? parseResult.termMappings : [];

    const activeWindowStart = dreamDate;
    const activeWindowEnd = addDays(dreamDate, 6);

    const dreamRef = db.collection('backtestDreams').doc();
    const backtestDreamId = dreamRef.id;

    await db.collection('ownerProfiles').doc(ownerUid).set(
      {
        ownerUid,
        displayName,
        email,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );

    const dreamDoc = {
      ownerUid,
      backtestDreamId,
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
      status: 'intake-saved',
      replaySource: '',
      createdAt: now,
      updatedAt: now,
    };

    await dreamRef.set(dreamDoc, { merge: true });

    await db.collection('backtestWindows').doc(backtestDreamId).set(
      {
        ownerUid,
        backtestDreamId,
        dreamDate,
        activeWindowStart,
        activeWindowEnd,
        lookaheadDays: 7,
        cash3Numbers,
        cash4Numbers,
        status: 'intake-saved',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const batch = db.batch();

    for (const mapping of parsedTermMappings) {
      const term = String(mapping.term || '').trim();
      if (!term) continue;

      const normalizedTerm = normalizeTerm(term);
      const docId = [ownerUid, normalizedTerm, backtestDreamId].map(safeId).join('__');

      batch.set(
        db.collection('termNumberMappings').doc(docId),
        {
          ownerUid,
          backtestDreamId,
          dreamDate,
          term,
          normalizedTerm,
          cash3Numbers: Array.isArray(mapping.cash3Numbers) ? mapping.cash3Numbers : [],
          cash4Numbers: Array.isArray(mapping.cash4Numbers) ? mapping.cash4Numbers : [],
          source: 'historical-dream-intake',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      backtestDreamId,
      dream: {
        id: backtestDreamId,
        ...dreamDoc,
      },
    });
  } catch (err) {
    console.error('save-dream-intake failed:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save dream intake.',
      },
      { status: 500 }
    );
  }
}
