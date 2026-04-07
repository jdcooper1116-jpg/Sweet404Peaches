import type { ActiveDreamWindow, LotteryResult, HitType } from '@/lib/types';

export interface MatchedHit {
  windowId: string;
  dreamEntryId: string;
  dreamerId: string;
  dreamerName: string;
  termLabel: string;
  trackedNumber: string;
  winningResult: string;
  gameType: 'cash3' | 'cash4';
  state: string;
  drawTime: 'midday' | 'evening' | 'night' | 'unknown';
  drawDate: string;
  hitType: HitType;
  sameDay: boolean;
  daysFromDream: number;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function getBoxedKey(value: string): string {
  return value.split('').sort().join('');
}

export function detectHitType(
  trackedNumber: string,
  winningResult: string
): HitType | null {
  if (trackedNumber === winningResult) return 'straight';
  if (getBoxedKey(trackedNumber) === getBoxedKey(winningResult)) return 'boxed';
  return null;
}

export function matchActiveWindowsToResults(
  windows: ActiveDreamWindow[],
  results: LotteryResult[]
): MatchedHit[] {
  const matches: MatchedHit[] = [];

  for (const win of windows) {
    for (const result of results) {
      if (win.gameType !== result.gameType) continue;
      if (!win.statesTracked.includes(result.state)) continue;
      if (result.date < win.activeStart || result.date > win.activeEnd) continue;

      const hitType = detectHitType(win.number, result.normalizedResult);
      if (!hitType) continue;

      matches.push({
        windowId: win.id,
        dreamEntryId: win.dreamEntryId,
        dreamerId: win.dreamerId,
        dreamerName: win.dreamerName,
        termLabel: win.termLabel,
        trackedNumber: win.number,
        winningResult: result.normalizedResult,
        gameType: win.gameType,
        state: result.state,
        drawTime: result.drawTime,
        drawDate: result.date,
        hitType,
        sameDay: result.date === win.activeStart,
        daysFromDream: daysBetween(win.activeStart, result.date),
      });
    }
  }

  return matches.sort((a, b) => {
    if (a.drawDate !== b.drawDate) return b.drawDate.localeCompare(a.drawDate);
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.trackedNumber.localeCompare(b.trackedNumber);
  });
}
