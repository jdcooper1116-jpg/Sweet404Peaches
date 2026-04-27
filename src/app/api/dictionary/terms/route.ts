/**
 * GET  /api/dictionary/terms?ownerUid=...&dreamerId=...&source=...&limit=...
 * POST /api/dictionary/terms  { ownerUid, termLabel, number, gameType, ... }
 *
 * v25.2 — handles both Firestore document shapes in termNumberMappings:
 *
 *   Shape A (flat/manual):
 *     { termLabel, number, gameType, ... }
 *     → emits one row
 *
 *   Shape B (parsed from dream/backtest intake):
 *     { term, cash3Numbers: [...], cash4Numbers: [...], ... }
 *     → emits one row per number in cash3Numbers (gameType="cash3")
 *       + one row per number in cash4Numbers (gameType="cash4")
 *
 * Hit join is dreamer-scoped:
 *   key = `${dreamerId}::${termLabel}::${number}::${gameType}`
 *   When dreamerId param provided → personalHitMappings filtered to that dreamer.
 *   When no dreamerId            → all dreamers fetched, joined by their own dreamerId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, resolveOwnerUid } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ─── Shape-normalisation helper ───────────────────────────────────────────────

type FlatRow = {
  sourceDocId:        string;
  ownerUid:           string;
  termLabel:          string;
  normalizedTerm:     string;
  number:             string;
  gameType:           string;
  source:             string;
  dreamerId:          string;
  dreamerName:        string;
  dreamDate:          string;
  sourceDreamEntryId: string;
  backtestDreamId:    string;
  confidenceBasis:    string;
  rawContext:         string;
  createdAt:          string | null;
  updatedAt:          string | null;
};

/**
 * Expand one Firestore document into one or more flat rows — one per number.
 * Handles both the flat manual shape and the parsed array shape.
 */
