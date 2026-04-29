/**
 * src/lib/intelligence/communityDisplay.ts
 *
 * Pure helper for display-only dreamer identity management.
 * Does NOT change stored data. Does NOT anonymize database fields.
 *
 * Display modes:
 *   'owner'        — full dreamer names (default for owner's own session)
 *   'community'    — Dreamer A, Dreamer B, Dreamer C (for sharing with a group)
 *   'presentation' — hides raw dream text, shows only terms/numbers/evidence
 */

export type DisplayMode = 'owner' | 'community' | 'presentation';

export type CommunityNameMap = Map<string, string>;  // dreamerId → "Dreamer A"

const LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

/**
 * Build a stable dreamer → "Dreamer A/B/C" mapping from a list of dreamer IDs.
 * Order is deterministic (sorted by dreamerId) so the same label
 * is always shown for the same dreamer within a session.
 */
export function buildCommunityNameMap(
  dreamerIds: string[],
  ownerSelfLabel = 'Dreamer (Owner)'
): CommunityNameMap {
  const map: CommunityNameMap = new Map();
  const sorted = [...dreamerIds].sort();
  let idx = 0;
  for (const id of sorted) {
    if (id === 'owner-self') {
      map.set(id, ownerSelfLabel);
    } else {
      map.set(id, `Dreamer ${LABELS[idx] ?? String(idx + 1)}`);
      idx++;
    }
  }
  return map;
}

/**
 * Resolve the display label for a dreamer given the current mode.
 *
 * @param dreamerId       - internal ID stored in Firestore
 * @param dreamerName     - actual display name
 * @param mode            - current display mode
 * @param communityMap    - result of buildCommunityNameMap() — pass when mode is 'community'
 * @param ownerDisplayName - owner profile displayName for owner-self fallback
 */
export function displayDreamerName(
  dreamerId:        string,
  dreamerName:      string,
  mode:             DisplayMode,
  communityMap?:    CommunityNameMap,
  ownerDisplayName?: string
): string {
  if (mode === 'community' && communityMap) {
    return communityMap.get(dreamerId) ?? 'Dreamer ?';
  }

  // owner / presentation modes — show real name
  if (dreamerId === 'owner-self' || !dreamerId) {
    return ownerDisplayName || dreamerName || 'Owner / Self';
  }
  return dreamerName || dreamerId;
}

/**
 * Whether dream text should be shown in this mode.
 * In presentation mode, raw dream text is hidden to protect privacy.
 */
export function shouldShowDreamText(mode: DisplayMode): boolean {
  return mode !== 'presentation';
}

/**
 * Whether individual dreamer names should be shown.
 * In community mode, actual names are hidden.
 */
export function shouldShowRealNames(mode: DisplayMode): boolean {
  return mode === 'owner';
}

/**
 * Helper to get a placeholder text when dream text is hidden.
 */
export function dreamTextPlaceholder(): string {
  return '[Dream text hidden in presentation mode]';
}

/**
 * Display label for a mode toggle button.
 */
export function modeSwitchLabel(current: DisplayMode): string {
  switch (current) {
    case 'owner':        return '👥 Switch to Community Mode';
    case 'community':    return '🎤 Switch to Presentation Mode';
    case 'presentation': return '👤 Back to Owner Mode';
  }
}

export function nextMode(current: DisplayMode): DisplayMode {
  switch (current) {
    case 'owner':        return 'community';
    case 'community':    return 'presentation';
    case 'presentation': return 'owner';
  }
}

export const MODE_LABELS: Record<DisplayMode, string> = {
  owner:        '👤 Full Names',
  community:    '👥 Community Mode',
  presentation: '🎤 Presentation Mode',
};
