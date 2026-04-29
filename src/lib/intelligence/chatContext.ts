/**
 * src/lib/intelligence/chatContext.ts
 *
 * Shared data loader for the Sigil & Slumber Intelligence Chat.
 * Loads all context via server-side Admin routes — no client Firestore reads.
 *
 * Used by:
 *   - src/app/chat/page.tsx (full chat)
 *   - src/components/chat/GlobalChatDock.tsx (quick dock)
 */

export type ChatContext = {
  // Raw data arrays (quota-capped)
  windows:        any[];   // activeDreamWindows (active-only, limit 50)
  hits:           any[];   // dreamHits (limit 30)
  mappings:       any[];   // personalHitMappings / fell-before (limit 100)
  dreamers:       any[];   // dreamer profiles (limit 100)
  backtests:      any[];   // backtestDreams with joined summaries
  pinnedPlays:    any[];
  engineStatus:   any | null;
  ownerDisplayName: string;
  loadedAt:       string;
  ownerUid:       string;
  // Derived intelligence summary (from universalScope helper on capped data)
  scopeBundle:    ScopeBundle | null;
  // Legacy fields kept for chatAnswering.ts backward compat
  dreams:         any[];
  dictionaryTerms:any[];
};

/** Lightweight intelligence summary for chat context */
export type ScopeBundle = {
  activeWindows:   number;
  activeDreamers:  number;
  watchItems:      number;
  repeatedTerms:   string[];    // top 5 converging term labels
  topNumbers:      string[];    // top 5 number::gameType with evidence
  topStates:       string[];    // top 5 states with fell-before support
  pinnedCount:     number;
  suggestedCount:  number;
  recentHitCount:  number;
  topFocusTier:    string;      // e.g. "Strong Focus" if any exist
};

export const EMPTY_CONTEXT: ChatContext = {
  dreams: [], windows: [], hits: [], mappings: [], dictionaryTerms: [],
  dreamers: [], backtests: [], pinnedPlays: [], engineStatus: null,
  ownerDisplayName: '', loadedAt: '', ownerUid: '', scopeBundle: null,
};

/**
 * Load all data sources in parallel. Any individual fetch failure is caught
 * and silently replaced with an empty array so the chat degrades gracefully.
 */
export async function loadChatContext(ownerUid: string): Promise<ChatContext> {
  const uid = encodeURIComponent(ownerUid);

  const safe = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try { return await promise; } catch { return fallback; }
  };

  const fetchJson = async (url: string) => {
    const res  = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    return data.ok ? data : {};
  };

  // Quota-safe capped fetches — no unbounded reads
  const [windowsD, hitsD, mappingsD, dreamersD, backtestsD, pinsD, engineD, profileD] =
    await Promise.all([
      safe(fetchJson(`/api/dreams/windows?ownerUid=${uid}&limit=50`),          {}),
      safe(fetchJson(`/api/dreams/hits?ownerUid=${uid}&limit=30`),              {}),
      safe(fetchJson(`/api/fell-before?ownerUid=${uid}&limit=100`),             {}),
      safe(fetchJson(`/api/dreamers?ownerUid=${uid}&limit=100`),                {}),
      safe(fetchJson(`/api/backtest/list-dreams?ownerUid=${uid}`),              {}),
      safe(fetchJson(`/api/pinned-plays?ownerUid=${uid}`),                      {}),
      safe(fetchJson('/api/engine/status'),                                     {}),
      safe(fetchJson(`/api/owner-profile?ownerUid=${uid}`),                     {}),
    ]);

  const windows      = windowsD.windows  ?? [];
  const hits         = hitsD.hits        ?? [];
  const mappings     = mappingsD.rows    ?? [];
  const dreamers     = dreamersD.dreamers ?? [];
  const backtests    = backtestsD.dreams ?? [];
  const pinnedPlays  = pinsD.plays       ?? [];
  const ownerDisplayName = profileD.profile?.displayName ?? '';

  // Build lightweight scope bundle from capped data
  const scopeBundle = buildScopeBundleFromData(windows, mappings, hits, pinnedPlays);

  return {
    ownerUid,
    ownerDisplayName,
    dreams:          [],          // deprecated — not fetched to save quota
    windows,
    hits,
    mappings,
    dictionaryTerms: [],          // not fetched to save quota; use scopeBundle instead
    dreamers,
    backtests,
    pinnedPlays,
    engineStatus:    engineD.is_current !== undefined ? engineD : null,
    scopeBundle,
    loadedAt:        new Date().toISOString(),
  };
}

// ─── Internal scope bundle builder (for chat context) ─────────────────────────

function buildScopeBundleFromData(
  windows:   any[],
  mappings:  any[],
  hits:      any[],
  pinned:    any[]
): ScopeBundle | null {
  if (!windows.length && !mappings.length && !hits.length) return null;

  const today         = new Date().toISOString().slice(0, 10);
  const activeWindows = windows.filter(w => (w.activeEnd ?? '') >= today);
  const dreamerIds    = new Set(activeWindows.map((w: any) => w.dreamerId ?? 'owner-self'));

  // Top converging terms (from active windows termMap)
  const termCount = new Map<string, number>();
  for (const w of activeWindows) {
    if (w.termLabel) termCount.set(w.termLabel, (termCount.get(w.termLabel) ?? 0) + 1);
  }
  const repeatedTerms = Array.from(termCount.entries())
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // Top numbers with fell-before (from mappings)
  const numHits = new Map<string, number>();
  for (const m of mappings) {
    const k = `${m.number ?? ''}::${m.gameType ?? ''}`;
    if (m.number) numHits.set(k, (numHits.get(k) ?? 0) + Number(m.hitCount ?? 1));
  }
  const topNumbers = Array.from(numHits.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);

  // Top states
  const stateHits = new Map<string, number>();
  for (const m of mappings) {
    if (m.state) stateHits.set(m.state, (stateHits.get(m.state) ?? 0) + Number(m.hitCount ?? 1));
  }
  const topStates = Array.from(stateHits.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);

  const pinnedCount    = pinned.filter((p: any) => p.status === 'pinned').length;
  const suggestedCount = pinned.filter((p: any) => p.status === 'suggested').length;
  const watchItems     = activeWindows.reduce((s: number, w: any) =>
    s + (Array.isArray(w.cash3Numbers) ? w.cash3Numbers.length : 0) +
        (Array.isArray(w.cash4Numbers) ? w.cash4Numbers.length : 0), 0);

  // Estimate focus tier from convergence signals
  const hasMultiTerm   = repeatedTerms.length > 0;
  const hasFellBefore  = topNumbers.length > 0;
  const topFocusTier   = hasMultiTerm && hasFellBefore ? 'Strong Focus'
    : hasFellBefore ? 'Moderate Focus'
    : activeWindows.length > 0 ? 'Watchlist'
    : 'No active signals';

  return {
    activeWindows: activeWindows.length,
    activeDreamers: dreamerIds.size,
    watchItems,
    repeatedTerms,
    topNumbers,
    topStates,
    pinnedCount,
    suggestedCount,
    recentHitCount: hits.length,
    topFocusTier,
  };
}
