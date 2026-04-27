/**
 * src/lib/intelligence/chatContext.ts
 *
 * Shared data loader for the Sweet404Peaches Intelligence Chat.
 * Loads all context via server-side Admin routes — no client Firestore reads.
 *
 * Used by:
 *   - src/app/chat/page.tsx (full chat)
 *   - src/components/chat/GlobalChatDock.tsx (quick dock)
 */

export type ChatContext = {
  dreams:         any[];   // dreamEntries
  windows:        any[];   // activeDreamWindows
  hits:           any[];   // dreamHits (current dreams)
  mappings:       any[];   // personalHitMappings (As They Fell Before)
  dictionaryTerms:any[];   // termNumberMappings (Universal Dictionary)
  dreamers:       any[];   // dreamer profiles
  backtests:      any[];   // backtestDreams with joined summaries
  pinnedPlays:    any[];
  engineStatus:   any | null;
  loadedAt:       string;
  ownerUid:       string;
};

export const EMPTY_CONTEXT: ChatContext = {
  dreams: [], windows: [], hits: [], mappings: [], dictionaryTerms: [],
  dreamers: [], backtests: [], pinnedPlays: [], engineStatus: null,
  loadedAt: '', ownerUid: '',
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

  const [dreamsD, windowsD, hitsD, mappingsD, dictD, dreamersD, backtestsD, pinsD, engineD] =
    await Promise.all([
      safe(fetchJson(`/api/dreams/entries?ownerUid=${uid}`),         {}),
      safe(fetchJson(`/api/dreams/windows?ownerUid=${uid}`),         {}),
      safe(fetchJson(`/api/dreams/hits?ownerUid=${uid}`),            {}),
      safe(fetchJson(`/api/fell-before?ownerUid=${uid}`),            {}),
      safe(fetchJson(`/api/dictionary/terms?ownerUid=${uid}`),       {}),
      safe(fetchJson(`/api/dreamers?ownerUid=${uid}`),               {}),
      safe(fetchJson(`/api/backtest/list-dreams?ownerUid=${uid}`),   {}),
      safe(fetchJson(`/api/pinned-plays?ownerUid=${uid}`),           {}),
      safe(fetchJson('/api/engine/status'),                          {}),
    ]);

  return {
    ownerUid,
    dreams:          dreamsD.entries       ?? [],
    windows:         windowsD.windows      ?? [],
    hits:            hitsD.hits            ?? [],
    mappings:        mappingsD.rows        ?? [],
    dictionaryTerms: dictD.terms           ?? [],
    dreamers:        dreamersD.dreamers    ?? [],
    backtests:       backtestsD.dreams     ?? [],
    pinnedPlays:     pinsD.plays           ?? [],
    engineStatus:    engineD.is_current !== undefined ? engineD : null,
    loadedAt:        new Date().toISOString(),
  };
}
