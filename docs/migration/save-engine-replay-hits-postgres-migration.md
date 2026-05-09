# Save Engine Replay Hits Postgres Migration

**Date:** May 9, 2026  
**Route:** `/api/backtest/save-engine-replay-hits`  
**Status:** Postgres mode wired, Firebase mode preserved  

## Migration Summary

Successfully wired Postgres mode for `/api/backtest/save-engine-replay-hits` while preserving Firebase mode behavior unchanged. The route now supports both providers with `DREAM_DB_PROVIDER` environment variable.

## Implementation Details

### Firebase Mode Preservation
- **Unchanged behavior:** All existing Firebase logic remains identical
- **No breaking changes:** Existing callers continue to work without modification
- **Direct Firestore usage:** Continues to write to `backtestHits`, `personalHitEvents`, `personalHitMappings`, `backtestSummaries`
- **Status updates:** Updates `backtestDreams` and `backtestWindows` status to `'engine-replay-complete'`

### Postgres Mode Branch
- **Conditional execution:** Only runs when `getDreamDbProvider() === 'postgres'`
- **Evidence persistence:** Uses `persistBacktestReplayEvidence` from `backtestHitOrchestrator`
- **Storage adapter usage:** Uses `getStorageAdapter().backtests.getBacktestDreamById` for dreamer resolution
- **No Firestore writes:** Pure Postgres implementation, no Firebase fallback

### Dreamer Resolution Strategy
1. **Explicit in body:** Uses `body.dreamerId` and `body.dreamerName` if provided
2. **Lookup from backtest:** If not provided, queries `backtestDreams` via storage adapter
3. **Fail if unresolved:** Returns 400 error instead of defaulting to `'owner-self'`
4. **Protection:** Ensures `dreamerId` is never silently set to virtual `owner-self`

### Hit Mapping
Maps `EngineReplayHit[]` to `BacktestReplayHitCandidate[]` with:
- **String preservation:** `number`, `normalizedResult` remain strings (leading zeros like `"028"` intact)
- **Field mapping:** Direct mapping with optional fields handled safely
- **Metadata:** Includes `canonical_key` if present
- **Source:** Sets `replaySource: 'lottery-engine'`

### Response Compatibility
- **Firebase response:** Unchanged shape
- **Postgres response:** Compatible shape with additional Postgres-specific fields
- **Stats computation:** Both modes compute `totalHits`, `straightHits`, `boxedHits`, `uniqueStates`, `bestState`, `bestTerm`
- **Dreamer ID:** Returns resolved `dreamerId`

### Status Updates
- **Firebase:** Updates `backtestDreams` and `backtestWindows` status
- **Postgres:** Not yet implemented in storage adapter (evidence persisted, status unchanged)

### Error Handling
- **Postgres errors:** Logged with `[save-engine-replay-hits POSTGRES]` prefix
- **Validation:** Fails clearly if `dreamerId` cannot be resolved
- **Idempotency:** Handled by `persistBacktestReplayEvidence` (unique constraints)

## Files Changed

- `src/app/api/backtest/save-engine-replay-hits/route.ts`
  - Added imports: `getDreamDbProvider`, `getStorageAdapter`, `persistBacktestReplayEvidence`, `BacktestReplayHitCandidate`
  - Added Postgres mode branch before Firebase code
  - Preserved all Firebase logic unchanged

## Request Fields Mapped

| Firebase Field | Postgres Mapping | Notes |
|----------------|------------------|-------|
| `ownerUid` | `ownerUid` | Direct |
| `backtestDreamId` | `backtestDreamId` | Direct |
| `dreamDate` | `dreamDate` | Direct |
| `hits[].termLabel` | `termLabel` | Direct |
| `hits[].number` | `numberText` | String preservation |
| `hits[].gameType` | `gameType` | Direct |
| `hits[].state` | `state` | Direct |
| `hits[].drawDate` | `drawDate` | Direct |
| `hits[].drawTime` | `drawTime` | Direct |
| `hits[].rawResult` | `rawResult` | Optional |
| `hits[].normalizedResult` | `normalizedResult` | String preservation |
| `hits[].resultBoxedKey` | `resultBoxedKey` | Direct |
| `hits[].hitType` | `hitType` | Direct |
| `hits[].daysFromDream` | `daysFromDream` | Direct |
| `hits[].sameDay` | `sameDay` | Direct |
| `hits[].is_verified` | `isVerified` | Mapped |
| `hits[].source_name` | `sourceName` | Mapped |
| `hits[].canonical_key` | `metadata.canonical_key` | Preserved |

## Response Shape Comparison

### Firebase Response
```json
{
  "ok": true,
  "totalHits": 42,
  "straightHits": 10,
  "boxedHits": 32,
  "uniqueStates": ["CA", "FL"],
  "bestState": "CA",
  "bestTerm": "house",
  "dreamerId": "dreamer-123"
}
```

### Postgres Response
```json
{
  "ok": true,
  "totalHits": 42,
  "straightHits": 10,
  "boxedHits": 32,
  "uniqueStates": ["CA", "FL"],
  "bestState": "CA",
  "bestTerm": "house",
  "dreamerId": "dreamer-123",
  "backtestHitsCreated": 42,
  "personalEventsCreated": 42,
  "mappingsUpdated": 35
}
```

## How DreamerId is Protected

1. **Explicit check:** If `body.dreamerId` provided, uses it
2. **Storage lookup:** If not, queries backtest dream via adapter
3. **No default:** If neither provides `dreamerId`, returns 400 error
4. **Never owner-self:** Virtual `owner-self` never auto-assigned
5. **Validation:** `persistBacktestReplayEvidence` validates dreamerId required

## How Leading Zeros are Protected

1. **String mapping:** `hits[].number` → `numberText` (string)
2. **Result preservation:** `normalizedResult` remains string
3. **No coercion:** No `Number()`, `parseInt()`, or `+` operations
4. **Boxed key:** Computed from string values
5. **Contract compliance:** Follows hit-evidence architecture contract

## Validation Results

- ✅ Prisma validate: Schema valid
- ✅ Prisma generate: Client generated
- ✅ TypeScript: No errors
- ✅ Build: Successful

## Risks Identified

1. **Status updates:** `backtestDreams`/`backtestWindows` status not updated in Postgres (low risk, evidence is primary)
2. **Response compatibility:** Additional fields in Postgres response (backward compatible)
3. **Lookup dependency:** Requires backtest dream to have `dreamerId` if not in request (documented failure)
4. **Idempotency:** Relies on orchestrator's unique constraints (tested in implementation)

## Next Steps

- Test Postgres mode with real backtest replay
- Implement status updates in Postgres storage adapter if needed
- Monitor for any UI compatibility issues with additional response fields
- Consider migrating other backtest routes when ready</content>
<parameter name="filePath">/workspaces/Sweet404Peaches/docs/migration/save-engine-replay-hits-postgres-migration.md