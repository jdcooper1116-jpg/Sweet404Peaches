import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnerUid } from '@/lib/firebase/admin';
import { listActiveDreamWindows } from '@/lib/storage/dreamWindows';

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

      g.lastHitCount += Number(w.lastHitCount ?? 0);
      g.newHitsSinceLastCheck += Number(w.newHitsSinceLastCheck ?? 0);

      if (w.lastCheckedAt && (!g.lastCheckedAt || String(w.lastCheckedAt) > String(g.lastCheckedAt))) {
        g.lastCheckedAt = w.lastCheckedAt;
      }
    }

    const groups = Array.from(groupMap.values())
      .sort((a, b) => String(b.dreamDate ?? '').localeCompare(String(a.dreamDate ?? '')));

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
      },
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
