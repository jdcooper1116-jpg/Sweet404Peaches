/**
 * src/lib/evidence/enrichActiveWindowsWithProof.ts  (E1.2)
 *
 * Two proof layers from ONE Postgres query:
 *
 * PERSONAL:  dreamerId::normalizedTerm::numberText::gameType
 *   "This dreamer has personally seen this number fall."
 *
 * UNIVERSAL: normalizedTerm::numberText::gameType  (all dreamers)
 *   "Somewhere in your dream system this number has fallen."
 *   Never re-attributes another dreamer's proof to the current window's dreamer.
 */

import { prisma } from '@/lib/db/postgres';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProofScope = 'personal' | 'universal' | 'both';

export interface ProofEntry {
  dreamerId: string; normalizedTerm: string; numberText: string; gameType: string;
  hitCount: number; straightCount: number; boxedCount: number; stateStrengthScore: number;
  lastHitDate: string; statesWithHits: string[]; sourceClasses: string[]; proofLabel: string;
}

export interface UniversalProofEntry {
  normalizedTerm: string; numberText: string; gameType: string;
  hitCount: number; straightCount: number; boxedCount: number; stateStrengthScore: number;
  lastHitDate: string; statesWithHits: string[]; sourceClasses: string[];
  dreamerIds: string[]; dreamerNames: string[]; dreamerCount: number; proofLabel: string;
}

