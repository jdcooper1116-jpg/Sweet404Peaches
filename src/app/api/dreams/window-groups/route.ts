import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnerUid } from '@/lib/firebase/admin';
import { listActiveDreamWindows } from '@/lib/storage/dreamWindows';
import { getDreamDbProvider } from '@/lib/storage/provider';
import {
  loadProofIndexes,
  enrichWindowsWithProof,
  type ProofScope,
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
    const proofScopeRaw  = (params.get('proofScope') ?? 'personal').trim();
    const proofScope: ProofScope = (proofScopeRaw === 'universal' || proofScopeRaw === 'both')
      ? proofScopeRaw : 'personal';  // default to personal for backward compat
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
        const indexes = await loadProofIndexes(
          ownerUid,
          // Universal/both always loads all dreamers; personal can be dreamer-scoped.
          // When proofScope=personal AND a dreamerFilter is set, limit index to that dreamer.
          // Universal needs the full cross-dreamer set regardless.
          proofScope === 'personal' ? (dreamerIdFilter || undefined) : undefined,
          5000
        );
        proofStats.proofIndexSize = indexes.personal.size + indexes.universal.size;
        enrichWindowsWithProof(allWindows, indexes, proofScope);

        // Rebuild group proof ONLY from exact enriched window rows.
        // This prevents a group from being marked proven when no actual window is proven.
        const groupProof = new Map<string, any>();

        for (const w of allWindows as any[]) {
          const personal = Boolean(w.personalHasFellBefore);
          const universal = Boolean(w.universalHasFellBefore);
          if (!personal && !universal) continue;

          const entryId = String(w.dreamEntryId ?? w.sourceDreamEntryId ?? 'missing');
          const key = `${String(w.dreamerId ?? 'unknown')}__${entryId}`;

          if (!groupProof.has(key)) {
            groupProof.set(key, {
              personalHitCount: 0,
              personalStraightCount: 0,
              personalBoxedCount: 0,
              personalLastHitDate: '',
              personalStates: new Set<string>(),
              personalSources: new Set<string>(),
              personalWindowCount: 0,

              universalHitCount: 0,
              universalStraightCount: 0,
              universalBoxedCount: 0,
              universalLastHitDate: '',
              universalStates: new Set<string>(),
              universalSources: new Set<string>(),
              universalDreamerIds: new Set<string>(),
              universalDreamerNames: new Set<string>(),
              universalWindowCount: 0,
            });
          }

          const acc = groupProof.get(key);

          if (personal) {
            acc.personalHitCount += Number(w.personalFellBeforeHitCount ?? 0);
            acc.personalStraightCount += Number(w.personalStraightCount ?? 0);
            acc.personalBoxedCount += Number(w.personalBoxedCount ?? 0);
            acc.personalWindowCount += 1;

            const last = String(w.personalLastHitDate ?? '');
            if (last && last > acc.personalLastHitDate) acc.personalLastHitDate = last;

            for (const s of (Array.isArray(w.personalStatesWithHits) ? w.personalStatesWithHits : [])) {
              if (s) acc.personalStates.add(String(s));
            }
            for (const s of (Array.isArray(w.personalSourceClasses) ? w.personalSourceClasses : [])) {
              if (s) acc.personalSources.add(String(s));
            }
          }

          if (universal) {
            acc.universalHitCount += Number(w.universalFellBeforeHitCount ?? 0);
            acc.universalStraightCount += Number(w.universalStraightCount ?? 0);
            acc.universalBoxedCount += Number(w.universalBoxedCount ?? 0);
            acc.universalWindowCount += 1;

            const last = String(w.universalLastHitDate ?? '');
            if (last && last > acc.universalLastHitDate) acc.universalLastHitDate = last;

            for (const s of (Array.isArray(w.universalStatesWithHits) ? w.universalStatesWithHits : [])) {
              if (s) acc.universalStates.add(String(s));
            }
            for (const s of (Array.isArray(w.universalSourceClasses) ? w.universalSourceClasses : [])) {
              if (s) acc.universalSources.add(String(s));
            }
            for (const id of (Array.isArray(w.universalProofDreamerIds) ? w.universalProofDreamerIds : [])) {
              if (id) acc.universalDreamerIds.add(String(id));
            }
            for (const name of (Array.isArray(w.universalProofDreamerNames) ? w.universalProofDreamerNames : [])) {
              if (name) acc.universalDreamerNames.add(String(name));
            }
          }
        }

        const sourceLabel = (sources: string[]) => {
          const backtest = sources.some((s) => s.includes('backtest'));
          const live = sources.some((s) => s.includes('live'));
          if (backtest && live) return 'Backtest + Live Proven';
          if (backtest) return 'Backtest Proven';
          if (live) return 'Live Proven';
          return 'Proven';
        };

        for (const g of groups as any[]) {
          const key = `${String(g.dreamerId ?? 'unknown')}__${String(g.dreamEntryId ?? 'missing')}`;
          const acc = groupProof.get(key);

          if (!acc) {
            Object.assign(g, {
              personalHasFellBefore: false,
              personalFellBeforeHitCount: 0,
              personalStraightCount: 0,
              personalBoxedCount: 0,
              personalLastHitDate: '',
              personalStatesWithHits: [],
              personalSourceClasses: [],
              personalProofLabel: '',
              personalProvenWindowCount: 0,

              universalHasFellBefore: false,
              universalFellBeforeHitCount: 0,
              universalStraightCount: 0,
              universalBoxedCount: 0,
              universalLastHitDate: '',
              universalStatesWithHits: [],
              universalSourceClasses: [],
              universalProofDreamerIds: [],
              universalProofDreamerNames: [],
              universalProofDreamerCount: 0,
              universalProofLabel: '',
              universalProvenWindowCount: 0,

              hasFellBefore: false,
              fellBeforeHitCount: 0,
              straightCount: 0,
              boxedCount: 0,
              stateStrengthScore: 0,
              lastHitDate: '',
              statesWithHits: [],
              sourceClasses: [],
              proofLabel: '',
              proofEventCount: 0,
              proofScope,
            });
            continue;
          }

          const personalSources = Array.from(acc.personalSources).map(String);
          const universalSources = Array.from(acc.universalSources).map(String);
          const universalDreamerIds = Array.from(acc.universalDreamerIds).map(String);

          const personal = acc.personalHitCount > 0;
          const universal = acc.universalHitCount > 0;
          const universalFromOther = universalDreamerIds.some((id) => id !== String(g.dreamerId ?? ''));

          const personalLabel = personal ? sourceLabel(personalSources) : '';
          const universalLabel = universal ? (universalFromOther ? 'Universal Proven' : sourceLabel(universalSources)) : '';

          const combinedLabel = personal && universal && universalFromOther
            ? 'Personal + Universal Proven'
            : personal
              ? personalLabel
              : universal
                ? universalLabel
                : '';

          Object.assign(g, {
            personalHasFellBefore: personal,
            personalFellBeforeHitCount: acc.personalHitCount,
            personalStraightCount: acc.personalStraightCount,
            personalBoxedCount: acc.personalBoxedCount,
            personalLastHitDate: acc.personalLastHitDate,
            personalStatesWithHits: Array.from(acc.personalStates),
            personalSourceClasses: personalSources,
            personalProofLabel: personalLabel,
            personalProvenWindowCount: acc.personalWindowCount,

            universalHasFellBefore: universal,
            universalFellBeforeHitCount: acc.universalHitCount,
            universalStraightCount: acc.universalStraightCount,
            universalBoxedCount: acc.universalBoxedCount,
            universalLastHitDate: acc.universalLastHitDate,
            universalStatesWithHits: Array.from(acc.universalStates),
            universalSourceClasses: universalSources,
            universalProofDreamerIds: universalDreamerIds,
            universalProofDreamerNames: Array.from(acc.universalDreamerNames),
            universalProofDreamerCount: universalDreamerIds.length,
            universalProofLabel: universalLabel,
            universalProvenWindowCount: acc.universalWindowCount,

            hasFellBefore: personal || universal,
            fellBeforeHitCount: personal ? acc.personalHitCount : acc.universalHitCount,
            straightCount: personal ? acc.personalStraightCount : acc.universalStraightCount,
            boxedCount: personal ? acc.personalBoxedCount : acc.universalBoxedCount,
            stateStrengthScore: (personal ? acc.personalBoxedCount + acc.personalStraightCount * 3 : 0)
              + (!personal && universal ? acc.universalBoxedCount + acc.universalStraightCount * 3 : 0),
            lastHitDate: [acc.personalLastHitDate, acc.universalLastHitDate].filter(Boolean).sort().pop() ?? '',
            statesWithHits: Array.from(new Set([...acc.personalStates, ...acc.universalStates])),
            sourceClasses: Array.from(new Set([...personalSources, ...universalSources])),
            proofLabel: combinedLabel,
            proofEventCount: personal ? acc.personalHitCount : acc.universalHitCount,
            proofScope,
          });
        }
        // Final consistency pass:
        // A group/window is proven only if personal OR universal proof is explicitly true.
        // This prevents stale compatibility fields from marking a group proven when
        // no real active-window row matched proof.
        for (const w of allWindows as any[]) {
          const personal = Boolean(w.personalHasFellBefore);
          const universal = Boolean(w.universalHasFellBefore);

          w.hasFellBefore = personal || universal;
          if (!w.hasFellBefore) {
            w.fellBeforeHitCount = 0;
            w.straightCount = 0;
            w.boxedCount = 0;
            w.stateStrengthScore = 0;
            w.lastHitDate = '';
            w.statesWithHits = [];
            w.sourceClasses = [];
            w.proofLabel = '';
            w.proofEventCount = 0;
          }
        }

        for (const g of groups as any[]) {
          const personal = Boolean(g.personalHasFellBefore);
          const universal = Boolean(g.universalHasFellBefore);

          g.hasFellBefore = personal || universal;
          if (!g.hasFellBefore) {
            g.fellBeforeHitCount = 0;
            g.straightCount = 0;
            g.boxedCount = 0;
            g.stateStrengthScore = 0;
            g.lastHitDate = '';
            g.statesWithHits = [];
            g.sourceClasses = [];
            g.proofLabel = '';
            g.proofEventCount = 0;
            g.personalProvenWindowCount = 0;
            g.universalProvenWindowCount = 0;
          }
        }

        proofStats.provenWindows        = allWindows.filter((w: any) => w.personalHasFellBefore || w.universalHasFellBefore).length;
        proofStats.provenGroups         = groups.filter((g: any) => g.personalHasFellBefore || g.universalHasFellBefore).length;
        (proofStats as any).personalProvenWindows  = allWindows.filter((w: any) => w.personalHasFellBefore).length;
        (proofStats as any).universalProvenWindows = allWindows.filter((w: any) => w.universalHasFellBefore).length;
        (proofStats as any).personalProvenGroups   = groups.filter((g: any) => g.personalHasFellBefore).length;
        (proofStats as any).universalProvenGroups  = groups.filter((g: any) => g.universalHasFellBefore).length;
        (proofStats as any).proofScope             = proofScope;
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
        proofScope,
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
