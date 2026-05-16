import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnerUid } from '@/lib/firebase/admin';
import { listActiveDreamWindows } from '@/lib/storage/dreamWindows';
import { getDreamDbProvider } from '@/lib/storage/provider';
import {
  loadProofIndex,
  enrichWindowsWithProof,
  enrichGroupsWithProof,
} from '@/lib/evidence/enrichActiveWindowsWithProof';

export const dynamic = 'force-dynamic';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429');
}

function isoDate(value: any): string | null {
  if (value instanceof Date) return value.toISOString();
  return value?.toDate?.()?.toISOString?.() ?? value ?? null;
}

function boxedKey(n: any): string {
  return String(n ?? '').split('').sort().join('');
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const ownerUid = resolveOwnerUid(params.get('ownerUid'));
    const dreamerIdFilter = (params.get('dreamerId') ?? '').trim();
    const dreamEntryIdFilter = (params.get('dreamEntryId') ?? '').trim();
    const includeExpired = params.get('includeExpired') === 'true';
    const includeProof   = params.get('includeProof')   === 'true';
    const maxPerDreamer = Math.min(Math.max(Number(params.get('limit') ?? 250), 1), 250);
    const today = new Date().toISOString().slice(0, 10);

    const warnings: string[] = [];
    const maxRows = dreamerIdFilter ? maxPerDreamer : 1000;

    let allWindows: any[] = (await listActiveDreamWindows(ownerUid, {
      dreamerId: dreamerIdFilter || undefined,
      dreamEntryId: dreamEntryIdFilter || undefined,
      includeExpired,
      limit: maxRows,
    })).map((data: any) => ({
      ...data,
      dreamerId: data.dreamerId ?? 'unknown',
      dreamerName: data.dreamerName ?? data.dreamerId ?? 'Unknown Dreamer',
      activeStart: data.activeStart ?? data.activeWindowStart ?? data.dreamDate ?? null,
      activeEnd: data.activeEnd ?? data.activeWindowEnd ?? null,
      createdAt: isoDate(data.createdAt),
      updatedAt: isoDate(data.updatedAt),
      lastCheckedAt: isoDate(data.lastCheckedAt),
    }));

    if (!includeExpired) {
      allWindows = allWindows.filter((w: any) => {
        const activeEnd = String(w.activeEnd ?? '');
        return !activeEnd || activeEnd >= today;
      });
    }

    if (allWindows.length >= maxRows) {
      warnings.push(
        dreamerIdFilter
          ? `Dreamer ${dreamerIdFilter} reached the ${maxRows} per-dreamer cap.`
          : `Returned ${maxRows} rows. More windows may exist; use dreamerId or dreamEntryId filters.`
      );
    }

    const groupMap = new Map<string, any>();

    for (const w of allWindows) {
      const entryId = String(w.dreamEntryId ?? w.sourceDreamEntryId ?? 'missing');
      const key = `${w.dreamerId ?? 'unknown'}__${entryId}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          dreamEntryId: entryId,
          dreamerId: w.dreamerId ?? 'unknown',
          dreamerName: w.dreamerName ?? 'Unknown Dreamer',
          dreamDate: w.dreamDate ?? w.activeStart ?? null,
          activeStart: w.activeStart ?? null,
          activeEnd: w.activeEnd ?? null,
          isActive: true,
          windowCount: 0,
          cash3Count: 0,
          cash4Count: 0,
          terms: [],
          numbers: [],
          boxedKeys: [],
          sampleWindows: [],
          proofWindows: [],
          lastCheckedAt: w.lastCheckedAt ?? null,
          lastHitCount: 0,
          newHitsSinceLastCheck: 0,
        });
      }

      const g = groupMap.get(key);
      g.windowCount += 1;

      if (w.gameType === 'cash3') g.cash3Count += 1;
      if (w.gameType === 'cash4') g.cash4Count += 1;

      if (w.termLabel && !g.terms.includes(w.termLabel)) g.terms.push(w.termLabel);
      if (w.number && !g.numbers.includes(w.number)) g.numbers.push(w.number);

      const bk = boxedKey(w.number);
      if (bk && !g.boxedKeys.includes(bk)) g.boxedKeys.push(bk);

      if (g.sampleWindows.length < 12) g.sampleWindows.push(w);
      g.proofWindows.push(w);

      g.lastHitCount += Number(w.lastHitCount ?? 0);
      g.newHitsSinceLastCheck += Number(w.newHitsSinceLastCheck ?? 0);

      if (w.lastCheckedAt && (!g.lastCheckedAt || String(w.lastCheckedAt) > String(g.lastCheckedAt))) {
        g.lastCheckedAt = w.lastCheckedAt;
      }
    }

    const groups = Array.from(groupMap.values())
      .sort((a, b) => String(b.dreamDate ?? '').localeCompare(String(a.dreamDate ?? '')));

    // ── Proof enrichment (opt-in via includeProof=true) ──────────────────────
    // Joins personal_hit_mappings evidence onto windows and groups.
    // Only runs in Postgres mode — Firebase mode has no personal_hit_mappings table.
    // One broad query loads all proof for the owner; then joins happen in-memory.
    let proofStats = {
      proofIndexSize: 0,
      provenWindows:  0,
      provenGroups:   0,
      provider:       getDreamDbProvider() as string,
    };
    if (includeProof && getDreamDbProvider() === 'postgres') {
      try {
        const proofIndex = await loadProofIndex(
          ownerUid,
          dreamerIdFilter || undefined,  // undefined = load all dreamers for cross-dreamer proof
          5000
        );
        proofStats.proofIndexSize = proofIndex.size;
        enrichWindowsWithProof(allWindows, proofIndex);

        // Group proof must be derived ONLY from exact matched active-window rows.
        // Do not synthesize term × number combinations at group level; that can
        // incorrectly label a group as proven when no actual window row matched.
        const proofByGroup = new Map<string, any>();

        for (const w of allWindows as any[]) {
          if (!w.hasFellBefore) continue;

          const entryId = String(w.dreamEntryId ?? w.sourceDreamEntryId ?? 'missing');
          const groupKey = `${String(w.dreamerId ?? 'unknown')}__${entryId}`;

          if (!proofByGroup.has(groupKey)) {
            proofByGroup.set(groupKey, {
              fellBeforeHitCount: 0,
              straightCount: 0,
              boxedCount: 0,
              stateStrengthScore: 0,
              lastHitDate: '',
              statesWithHits: new Set<string>(),
              sourceClasses: new Set<string>(),
              proofEventCount: 0,
              provenWindowCount: 0,
            });
          }

          const acc = proofByGroup.get(groupKey);
          acc.fellBeforeHitCount += Number(w.fellBeforeHitCount ?? 0);
          acc.straightCount += Number(w.straightCount ?? 0);
          acc.boxedCount += Number(w.boxedCount ?? 0);
          acc.stateStrengthScore += Number(w.stateStrengthScore ?? 0);
          acc.proofEventCount += Number(w.proofEventCount ?? w.fellBeforeHitCount ?? 0);
          acc.provenWindowCount += 1;

          for (const s of (Array.isArray(w.statesWithHits) ? w.statesWithHits : [])) {
            if (s) acc.statesWithHits.add(String(s));
          }

          for (const s of (Array.isArray(w.sourceClasses) ? w.sourceClasses : [])) {
            if (s) acc.sourceClasses.add(String(s));
          }

          const lhd = String(w.lastHitDate ?? '');
          if (lhd && lhd > acc.lastHitDate) acc.lastHitDate = lhd;
        }

        for (const g of groups as any[]) {
          const groupKey = `${String(g.dreamerId ?? 'unknown')}__${String(g.dreamEntryId ?? 'missing')}`;
          const acc = proofByGroup.get(groupKey);

          if (!acc) {
            g.hasFellBefore = false;
            g.fellBeforeHitCount = 0;
            g.straightCount = 0;
            g.boxedCount = 0;
            g.stateStrengthScore = 0;
            g.lastHitDate = '';
            g.statesWithHits = [];
            g.sourceClasses = [];
            g.proofLabel = '';
            g.proofEventCount = 0;
            g.provenWindowCount = 0;
            continue;
          }

          const sourceClasses = Array.from(acc.sourceClasses as Set<string>).map(String);
          const hasBacktest = sourceClasses.some((s) => s.includes('backtest'));
          const hasLive = sourceClasses.some((s) => s.includes('live'));

          g.hasFellBefore = acc.fellBeforeHitCount > 0;
          g.fellBeforeHitCount = acc.fellBeforeHitCount;
          g.straightCount = acc.straightCount;
          g.boxedCount = acc.boxedCount;
          g.stateStrengthScore = acc.stateStrengthScore;
          g.lastHitDate = acc.lastHitDate;
          g.statesWithHits = Array.from(acc.statesWithHits);
          g.sourceClasses = sourceClasses;
          g.proofLabel = hasBacktest && hasLive
            ? 'Backtest + Live Proven'
            : hasBacktest
              ? 'Backtest Proven'
              : hasLive
                ? 'Live Proven'
                : 'Proven';
          g.proofEventCount = acc.proofEventCount;
          g.provenWindowCount = acc.provenWindowCount;
        }

        proofStats.provenWindows = allWindows.filter((w: any) => w.hasFellBefore).length;
        proofStats.provenGroups  = groups.filter((g: any) => g.hasFellBefore).length;
      } catch (proofErr) {
        console.warn('[window-groups] proof enrichment failed (non-fatal):', proofErr);
      }
    }

    // proofWindows is internal-only; sampleWindows remains UI-safe.
    for (const g of groups as any[]) {
      delete g.proofWindows;
    }

    const dreamerBreakdown: Record<string, number> = {};
    const dreamEntryBreakdown: Record<string, number> = {};
    const gameTypeBreakdown: Record<string, number> = { cash3: 0, cash4: 0 };

    for (const w of allWindows) {
      const dreamerKey = String(w.dreamerName || w.dreamerId || 'unknown');
      const entryKey = String(w.dreamEntryId || w.sourceDreamEntryId || 'missing');
      dreamerBreakdown[dreamerKey] = (dreamerBreakdown[dreamerKey] || 0) + 1;
      dreamEntryBreakdown[entryKey] = (dreamEntryBreakdown[entryKey] || 0) + 1;
      if (w.gameType === 'cash3') gameTypeBreakdown.cash3 += 1;
      if (w.gameType === 'cash4') gameTypeBreakdown.cash4 += 1;
    }

    const capped = warnings.length > 0;

    return NextResponse.json({
      ok: true,
      groups,
      windows: allWindows,
      groupCount: groups.length,
      totalActiveWindows: allWindows.length,
      totalUniqueDreamers: Object.keys(dreamerBreakdown).length,
      totalUniqueDreamEntries: groups.length,
      totalCash3Windows: gameTypeBreakdown.cash3,
      totalCash4Windows: gameTypeBreakdown.cash4,
      dreamerBreakdown,
      dreamEntryBreakdown,
      gameTypeBreakdown,
      capped,
      capWarning: capped ? warnings.join(' ') : '',
      warnings,
      filters: {
        ownerUid,
        dreamerId: dreamerIdFilter || null,
        dreamEntryId: dreamEntryIdFilter || null,
        includeExpired,
        includeProof,
      },
      ...(includeProof ? { proofStats } : {}),
    });
  } catch (err) {
    console.error('[api/dreams/window-groups]', err);
    const q = isQuotaError(err);
    return NextResponse.json(
      {
        ok: false,
        quota: q,
        error: q
          ? 'Firebase quota exhausted. Try again later.'
          : err instanceof Error ? err.message : 'Failed.',
      },
      { status: q ? 429 : 500 }
    );
  }
}