export interface ProofIndexes {
  personal:  Map<string, ProofEntry>;
  universal: Map<string, UniversalProofEntry>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normTerm(t: string): string {
  return String(t ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

function srcLabel(sourceClasses: string[]): string {
  const bt = sourceClasses.some(s => s.includes('backtest'));
  const lv = sourceClasses.some(s => s.includes('live'));
  if (bt && lv) return 'Backtest + Live Proven';
  if (bt)       return 'Backtest Proven';
  if (lv)       return 'Live Proven';
  return 'Proven';
}

function combinedLabel(pHit: boolean, uHit: boolean, uFromOther: boolean, pSrc: string[], uSrc: string[]): string {
  if (pHit && uHit && uFromOther) return 'Personal + Universal Proven';
  if (pHit) return srcLabel(pSrc);
  if (uHit) return 'Universal Proven';
  return '';
}

function classifySrc(src: string): string {
  if (!src) return 'unknown';
  if (src.includes('backtest')) return 'backtest-replay';
  if (src.includes('live'))     return 'live-dream-refresh';
  if (src.includes('repair'))   return 'repair';
  return src;
}

// ─── Index loading ────────────────────────────────────────────────────────────

export async function loadProofIndexes(
  ownerUid:  string,
  dreamerId?: string,
  limit = 5000
): Promise<ProofIndexes> {
  const sel = {
    dreamerId: true, dreamerName: true,
    termLabel: true, normalizedTerm: true,
    numberText: true, gameType: true, state: true,
    hitCount: true, straightCount: true, boxedCount: true,
    stateStrengthScore: true, lastHitDate: true, source: true,
  } as const;

  const baseWhere = { ownerUid, isDeprecated: false, isShadowedByCorrectedMapping: false };

  const [personalRows, extraUniversalRows] = await Promise.all([
    prisma.personalHitMapping.findMany({ where: { ...baseWhere, ...(dreamerId ? { dreamerId } : {}) }, select: sel, take: limit }),
    dreamerId
      ? prisma.personalHitMapping.findMany({ where: baseWhere, select: sel, take: limit })
      : Promise.resolve(null),
  ]);

  const uRows = extraUniversalRows ?? personalRows;

  // ── Personal index ────────────────────────────────────────────────────────
  const personal = new Map<string, ProofEntry>();
  for (const row of personalRows) {
    const did  = String(row.dreamerId      ?? '');
    const nt   = String(row.normalizedTerm ?? normTerm(row.termLabel ?? ''));
    const num  = String(row.numberText     ?? '');  // string — leading zeros
    const gt   = String(row.gameType       ?? '');
    const st   = String(row.state          ?? '');
    const src  = classifySrc(String(row.source ?? ''));
    if (!did || !nt || !num || !gt) continue;
    const k = `${did}::${nt}::${num}::${gt}`;
    if (!personal.has(k)) personal.set(k, { dreamerId: did, normalizedTerm: nt, numberText: num, gameType: gt, hitCount: 0, straightCount: 0, boxedCount: 0, stateStrengthScore: 0, lastHitDate: '', statesWithHits: [], sourceClasses: [], proofLabel: '' });
    const e = personal.get(k)!;
    e.hitCount           += Number(row.hitCount           ?? 0);
    e.straightCount      += Number(row.straightCount      ?? 0);
    e.boxedCount         += Number(row.boxedCount         ?? 0);
    e.stateStrengthScore += Number(row.stateStrengthScore ?? 0);
    if (st  && !e.statesWithHits.includes(st))  e.statesWithHits.push(st);
    if (src && !e.sourceClasses.includes(src))  e.sourceClasses.push(src);
    const lhd = String(row.lastHitDate ?? '');
    if (lhd && lhd > e.lastHitDate) e.lastHitDate = lhd;
  }
  for (const e of personal.values()) e.proofLabel = srcLabel(e.sourceClasses);

  // ── Universal index ───────────────────────────────────────────────────────
  const universal = new Map<string, UniversalProofEntry>();
  for (const row of uRows) {
    const did   = String(row.dreamerId      ?? '');
    const dname = String(row.dreamerName    ?? '');
    const nt    = String(row.normalizedTerm ?? normTerm(row.termLabel ?? ''));
    const num   = String(row.numberText     ?? '');  // string — leading zeros
    const gt    = String(row.gameType       ?? '');
    const st    = String(row.state          ?? '');
    const src   = classifySrc(String(row.source ?? ''));
    if (!nt || !num || !gt) continue;
    const k = `${nt}::${num}::${gt}`;
    if (!universal.has(k)) universal.set(k, { normalizedTerm: nt, numberText: num, gameType: gt, hitCount: 0, straightCount: 0, boxedCount: 0, stateStrengthScore: 0, lastHitDate: '', statesWithHits: [], sourceClasses: [], dreamerIds: [], dreamerNames: [], dreamerCount: 0, proofLabel: '' });
    const e = universal.get(k)!;
    e.hitCount           += Number(row.hitCount           ?? 0);
    e.straightCount      += Number(row.straightCount      ?? 0);
    e.boxedCount         += Number(row.boxedCount         ?? 0);
    e.stateStrengthScore += Number(row.stateStrengthScore ?? 0);
    if (st    && !e.statesWithHits.includes(st))  e.statesWithHits.push(st);
    if (src   && !e.sourceClasses.includes(src))  e.sourceClasses.push(src);
    if (did   && !e.dreamerIds.includes(did))   { e.dreamerIds.push(did); if (dname && !e.dreamerNames.includes(dname)) e.dreamerNames.push(dname); }
    const lhd = String(row.lastHitDate ?? '');
    if (lhd && lhd > e.lastHitDate) e.lastHitDate = lhd;
  }
  for (const e of universal.values()) { e.dreamerCount = e.dreamerIds.length; e.proofLabel = srcLabel(e.sourceClasses); }

  return { personal, universal };
}

// ─── Window-level proof lookup ────────────────────────────────────────────────

function getWindowProofFields(
  indexes: ProofIndexes,
  scope:   ProofScope,
  w: { dreamerId: string; normalizedTerm?: string; termLabel?: string; number?: string; gameType?: string }
): Record<string, any> {
  const did = String(w.dreamerId      ?? '');
  const nt  = String(w.normalizedTerm ?? normTerm(w.termLabel ?? ''));
  const num = String(w.number         ?? '');  // leading zeros safe
  const gt  = String(w.gameType       ?? '');
  if (!nt || !num || !gt) return buildNoProof();

  // Personal
  let pHit = false, pCount = 0, pS = 0, pB = 0, pLast = '';
  const pStates: string[] = [], pSrc: string[] = [];
  let pLabel = '';
  if (scope === 'personal' || scope === 'both') {
    const pe = indexes.personal.get(`${did}::${nt}::${num}::${gt}`);
    if (pe && pe.hitCount > 0) {
      pHit = true; pCount = pe.hitCount; pS = pe.straightCount; pB = pe.boxedCount; pLast = pe.lastHitDate;
      pStates.push(...pe.statesWithHits); pSrc.push(...pe.sourceClasses); pLabel = pe.proofLabel;
    }
  }

  // Universal
  let uHit = false, uCount = 0, uS = 0, uB = 0, uLast = '';
  const uStates: string[] = [], uSrc: string[] = [];
  let uDids: string[] = [], uDnames: string[] = [], uDcount = 0, uLabel = '';
  if (scope === 'universal' || scope === 'both') {
    const ue = indexes.universal.get(`${nt}::${num}::${gt}`);
    if (ue && ue.hitCount > 0) {
      uHit = true; uCount = ue.hitCount; uS = ue.straightCount; uB = ue.boxedCount; uLast = ue.lastHitDate;
      uStates.push(...ue.statesWithHits); uSrc.push(...ue.sourceClasses);
      uDids = ue.dreamerIds; uDnames = ue.dreamerNames; uDcount = ue.dreamerCount;
      uLabel = uHit && ue.dreamerIds.some(id => id !== did) ? 'Universal Proven' : srcLabel(uSrc);
    }
  }

  const uFromOther = uHit && uDids.some(id => id !== did);
  const allSrc = Array.from(new Set([...pSrc, ...uSrc]));
  const combo = combinedLabel(pHit, uHit, uFromOther, pSrc, uSrc);

  return {
    // Personal fields
    personalHasFellBefore: pHit, personalFellBeforeHitCount: pCount,
    personalStraightCount: pS, personalBoxedCount: pB, personalLastHitDate: pLast,
    personalStatesWithHits: pStates, personalSourceClasses: pSrc, personalProofLabel: pLabel,
    // Universal fields
    universalHasFellBefore: uHit, universalFellBeforeHitCount: uCount,
    universalStraightCount: uS, universalBoxedCount: uB, universalLastHitDate: uLast,
    universalStatesWithHits: uStates, universalSourceClasses: uSrc,
    universalProofDreamerIds: uDids, universalProofDreamerNames: uDnames,
    universalProofDreamerCount: uDcount, universalProofLabel: uLabel,
    // Compatibility / combined
    hasFellBefore:      pHit || uHit,
    fellBeforeHitCount: pCount || uCount,
    straightCount:      pS || uS,
    boxedCount:         pB || uB,
    stateStrengthScore: pB + pS * 3 + (uHit && !pHit ? uB + uS * 3 : 0),
    lastHitDate:        [pLast, uLast].filter(Boolean).sort().pop() ?? '',
    statesWithHits:     Array.from(new Set([...pStates, ...uStates])),
    sourceClasses:      allSrc,
    proofLabel:         combo,
    proofEventCount:    pCount || uCount,
  };
}

function buildNoProof(): Record<string, any> {
  return {
    personalHasFellBefore: false, personalFellBeforeHitCount: 0,
    personalStraightCount: 0, personalBoxedCount: 0, personalLastHitDate: '',
    personalStatesWithHits: [], personalSourceClasses: [], personalProofLabel: '',
    universalHasFellBefore: false, universalFellBeforeHitCount: 0,
    universalStraightCount: 0, universalBoxedCount: 0, universalLastHitDate: '',
    universalStatesWithHits: [], universalSourceClasses: [],
    universalProofDreamerIds: [], universalProofDreamerNames: [],
    universalProofDreamerCount: 0, universalProofLabel: '',
    hasFellBefore: false, fellBeforeHitCount: 0, straightCount: 0, boxedCount: 0,
    stateStrengthScore: 0, lastHitDate: '', statesWithHits: [], sourceClasses: [],
    proofLabel: '', proofEventCount: 0,
  };
}

// ─── Public enrichment functions ──────────────────────────────────────────────

export function enrichWindowsWithProof(
  windows: any[], indexes: ProofIndexes, scope: ProofScope = 'personal'
): any[] {
  for (const w of windows) {
    const proof = getWindowProofFields(indexes, scope, {
      dreamerId: String(w.dreamerId ?? ''), normalizedTerm: String(w.normalizedTerm ?? ''),
      termLabel: String(w.termLabel ?? ''), number: String(w.number ?? ''), gameType: String(w.gameType ?? ''),
    });
    Object.assign(w, proof);
  }
  return windows;
}

export function enrichGroupsWithProof(
  groups: any[], indexes: ProofIndexes, scope: ProofScope = 'personal'
): any[] {
  for (const g of groups) {
    let pH=0,pS=0,pB=0,pLast='',uH=0,uS=0,uB=0,uLast='';
    const pStates=new Set<string>(), pSrc=new Set<string>();
    const uStates=new Set<string>(), uSrc=new Set<string>();
    const uDids=new Set<string>(), uDnames=new Set<string>();
    let pWins=0, uWins=0;

    // Use exact real window rows only. proofWindows contains all rows for this group;
    // sampleWindows is only a UI preview fallback.
    for (const w of (g.proofWindows ?? g.sampleWindows ?? [])) {
      const proof = getWindowProofFields(indexes, scope, {
        dreamerId: String(w.dreamerId ?? g.dreamerId ?? ''), normalizedTerm: String(w.normalizedTerm ?? normTerm(w.termLabel ?? '')),
        termLabel: String(w.termLabel ?? ''), number: String(w.number ?? ''), gameType: String(w.gameType ?? ''),
      });
      if (proof.personalHasFellBefore) {
        pWins++; pH+=proof.personalFellBeforeHitCount; pS+=proof.personalStraightCount; pB+=proof.personalBoxedCount;
        for(const s of proof.personalStatesWithHits) pStates.add(s);
        for(const s of proof.personalSourceClasses) pSrc.add(s);
        if(proof.personalLastHitDate > pLast) pLast=proof.personalLastHitDate;
      }
      if (proof.universalHasFellBefore) {
        uWins++; uH+=proof.universalFellBeforeHitCount; uS+=proof.universalStraightCount; uB+=proof.universalBoxedCount;
        for(const s of proof.universalStatesWithHits) uStates.add(s);
        for(const s of proof.universalSourceClasses) uSrc.add(s);
        for(const id of proof.universalProofDreamerIds) uDids.add(id);
        for(const nm of proof.universalProofDreamerNames) uDnames.add(nm);
        if(proof.universalLastHitDate > uLast) uLast=proof.universalLastHitDate;
      }
    }

    const pSrcArr=Array.from(pSrc), uSrcArr=Array.from(uSrc);
    const pHit=pH>0, uHit=uH>0;
    const uFromOther = uHit && Array.from(uDids).some(id=>id!==g.dreamerId);

    Object.assign(g, {
      personalHasFellBefore: pHit, personalFellBeforeHitCount: pH,
      personalStraightCount: pS, personalBoxedCount: pB, personalLastHitDate: pLast,
      personalStatesWithHits: Array.from(pStates), personalSourceClasses: pSrcArr,
      personalProofLabel: pHit ? srcLabel(pSrcArr) : '', personalProvenWindowCount: pWins,
      universalHasFellBefore: uHit, universalFellBeforeHitCount: uH,
      universalStraightCount: uS, universalBoxedCount: uB, universalLastHitDate: uLast,
      universalStatesWithHits: Array.from(uStates), universalSourceClasses: uSrcArr,
      universalProofDreamerIds: Array.from(uDids), universalProofDreamerNames: Array.from(uDnames),
      universalProofDreamerCount: uDids.size, universalProvenWindowCount: uWins,
      universalProofLabel: uHit ? (uFromOther ? 'Universal Proven' : srcLabel(uSrcArr)) : '',
      hasFellBefore: pHit||uHit, fellBeforeHitCount: pH||uH,
      straightCount: pS||uS, boxedCount: pB||uB, stateStrengthScore: pB+pS*3,
      lastHitDate: [pLast,uLast].filter(Boolean).sort().pop()??'',
      statesWithHits: Array.from(new Set([...pStates,...uStates])),
      sourceClasses: Array.from(new Set([...pSrc,...uSrc])),
      proofLabel: combinedLabel(pHit,uHit,uFromOther,pSrcArr,uSrcArr),
      proofEventCount: pH||uH, proofScope: scope,
    });
  }
  return groups;
}

// ─── Backward-compat (E1 callers) ────────────────────────────────────────────
export async function loadProofIndex(ownerUid: string, dreamerId?: string, limit=5000) {
  const { personal } = await loadProofIndexes(ownerUid, dreamerId, limit);
  return personal;
}
export function getWindowProof(proofIndex: Map<string,ProofEntry>, w: any): any {
  return getWindowProofFields({ personal: proofIndex, universal: new Map() }, 'personal', w);
}
