# Backtest Intake Postgres Migration

Backtest dream intake and backtest dream listing are now routed through the storage adapter.

## Routes Migrated

Migrated behind `src/lib/storage/backtests`:

- `POST /api/backtest/save-dream-intake`
- `GET /api/backtest/list-dreams`

The response shapes remain:

- intake returns `{ ok, backtestDreamId, dreamerId, dreamerName, termMappingsWritten, dream }`
- list returns `{ ok, dreams, count }`

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, intake writes with Prisma to:

- `owners`, ensuring `Owner.uid = ownerUid` exists
- `backtest_dreams`
- `backtest_windows`
- `term_number_mappings`

`term_number_mappings` are written only because the existing backtest intake route already writes parsed term-number dictionary rows. Hit-memory tables are not touched.

Backtest list reads from:

- `backtest_dreams`

Reads are always scoped by `ownerUid`. If `dreamerId` is provided, reads use `ownerUid + dreamerId`.

## Owner-Self Handling

`owner-self` remains a virtual dreamer scope. The Postgres adapter does not create a `Dreamer` row with id `owner-self`.

Owner/self backtest records store:

- `dreamerId = "owner-self"`
- the provided `dreamerName`, if any

## Preserved Intake Data

The Postgres intake path preserves:

- `dreamDate`
- `rawText`
- `cleanedText`, when present in `parseResult`
- `source`
- `confidence`
- `notes`
- `parseResult`
- `parsedTermMappings`
- `cash3Numbers`
- `cash4Numbers`
- `archivedNumbers`
- `activeWindowStart`
- `activeWindowEnd`

Candidate numbers are stored as strings/text so leading zeros are preserved.

## Firebase Mode

`DREAM_DB_PROVIDER` defaults to `firebase`.

In firebase mode, the migrated routes still read/write Firestore collections through Firebase Admin:

- `backtestDreams`
- `backtestWindows`
- `termNumberMappings`

## Intentionally Not Migrated

These remain Firebase/Firestore-backed or untouched:

- `/api/backtest/dream-detail`
- `/api/backtest/engine-replay`
- `/api/backtest/save-engine-replay-hits`
- `/api/backtest` engine bridge
- `backtest_hits`
- `backtest_results`
- `backtest_summaries`
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
2. Save a backtest dream through `/api/backtest/save-dream-intake`.
3. Confirm `/api/backtest/list-dreams?ownerUid=...` returns the new row.
4. Confirm the response shape matches prior behavior.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres` in a non-production environment.
2. Save an owner-self backtest dream with `dreamerId = "owner-self"`.
3. Confirm no `Dreamer` row with id `owner-self` is created.
4. Confirm rows exist in `backtest_dreams`, `backtest_windows`, and `term_number_mappings`.
5. Confirm `/api/backtest/list-dreams?ownerUid=...&dreamerId=owner-self` returns only owner-scoped records.

## Guardrails

- Do not bulk-import old Firestore backtest data.
- Do not migrate backtest replay, results, hits, summaries, or engine bridge behavior in this pass.
- Do not write hit-memory tables from this intake migration.
- Do not delete Firestore data.
