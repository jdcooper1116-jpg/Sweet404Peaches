# Backtest Results Postgres Migration

Backtest result row storage functions are now implemented in the Postgres storage adapter.

## Storage Functions Migrated

Migrated behind `src/lib/storage/backtests`:

- `bulkCreateBacktestResults`
- `listBacktestResultsForDream`

No additional backtest replay or hit routes are migrated in this pass.

## Routes

No active API route was found that directly calls these result-storage helpers. The implementation is ready for future route migration, but replay and engine bridge routes remain untouched.

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, these storage functions use Prisma with:

- `backtest_results` for result row writes and reads
- `backtest_dreams` read-only ownership validation before writes

Writes validate that `backtestDreamId` belongs to `ownerUid` before inserting rows. Result rows are inserted with `createMany(..., skipDuplicates: true)`.

The adapter preserves:

- `state`
- `date`
- `gameType`
- `drawTime`
- `rawResult`
- `normalizedResult` as text/string
- `boxedKey`
- `sourceType`
- `gameLabel`
- `bonusText`

Leading zeros are preserved because result values remain strings.

## Firebase Mode

`DREAM_DB_PROVIDER` defaults to `firebase`.

In firebase mode, the storage adapter still delegates these functions to the existing Firestore implementation.

## Intentionally Not Migrated

These remain Firebase/Firestore-backed or untouched:

- `/api/backtest/engine-replay`
- `/api/backtest/save-engine-replay-hits`
- `/api/backtest` engine bridge
- `backtest_hits`
- `backtest_summaries`
- `personalHitEvents`
- `personalHitMappings`
- `dreamHits`
- `/api/fell-before`
- `/api/dreams/refresh`
- `/api/dreams/hits`
- playlists
- admin repair routes
- lottery engine calls

The Postgres result storage migration does not create hit rows, summaries, or hit-memory rows.

## Testing

Firebase mode:

1. Keep `DREAM_DB_PROVIDER=firebase`.
2. Use the existing Firestore-backed flow that stores or lists backtest results.
3. Confirm behavior and response shapes are unchanged.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres` in a non-production environment.
2. Create a backtest dream intake row.
3. Call `bulkCreateBacktestResults` with rows containing leading-zero results.
4. Confirm rows are inserted into `backtest_results`.
5. Call `listBacktestResultsForDream` and confirm rows are owner-scoped and sorted by date/draw time.
6. Confirm no rows are written to `backtest_hits`, `backtest_summaries`, or hit-memory tables.
