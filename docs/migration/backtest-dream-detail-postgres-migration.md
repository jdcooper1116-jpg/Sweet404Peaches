# Backtest Dream Detail Postgres Migration

Backtest dream detail is now routed through the storage adapter.

## Route Migrated

Migrated behind `src/lib/storage/backtests`:

- `GET /api/backtest/dream-detail`

The response shape remains:

- `{ ok, dream, hits, hitCount, summary }`

This migration is read-only.

## Tables Read In Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, the route reads with Prisma from:

- `backtest_dreams`
- `backtest_hits`
- `backtest_summaries`

All reads are scoped by `ownerUid`. The route does not trigger replay, write hit memory, or call the lottery engine.

## Empty Hits And Summaries

Fresh-start Postgres environments may have intake dreams before replay data exists.

In Postgres mode:

- missing `backtest_hits` returns `hits: []` and `hitCount: 0`
- missing `backtest_summaries` returns `summary: null`

This is expected until replay/result migration is implemented.

## Owner-Self Handling

`owner-self` remains a virtual dreamer scope. The detail read path does not create a `Dreamer` row with id `owner-self`.

Owner/self records are read as stored on `backtest_dreams`, `backtest_hits`, and `backtest_summaries`.

## Firebase Mode

`DREAM_DB_PROVIDER` defaults to `firebase`.

In firebase mode, the route still reads Firestore-backed data through the Firebase backtests storage adapter.

## Intentionally Not Migrated

These remain Firebase/Firestore-backed or untouched:

- `/api/backtest/engine-replay`
- `/api/backtest/save-engine-replay-hits`
- `/api/backtest` engine bridge
- `backtest_results`
- replay writes
- `personalHitEvents`
- `personalHitMappings`
- `dreamHits`
- `/api/fell-before`
- `/api/dreams/refresh`
- `/api/dreams/hits`
- playlists
- admin repair routes

## Testing

Firebase mode:

1. Keep `DREAM_DB_PROVIDER=firebase`.
2. Call `/api/backtest/dream-detail?ownerUid=...&backtestDreamId=...`.
3. Confirm the response shape matches prior behavior.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres` in a non-production environment.
2. Save a backtest dream through `/api/backtest/save-dream-intake`.
3. Call `/api/backtest/dream-detail?ownerUid=...&backtestDreamId=...`.
4. Confirm the dream is returned with `hits: []`, `hitCount: 0`, and `summary: null` if no replay data exists yet.
5. Confirm another owner cannot read the dream.
