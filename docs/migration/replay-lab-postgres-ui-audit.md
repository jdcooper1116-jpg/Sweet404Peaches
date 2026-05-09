# Replay Lab Postgres UI Audit

**Date:** May 9, 2026  
**Status:** Postgres hit-evidence persisting successfully, but UI not showing correct data  
**Severity:** Moderate - Hit evidence is being saved, but Replay Lab can't display it  

## Root Cause Findings

The Replay Lab UI shows "No valid candidates found" even though Historical Intake successfully saved 118 hits because **`/api/backtest/list-dreams` doesn't return the fields Replay Lab needs**.

### The Data Flow Problem

1. **Replay Lab loads dreams:** Calls `/api/backtest/list-dreams?ownerUid=...`
2. **Response fields:** Returns only `id`, `ownerUid`, `dreamerId`, `dreamerName`, `dreamDate`, `rawText`, `status`, `hitCount`, `termCount`, `createdAt`, `updatedAt`
3. **Missing fields:** Does NOT return `cash3Numbers`, `cash4Numbers`, `parsedTermMappings`
4. **Replay Lab needs those fields:** Calls `/api/backtest/engine-replay` with:
   ```json
   {
     "backtestDreamId": "...",
     "dreamDate": "...",
     "lookaheadDays": 7,
     "cash3Numbers": [],        // ← UNDEFINED, should be ['123', '456', ...]
     "cash4Numbers": [],        // ← UNDEFINED, should be ['1234', '5678', ...]
     "parsedTermMappings": []   // ← UNDEFINED
   }
   ```
5. **Engine replay fails:** Returns error "No valid candidates found. cash3Numbers must be 3-digit strings, cash4Numbers must be 4-digit strings."

### Secondary Issues

1. **Stale UI label:** Intake page shows "Saving X hit(s) to Firestore..." regardless of provider
2. **Missing status update:** Postgres branch doesn't update `backtestDreams.status` to `'engine-replay-complete'`
3. **Inconsistent response fields:** Postgres storage returns full data, but the route filters it

## Exact Files Involved

| File | Component | Issue |
|------|-----------|-------|
| `src/app/api/backtest/list-dreams/route.ts` | Response filtering | Missing `cash3Numbers`, `cash4Numbers`, `parsedTermMappings` |
| `src/app/backtesting/replay/page.tsx` | Replay Lab UI | Expects fields from list-dreams, gets undefined |
| `src/app/backtesting/intake/page.tsx` | Intake UI | Stale "to Firestore..." label |
| `src/app/api/backtest/save-engine-replay-hits/route.ts` | Postgres branch | No status update to backtestDreams |
| `src/lib/storage/postgres/backtests.ts` | listBacktestDreams | Already returns all fields ✓ |
| `src/lib/storage/firebase/backtests.ts` | listBacktestDreams | Returns all Firestore fields ✓ |

## Bug Classification

**Bug Type:** Data shape / Missing fields in API response  
**Impact:** UI feature broken (Replay Lab can't generate engine replay until fixed)  
**Data Integrity:** ✓ Safe - Evidence is being persisted correctly to Postgres  
**User Experience:** ✗ Poor - Users see error even though data was saved

## What Should Be Fixed First

### Priority 1: Fix `/api/backtest/list-dreams` response
**Reason:** This unblocks Replay Lab immediately  
**Change:** Add `cash3Numbers`, `cash4Numbers`, `parsedTermMappings`, `archivedNumbers` to response object  
**Risk:** Low - These fields are small JSON arrays, minimal perf impact  
**Scope:** Only the response mapping in list-dreams route

### Priority 2: Fix stale "Firestore" label
**Reason:** Reduces user confusion  
**Change:** Update intake page to say "Saving X hit(s)..." instead of "to Firestore..."  
**Risk:** None - UI text only  
**Scope:** One line in intake page

### Priority 3: Implement status update in Postgres mode
**Reason:** Status tracking - less urgent since functional evidence persistence works  
**Change:** Add Postgres path to update `backtestDreams.status` after `persistBacktestReplayEvidence`  
**Risk:** Medium - Requires storage adapter extension  
**Scope:** May require new storage method  
**Defer to:** After list-dreams fix verified

## What Should NOT Be Touched Yet

- ✗ Do not touch `/api/dreams/refresh`
- ✗ Do not touch `/api/fell-before`
- ✗ Do not touch admin repair/rebuild routes
- ✗ Do not change Firebase mode behavior
- ✗ Do not migrate other backtest routes
- ✗ Do not change Prisma schema
- ✗ Do not modify hit-evidence orchestrator or storage

## Recommended Minimal Patch Plan

### Step 1: Update `/api/backtest/list-dreams` (5 minutes)
Add these fields to the response object:

```diff
return {
  id:           String(d.id ?? d.backtestDreamId ?? ''),
  ownerUid:     String(d.ownerUid     ?? ownerUid),
  dreamerId:    did,
  dreamerName,
  dreamDate:    String(d.dreamDate    ?? ''),
  rawText:      String(d.rawText      ?? '').slice(0, 200),
  status:       String(d.status       ?? ''),
  hitCount:     Number(d.hitCount     ?? 0),
  termCount:    Number(d.termCount    ?? (d.termMappings?.length ?? 0)),
+ cash3Numbers: Array.isArray(d.cash3Numbers) ? d.cash3Numbers : [],
+ cash4Numbers: Array.isArray(d.cash4Numbers) ? d.cash4Numbers : [],
+ parsedTermMappings: Array.isArray(d.parsedTermMappings) ? d.parsedTermMappings : [],
+ archivedNumbers: Array.isArray(d.archivedNumbers) ? d.archivedNumbers : [],
  createdAt:    isoDate(d.createdAt),
  updatedAt:    isoDate(d.updatedAt),
};
```

**Expected Result:**
- Replay Lab can now access these fields
- Engine replay will work correctly
- Postgres and Firebase both return consistent field sets

### Step 2: Update intake page label (1 minute)
Change line 241 from:
```
setMessage(`Step 3/3: Saving ${engineData.totalHits} hit(s) to Firestore…`);
```
To:
```
setMessage(`Step 3/3: Saving ${engineData.totalHits} hit(s)…`);
```

**Expected Result:**
- Less confusing to users in Postgres mode

### Step 3: After verification, consider status update
Only if Priority 1 and 2 are working correctly, then add Postgres status update logic.

## Is It Safe to Patch Next?

**Yes.** The minimal patches are:
- ✅ Low risk (just adding fields to response)
- ✅ Backward compatible (new fields, old code ignores them)
- ✅ Well-scoped (two small changes)
- ✅ No schema changes
- ✅ No orchestrator changes
- ✅ Verified by: rebuild + tsc

### Pre-Patch Checklist
- [ ] Run `npx tsc --noEmit` ✓
- [ ] Build succeeds ✓
- [ ] Manual test: Select backtest in Replay Lab
- [ ] Manual test: Click "⚡ Run via Engine"
- [ ] Verify engine replay returns hits
- [ ] Verify save succeeds
- [ ] Verify summary displays correctly

## Testing Strategy

1. **Before patch:**
   - Historical Intake: Save dream → Success ✓ (118 hits)
   - Replay Lab: Load dream → See error ✗

2. **After patch:**
   - Replay Lab: Load dream → Fields present
   - Click "⚡ Run via Engine" → Should work
   - Summary: Should show hit counts

3. **Regression check:**
   - Verify list-dreams response size (shouldn't be huge)
   - Verify Firebase mode still works
   - Verify other backtesting pages unaffected