function expandDoc(docId: string, data: Record<string, any>, ownerUid: string): FlatRow[] {
  const termLabel      = String(data.termLabel ?? data.term ?? '').trim();
  const normalizedTerm = String(data.normalizedTerm ?? termLabel).toLowerCase().trim();
  const dreamerId      = String(data.dreamerId  ?? 'owner-self');
  const dreamerName    = String(data.dreamerName ?? '');
  const source         = String(data.source      ?? 'parsed');
  const dreamDate      = String(data.dreamDate   ?? '');
  const sourceDreamEntryId = String(data.sourceDreamEntryId ?? data.dreamEntryId ?? '');
  const backtestDreamId    = String(data.backtestDreamId    ?? '');
  const confidenceBasis    = String(data.confidenceBasis    ?? '');
  const rawContext          = String(data.rawContext         ?? '');
  const createdAt = data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null;
  const updatedAt = data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? null;

  const base = {
    sourceDocId: docId,
    ownerUid: data.ownerUid ?? ownerUid,
    termLabel,
    normalizedTerm,
    source,
    dreamerId,
    dreamerName,
    dreamDate,
    sourceDreamEntryId,
    backtestDreamId,
    confidenceBasis,
    rawContext,
    createdAt,
    updatedAt,
  };

  // ── Shape A: flat row with number + gameType ──────────────────────────────
  const flatNumber   = String(data.number   ?? '').trim();
  const flatGameType = String(data.gameType ?? '').trim();

  if (flatNumber && flatGameType) {
    return [{ ...base, number: flatNumber, gameType: flatGameType }];
  }

  // ── Shape B: parsed arrays ────────────────────────────────────────────────
  const rows: FlatRow[] = [];

  const cash3 = Array.isArray(data.cash3Numbers) ? data.cash3Numbers : [];
  const cash4 = Array.isArray(data.cash4Numbers) ? data.cash4Numbers : [];

  for (const n of cash3) {
    const num = String(n ?? '').trim();
    if (num) rows.push({ ...base, number: num, gameType: 'cash3' });
  }
  for (const n of cash4) {
    const num = String(n ?? '').trim();
    if (num) rows.push({ ...base, number: num, gameType: 'cash4' });
  }

  // ── Shape C: has termLabel but no numbers (dictionary-only term, no numbers yet)
  // Emit a placeholder row so the term is still visible in the dictionary.
  if (rows.length === 0 && termLabel) {
    rows.push({ ...base, number: '', gameType: '' });
  }

  return rows;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const params    = req.nextUrl.searchParams;
    const ownerUid  = resolveOwnerUid(params.get('ownerUid'));
    const dreamerId = params.get('dreamerId') ?? '';
    const source    = params.get('source')    ?? '';
    const maxDocs   = Math.min(Number(params.get('limit') ?? 2000), 5000);

    const db = getAdminDb();

    // termNumberMappings query.
    // dreamerId is NOT applied here — older docs may lack the field entirely.
    // expandDoc() assigns fallback dreamerId = "owner-self", so in-memory
    // filtering (below) correctly matches those legacy rows.
    let tmQuery = db
      .collection('termNumberMappings')
      .where('ownerUid', '==', ownerUid);

    if (source) tmQuery = tmQuery.where('source', '==', source) as any;

    // personalHitMappings query — dreamer-scoped when dreamerId provided
    let hitQuery = db
      .collection('personalHitMappings')
      .where('ownerUid', '==', ownerUid);

    if (dreamerId) {
      hitQuery = hitQuery.where('dreamerId', '==', dreamerId) as any;
    }

    const [tmSnap, hitSnap] = await Promise.all([
      (tmQuery as any).limit(maxDocs).get(),
      hitQuery.get(),
    ]);

    // Hit lookup — key includes dreamerId so hits are never shared across dreamers
    // key: "dreamerId::termLabel::number::gameType"
    const hitMap = new Map<string, number>();
    for (const doc of hitSnap.docs) {
      const d   = doc.data();
      const did = String(d.dreamerId || 'owner-self');
      const num = String(d.number    || '');
      const gt  = String(d.gameType  || '');
      const tl  = String(d.termLabel || '');
      if (!num || !gt || !tl) continue;
      const key = `${did}::${tl}::${num}::${gt}`;
      hitMap.set(key, (hitMap.get(key) ?? 0) + (Number(d.hitCount) || 1));
    }

    // Expand all documents into flat rows, then apply dreamerId filter in-memory.
    // In-memory filter is correct because expandDoc() assigns the "owner-self"
    // fallback for legacy docs that never stored dreamerId — a Firestore
    // .where("dreamerId", "==", ...) query would exclude those docs entirely.
    const terms: Array<FlatRow & { hasHit: boolean; hitCount: number }> = [];

    for (const doc of tmSnap.docs) {
      const expanded = expandDoc(doc.id, doc.data() as Record<string, any>, ownerUid);
      for (const row of expanded) {
        // Apply dreamer filter in-memory after fallback assignment
        if (dreamerId && row.dreamerId !== dreamerId) continue;

        const hitKey = row.number && row.gameType
          ? `${row.dreamerId}::${row.termLabel}::${row.number}::${row.gameType}`
          : '';
        const hc = hitKey ? (hitMap.get(hitKey) ?? 0) : 0;
        terms.push({ ...row, hasHit: hc > 0, hitCount: hc });
      }
    }

    // Sort: hits first → hitCount desc → termLabel alpha → number
    terms.sort((a, b) => {
      if (a.hasHit !== b.hasHit)      return b.hasHit ? 1 : -1;
      if (b.hitCount !== a.hitCount)  return b.hitCount - a.hitCount;
      const tCmp = a.termLabel.localeCompare(b.termLabel);
      if (tCmp !== 0) return tCmp;
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });

    return NextResponse.json({ ok: true, terms, count: terms.length });
  } catch (err) {
    console.error('[api/dictionary/terms GET] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load dictionary terms.' },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
// Unchanged from v25.1 — always writes flat shape (one row per number).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ownerUid    = String(body.ownerUid    || '').trim();
    const termLabel   = String(body.termLabel   || body.term || '').trim();
    const number      = String(body.number      || '').trim();
    const gameType    = String(body.gameType    || 'cash3').trim();
    const source      = String(body.source      || 'manual').trim();
    const dreamerId   = String(body.dreamerId   || '').trim();
    const dreamerName = String(body.dreamerName || '').trim();
    const note        = String(body.note        || body.rawContext || '').trim();
    const dreamDate   = String(body.dreamDate   || '').trim();
    const sourceDreamEntryId = String(body.sourceDreamEntryId || body.dreamEntryId || '').trim();
    const backtestDreamId    = String(body.backtestDreamId    || '').trim();

    if (!ownerUid)  return NextResponse.json({ ok: false, error: 'ownerUid is required.'  }, { status: 400 });
    if (!termLabel) return NextResponse.json({ ok: false, error: 'termLabel is required.' }, { status: 400 });
    if (!number)    return NextResponse.json({ ok: false, error: 'number is required.'    }, { status: 400 });
    if (!gameType)  return NextResponse.json({ ok: false, error: 'gameType is required.'  }, { status: 400 });

    // Validate digit count — number stored as string, leading zeros preserved
    if (gameType === 'cash3' && !/^\d{3}$/.test(number)) {
      return NextResponse.json(
        { ok: false, error: `Invalid cash3 number "${number}". Must be exactly 3 digits (e.g. "089").` },
        { status: 400 }
      );
    }
    if (gameType === 'cash4' && !/^\d{4}$/.test(number)) {
      return NextResponse.json(
        { ok: false, error: `Invalid cash4 number "${number}". Must be exactly 4 digits (e.g. "0891").` },
        { status: 400 }
      );
    }

    const db  = getAdminDb();
    const now = Timestamp.now();

    // Deterministic doc ID — includes dreamerId so two dreamers get separate docs
    const docId = [ownerUid, dreamerId || 'shared', termLabel, number, gameType]
      .map(v => String(v).replace(/[^a-zA-Z0-9_-]/g, '_'))
      .join('__');

    const payload: Record<string, unknown> = {
      ownerUid,
      termLabel,
      normalizedTerm: termLabel.toLowerCase().trim(),
      number,
      gameType,
      source,
      createdAt: now,
      updatedAt: now,
    };

    if (dreamerId)          payload.dreamerId          = dreamerId;
    if (dreamerName)        payload.dreamerName        = dreamerName;
    if (note)               payload.rawContext         = note;
    if (note)               payload.confidenceBasis    = note;
    if (dreamDate)          payload.dreamDate          = dreamDate;
    if (sourceDreamEntryId) payload.sourceDreamEntryId = sourceDreamEntryId;
    if (backtestDreamId)    payload.backtestDreamId    = backtestDreamId;

    await db.collection('termNumberMappings').doc(docId).set(payload, { merge: true });

    return NextResponse.json({ ok: true, id: docId, termLabel, number, gameType });
  } catch (err) {
    console.error('[api/dictionary/terms POST] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to save dictionary term.' },
      { status: 500 }
    );
  }
}
