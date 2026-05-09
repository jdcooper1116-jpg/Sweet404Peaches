# Hit Evidence Storage Plan

This pass adds Postgres storage functions for clean hit evidence without route integration.

No API route calls these functions yet. No Firebase Auth behavior, `DREAM_DB_PROVIDER` default, Prisma schema, Firestore code, or runtime hit writes were changed.

## Functions Added

Implemented in `src/lib/storage/postgres/hitEvidence.ts`:

### Backtest Hits

- `bulkUpsertBacktestHits`
- `listBacktestHitsForDream`

Table used:

- `backtest_hits`

Behavior:

- Requires `ownerUid`.
- Requires `backtestDreamId`.
- Requires each hit to include `dreamerId`.
- Validates the backtest dream belongs to the owner before writing.
- Stores `numberText`, `normalizedResult`, `boxedKey`, and `resultBoxedKey` as strings.
- Uses `createMany({ skipDuplicates: true })` against the existing unique constraint.
- Does not write `personal_hit_events` or `personal_hit_mappings`.

### Canonical Hit Events

- `bulkUpsertPersonalHitEvents`
- `listHitEventsForDreamer`
- `listHitEventsForTerm`
- `listHitEventsForBacktestDream`
- `listHitEventsForDreamEntry`

Table used:

- `personal_hit_events`

Behavior:

- Requires `ownerUid`.
- Requires `dreamerId`.
- Does not silently default to `owner-self`.
- Allows `owner-self` only when the caller explicitly passes it as the virtual dreamer scope.
- Builds deterministic `sourceContextId` values with `src/lib/evidence/hitEvidenceKeys.ts` when one is not provided.
- Stores `sourceType` in the current schema's `source` field.
- Stores `rawResult` and `resultBoxedKey` in `metadata` because the current `personal_hit_events` schema does not have first-class fields for them.
- Uses `createMany({ skipDuplicates: true })` against the existing unique constraint.

### Aggregate Memory

- `rebuildPersonalHitMappingsFromEvents`
- `upsertPersonalHitMappingsFromEvents`
- `listFellBeforeMappings`

Table used:

- `personal_hit_mappings`

Behavior:

- Aggregates derive from `personal_hit_events` only.
- Aggregate key is `ownerUid + dreamerId + normalizedTerm + numberText + gameType + state`.
- Counts are computed from canonical event rows:
  - `hitCount` = event count
  - `straightCount` = exact event count
  - `boxedCount` = box event count
- `lastHitDate`, `drawDate`, and `drawTime` map to the latest event in the aggregate group.
- `metadata.sourceEventIds` stores the event IDs contributing to the aggregate.
- Does not read legacy Firestore memory.

### Backtest Summaries

- `upsertBacktestSummary`
- `rebuildBacktestSummary`

Table used:

- `backtest_summaries`

Behavior:

- Summaries derive from `backtest_hits`.
- Does not call lottery-engine.
- Does not create hit rows.
- Uses `ownerUid + backtestDreamId` scope to find the backtest dream and hit rows.
- Maps exact counts into the existing schema's `straightHits` field.

## Idempotency

Backtest hit and canonical event writes are idempotent through the existing database unique constraints plus `createMany({ skipDuplicates: true })`.

Current limitation:

Prisma does not provide `upsertMany`. Duplicate rows are skipped, so metadata is not updated when an already-existing hit/event is seen again. This is intentional for this storage-only phase. If future route behavior needs metadata merge-on-duplicate, add a narrow update pass in the orchestration service rather than changing broad route behavior.

Aggregate memory uses `upsert` per aggregate key when incrementally updating, and a delete/recreate transaction when explicitly rebuilding from event truth.

## Owner-Self Protection

The storage functions require `dreamerId`; they never infer or default it.

`owner-self` remains valid only when a caller passes it explicitly as the virtual dreamer scope. Future route orchestration must resolve real dreamers before falling back to `owner-self`.

## Leading Zeros

All number/result fields are treated as strings:

- `numberText`
- `normalizedResult`
- `boxedKey`
- `resultBoxedKey`
- `winningNumber`

Helpers build boxed keys with string sorting only. There is no integer parsing.

## Intentionally Not Wired

This pass does not wire:

- `/api/backtest/save-engine-replay-hits`
- `/api/dreams/refresh`
- `/api/fell-before`
- `/api/fell-before/events`
- `/api/dreams/hits`
- playlist evidence routes
- admin repair/rebuild/promote/audit routes

No old Firestore `dreamHits`, `backtestHits`, `personalHitEvents`, `personalHitMappings`, or `backtestSummaries` are imported.

## Remaining Before `/api/backtest/save-engine-replay-hits`

Before migrating the route:

1. Add a route-level orchestration service that calls the storage functions in the correct order.
2. Decide duplicate metadata merge behavior for replay reruns.
3. Add focused tests for replay idempotency and owner/dreamer attribution.
4. Confirm response-shape parity with the current Firebase route.
5. Verify event creation, aggregate rebuild/update, and summary rebuild in Postgres mode before enabling production use.
