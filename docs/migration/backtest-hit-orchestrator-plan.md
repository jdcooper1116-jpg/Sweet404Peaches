# Backtest Hit Orchestrator Plan

This pass adds an internal orchestration service only:

- `src/lib/evidence/backtestHitOrchestrator.ts`

No API routes call it yet. No Firestore code, lottery-engine calls, Prisma schema, or runtime behavior changed.

## Function Added

`persistBacktestReplayEvidence(input)`

The function accepts already-computed replay hit candidates and orchestrates:

1. Validate `ownerUid` and `backtestDreamId`.
2. Validate or skip each candidate that lacks `dreamerId`.
3. Normalize terms, hit type, boxed keys, and source context IDs while preserving all number/result values as strings.
4. Write source-specific `backtest_hits` through storage.
5. Write canonical `personal_hit_events` through storage.
6. Rebuild or upsert `personal_hit_mappings` from event truth.
7. Rebuild `backtest_summaries` from `backtest_hits`.
8. Return operation counts and warnings.

## Idempotency

The orchestrator builds deterministic `sourceContextId` values with `buildBacktestHitSourceContextId`. Storage uses existing unique constraints plus `createMany({ skipDuplicates: true })`, so repeated calls with the same input skip duplicate source hit and event rows.

Exact-over-box protection happens before storage writes. Candidates that represent the same dreamer/term/number/game/state/draw/result collapse to one event, and exact is preferred over box by `choosePrimaryHitType`.

## Owner-Self Protection

The orchestrator never defaults missing `dreamerId` to `owner-self`.

Rows without a resolved `dreamerId` are skipped with a warning. `owner-self` remains allowed only when explicitly supplied by the caller as the virtual dreamer scope.

## Leading Zeros

All numbers and results are normalized with string trimming only:

- `numberText`
- `normalizedResult`
- `boxedKey`
- `resultBoxedKey`

There is no integer parsing, so values like `"028"` and `"0019"` remain intact.

## Examples

No test framework exists in this repo, so these examples should become automated tests when one is added.

```ts
await persistBacktestReplayEvidence({
  ownerUid: "owner-1",
  backtestDreamId: "bt-1",
  hits: [
    {
      dreamerId: "Sunshine",
      termLabel: "window",
      numberText: "028",
      gameType: "cash3",
      state: "GA",
      drawDate: "2026-05-09",
      drawTime: "midday",
      normalizedResult: "028",
      hitType: "exact",
    },
  ],
});
```

Expected:

- one `backtest_hits` attempt
- one `personal_hit_events` attempt
- `Sunshine` remains the dreamer
- `"028"` remains a string
- replaying the same input does not duplicate rows

Exact-over-box example:

```ts
await persistBacktestReplayEvidence({
  ownerUid: "owner-1",
  backtestDreamId: "bt-1",
  hits: [
    { ...sameDraw, hitType: "box" },
    { ...sameDraw, hitType: "exact" },
  ],
});
```

Expected:

- one deduped hit/event attempt for the same real draw identity
- exact is retained as the primary hit type
- warnings include the dedupe count

## Still Not Wired

The following remain untouched:

- `/api/backtest/save-engine-replay-hits`
- `/api/dreams/refresh`
- `/api/fell-before`
- `/api/fell-before/events`
- `/api/dreams/hits`
- playlist evidence routes
- admin repair/rebuild/promote/audit routes

## Before Wiring `/api/backtest/save-engine-replay-hits`

1. Compare the current Firebase route response shape with the orchestrator result shape.
2. Add focused idempotency tests around replaying the same hits twice.
3. Decide whether duplicate metadata should remain skip-only or get a narrow merge pass.
4. Wire the route behind `DREAM_DB_PROVIDER=postgres` while preserving Firebase mode.
