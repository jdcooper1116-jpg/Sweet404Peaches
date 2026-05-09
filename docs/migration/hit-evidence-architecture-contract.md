# Hit Evidence Architecture Contract

This is the contract for the clean Railway Postgres hit evidence system. It is a planning document only. It does not authorize importing legacy Firestore hit evidence or wiring new runtime writes before the shared service is implemented and tested.

Firebase Auth remains. `DREAM_DB_PROVIDER=firebase` remains the default until each route is explicitly migrated and verified.

## 1. North Star

One real hit -> one canonical event -> one correct dreamer -> one evidence-backed memory update -> one clear card showing what hit and where it was predicted.

The system should make the evidence chain obvious:

- who the hit belongs to
- which dream or backtest predicted it
- which term produced the number
- which real draw result matched it
- whether the match was exact or box
- how that event updated personal memory

The clean Postgres system must prefer deterministic reconstruction from clean data over preserving messy legacy rows.

## 2. Evidence Flow

### Live Flow

Live hit detection starts from clean journal data and active windows:

`dream_entries / active_dream_windows`
-> lottery-engine or deterministic result lookup
-> `dream_hits`
-> `personal_hit_events`
-> `personal_hit_mappings`
-> fell-before / playlists

Expected responsibilities:

- `active_dream_windows` defines which dream-term-number candidates are eligible for live matching.
- The matcher compares eligible candidates against lottery results for a draw.
- `dream_hits` records live source-specific hit rows.
- `personal_hit_events` records the canonical event ledger.
- `personal_hit_mappings` summarizes event truth for memory features.
- fell-before, dictionary badges, and playlists read evidence through events or aggregates.

### Backtest Flow

Backtest evidence starts from clean backtest intake and deterministic replay results:

`backtest_dreams / backtest_windows / backtest_results`
-> replay match logic
-> `backtest_hits`
-> `backtest_summaries`
-> `personal_hit_events`
-> `personal_hit_mappings`
-> fell-before / playlists

Expected responsibilities:

- `backtest_dreams` stores the dream and parsed terms under the correct owner/dreamer.
- `backtest_windows` stores the replay window.
- `backtest_results` stores the deterministic result set being replayed.
- Replay match logic creates source-specific `backtest_hits`.
- `backtest_summaries` summarizes replay performance for the backtest dream.
- `personal_hit_events` records canonical evidence events.
- `personal_hit_mappings` is rebuilt or incrementally upserted from event truth.

## 3. Canonical Tables

| Table | Role |
| --- | --- |
| `dream_hits` | Source-specific live hit rows produced by matching `active_dream_windows` against real draw results. These rows preserve live window context and should be idempotent. |
| `backtest_hits` | Source-specific backtest hit rows produced by replay matching `backtest_dreams` / `backtest_windows` against `backtest_results`. These rows preserve replay context and should be idempotent. |
| `personal_hit_events` | Permanent canonical event ledger. This is the event-level truth used to prove that a dreamer, term, number, game, state, draw, and source context produced a hit. |
| `personal_hit_mappings` | Aggregate memory table summarizing event truth by dreamer/term/number/game/state. It powers recall and suggestions, but it is not the source of truth. |
| `backtest_summaries` | One summary per backtest dream. It is derived from `backtest_hits` and should be safe to rebuild. |
| `backtest_results` | Replay result rows. All normalized results remain strings. These rows are inputs to replay matching, not hit evidence by themselves. |
| `active_dream_windows` | Live matching eligibility table. Each row says a dream-term-number candidate is active for a date window. It is not hit evidence until a draw matches it. |
| `term_number_mappings` | Dictionary and parsed term-number knowledge. It supports intake and suggestions, but it is not evidence that a number hit. |

## 4. Event-Level Truth

`personal_hit_events` is the permanent evidence ledger.

Every hit event must be traceable to one real draw match and one source context. It must never be written without `ownerUid` and `dreamerId`.

Every event must include:

- `ownerUid`
- `dreamerId`
- `dreamerName` snapshot when available
- `sourceType`: `live`, `backtest`, or `replay`
- `dreamEntryId` or `backtestDreamId`
- `sourceDreamEntryId` if applicable
- `activeWindowId` when applicable
- `sourceContextId`, a stable source identity used for idempotency
- `termLabel`
- `normalizedTerm`
- `numberText`
- `boxedKey`
- `gameType`
- `state`
- `drawDate`
- `drawTime`
- `rawResult`
- `normalizedResult`
- `resultBoxedKey`
- `hitType`: `exact` or `box`
- `daysFromDream`
- `sameDay`
- evidence source / engine metadata
- `createdAt`
- `updatedAt`

The existing Prisma model currently has `source`, `winningNumber`, `normalizedResult`, source IDs, and metadata fields. Implementation should map the contract names into the current model deliberately, or add schema fields in a later schema-specific task if the current model cannot represent the contract cleanly.

## 5. Aggregate Memory

`personal_hit_mappings` summarizes event-level truth. It must not replace `personal_hit_events`.

The aggregate key is dreamer/term/number/game/state. The aggregate row tracks counts and recency, such as:

- `hitCount`
- `straightCount`
- `boxedCount`
- `lastHitDate`
- latest draw date/time
- representative source IDs
- state strength score

It should power:

- As They Fell Before
- dictionary hit badges
- playlists
- evidence-backed suggestions

If aggregate rows ever disagree with event rows, events win. Aggregates should be rebuildable from `personal_hit_events`.

## 6. Uniqueness And Idempotency

Rerunning a detector must update or skip existing evidence, not duplicate it.

### `dream_hits`

Current schema uniqueness:

`ownerUid + sourceDreamEntryId + dreamerId + numberText + gameType + state + drawDate + drawTime + hitType + normalizedResult`

Contract:

- Add or derive `sourceDreamEntryId` consistently from the live dream source.
- Include `activeWindowId` in metadata or future uniqueness only if multiple active windows for the same source/candidate must remain distinguishable.
- Rerunning live detection for the same draw and same candidate must not produce a second live hit.

### `backtest_hits`

Current schema uniqueness:

`ownerUid + backtestDreamId + dreamerId + normalizedTerm + numberText + gameType + state + drawDate + drawTime + hitType + normalizedResult`

Contract:

- One replay hit row per backtest dream, term, number, state, draw, hit type, and result.
- Rerunning replay for the same saved result set must not duplicate rows.
- Replay metadata may be updated, but canonical identity should not change.

### `personal_hit_events`

Current schema uniqueness:

`ownerUid + dreamerId + normalizedTerm + numberText + gameType + state + drawDate + drawTime + hitType + sourceContextId`

Contract:

- `sourceContextId` must be deterministic.
- Suggested live `sourceContextId`: `live:<dreamEntryId or sourceDreamEntryId>:<activeWindowId or normalizedTerm>:<numberText>:<gameType>:<state>:<drawDate>:<drawTime>:<normalizedResult>:<hitType>`.
- Suggested backtest `sourceContextId`: `backtest:<backtestDreamId>:<normalizedTerm>:<numberText>:<gameType>:<state>:<drawDate>:<drawTime>:<normalizedResult>:<hitType>`.
- Same number hitting once should create only one event for that draw under the same canonical identity.
- If multiple internal rows match the same real prediction, the service must merge evidence metadata rather than emit duplicate cards.

### `personal_hit_mappings`

Current schema uniqueness:

`ownerUid + dreamerId + normalizedTerm + numberText + gameType + state`

Contract:

- Aggregates are upserted from event truth.
- Rebuilding aggregates should delete or replace only rows derived from clean Postgres events, not legacy Firestore data.
- Counts must be computed from canonical events, not from source hit rows alone.

### Exact, Box, And Both Counting

- Exact and box identity is deliberate, not accidental.
- If a prediction is exact, write an `exact` event.
- If a prediction is box-only, write a `box` event.
- If matching mode says both applies, the service must decide whether exact supersedes box or whether both rows are useful. The default recommendation is exact supersedes box for one real draw card, while metadata can note that the boxed form also matched.
- UI cards must group by canonical event identity so a single real draw does not appear as multiple cards merely because multiple internal rows matched it.

## 7. Dreamer Attribution Rules

Dreamer resolution order:

1. Explicit `dreamerId` from request or payload.
2. Dream entry `dreamerId`.
3. Backtest dream `dreamerId`.
4. Active window `dreamerId`.
5. `owner-self` only as the final virtual fallback.

Rules:

- `owner-self` is virtual. Do not create a global `Dreamer` row with id `owner-self`.
- All queries must pair `ownerUid + dreamerId`.
- Never write hit evidence without `ownerUid`.
- Never write hit evidence without `dreamerId`.
- Never default to `owner-self` if a real dreamer can be resolved.
- Store a `dreamerName` snapshot on evidence rows when available so historical cards remain readable if the dreamer display name changes later.
- If attribution is ambiguous, fail the write or mark the evidence as rejected in service-level diagnostics. Do not silently write owner-self.

## 8. Leading Zero Protocol

All numbers and results must be strings/text.

Never coerce predicted numbers, raw results, normalized results, boxed keys, or winning numbers to integers.

Examples:

- `"028"` remains `"028"`
- `"0019"` remains `"0019"`
- Cash 3 values stay three-character strings when normalized as Cash 3.
- Cash 4 values stay four-character strings when normalized as Cash 4.

Any parser, matcher, bulk insert, or UI mapping that uses numeric conversion for these fields violates this contract.

## 9. Exact / Box / Both Rules

### Exact Hit

An exact hit means `numberText` equals `normalizedResult` for the same `gameType`, `state`, `drawDate`, and `drawTime`.

Store:

- `hitType = "exact"`
- `numberText` as entered/predicted
- `normalizedResult` as the actual result string
- `boxedKey` from predicted number
- `resultBoxedKey` from actual result

### Box Hit

A box hit means `numberText` is not an exact match, but `boxedKey` equals `resultBoxedKey` for the same `gameType`, `state`, `drawDate`, and `drawTime`.

Store:

- `hitType = "box"`
- original `numberText`
- actual `normalizedResult`
- both boxed keys

### Both Mode

Both mode means the detector may consider exact and box matching rules for the same candidate.

Default storage rule:

- If exact matches, persist the hit as `exact`.
- Do not also persist a separate `box` card for the same prediction/draw unless the product explicitly needs separate exact and box evidence rows.
- If exact and box rows are both stored for analytics, the UI must group them into one real-hit card and show exact as the primary type.

### Boxed Key Behavior

`boxedKey` must be a stable string representation of sorted digits for the prediction, preserving length context through `gameType`.

Examples:

- Cash 3 `"028"` -> boxed key `"028"`
- Cash 3 `"820"` -> boxed key `"028"`
- Cash 4 `"0019"` -> boxed key `"0019"`
- Cash 4 `"9100"` -> boxed key `"0019"`

## 10. Hit Card Display Contract

One hit card should show one canonical real hit event.

Required card fields:

- number that hit
- actual result
- state
- game
- draw date
- draw time
- hit type
- dreamer
- dream date
- predicted source: live dream / backtest dream / term / candidate
- term that produced the number
- evidence count if relevant

Important UI rule:

One real hit should not appear as multiple cards simply because it matched multiple internal rows. The UI should group or dedupe by canonical event identity.

Suggested display identity:

`ownerUid + dreamerId + sourceType + sourceContextId + state + drawDate + drawTime + gameType + normalizedResult`

For grouped cards, show secondary evidence as details, such as:

- additional terms that mapped to the same number
- exact superseding box
- multiple source windows contributing to the same canonical event

## 11. Migration Guardrails

Do not bulk-import old Firestore hit evidence:

- `dreamHits`
- `personalHitEvents`
- `personalHitMappings`
- `backtestHits`
- `backtestSummaries`

Legacy Firebase evidence can be archived, exported, or referenced during troubleshooting, but clean Postgres evidence should be rebuilt from:

- clean dream entries
- clean active windows
- clean backtest dreams
- clean backtest results
- lottery-engine replay
- deterministic result matching

Guardrails:

- Do not delete Firestore hit data yet.
- Do not run broad repair routes against Postgres.
- Do not port legacy shadow/repair flags as primary workflow behavior.
- Do not enable Postgres hit routes in production until idempotency tests pass.
- Do not write `personal_hit_mappings` except from canonical event truth.

## 12. First Implementation Phase Recommendation

Options:

| Option | Risk | Notes |
| --- | --- | --- |
| A. Migrate `/api/backtest/save-engine-replay-hits` | High | This route writes hits, memory, summaries, and status. Migrating it first would lock in evidence behavior before the shared contract is implemented. |
| B. Migrate `/api/dreams/refresh` | Highest | Live refresh touches active windows, live hit creation, memory updates, result lookup, and user-visible operational state. It should wait until replay evidence is stable. |
| C. Migrate `/api/fell-before` | High | Fell-before reads aggregate memory. Migrating it before event truth risks exposing incomplete or duplicate memory. |
| D. Create a new internal hit-evidence service first | Safest | A shared service can own idempotency, attribution, exact/box policy, event writes, aggregate rebuilds, and summary derivation before routes call it. |

Recommended path:

1. Create shared hit-evidence service first.
2. Wire backtest replay hit saving through the service.
3. Add summary upsert/rebuild through the same service.
4. Migrate fell-before reads from `personal_hit_mappings` after event truth exists.
5. Migrate live refresh last, using the same event and aggregate service.

The first implementation route should not be a route. It should be an internal service module with tests and storage adapter functions. After that, migrate `/api/backtest/save-engine-replay-hits` because replay is deterministic and easier to validate than live refresh.

## 13. Storage Adapter Functions Needed

Needed functions include:

- `createBacktestHitEvents`
- `createDreamHitEvents`
- `upsertPersonalHitEvents`
- `rebuildPersonalHitMappingsFromEvents`
- `upsertPersonalHitMappingsFromEvents`
- `listFellBeforeMappings`
- `listHitEventsForDreamer`
- `listHitEventsForTerm`
- `listHitEventsForDream`
- `listHitEventsForBacktestDream`
- `listDreamHits`
- `listBacktestHitsForDream`
- `getBacktestSummary`
- `upsertBacktestSummary`
- `rebuildBacktestSummary`
- `getCanonicalHitEventByKey`
- `bulkUpsertCanonicalHitEvents`

Service-level helpers needed:

- `resolveHitDreamer`
- `buildLiveHitSourceContextId`
- `buildBacktestHitSourceContextId`
- `normalizeHitType`
- `groupHitCardsByCanonicalIdentity`
- `derivePersonalHitMappingsFromEvents`

## 14. Testing Plan

Smoke tests:

- Save the same replay twice and confirm no duplicate `backtest_hits`.
- Save the same replay twice and confirm no duplicate `personal_hit_events`.
- Save the same replay twice and confirm `personal_hit_mappings.hitCount` does not double-count.
- Exact hit preserves leading zeros, for example `"028"` matching `"028"`.
- Cash 4 exact hit preserves `"0019"`.
- Box hit dedupes correctly, for example `"820"` matching `"028"` as one box event.
- Both mode does not show duplicate cards for one real draw event.
- Sunshine hit stays under Sunshine, not `owner-self`.
- Owner-self dream stays scoped to `ownerUid + owner-self`.
- No hit evidence can be written without `ownerUid`.
- No hit evidence can be written without `dreamerId`.
- Fell-before returns one card per canonical hit.
- Dictionary `includeHits` reads aggregate memory only after event truth exists.
- Backtest summary can be rebuilt from `backtest_hits`.
- Personal memory can be rebuilt from `personal_hit_events`.

Regression checks before enabling any Postgres hit route:

- `npx prisma validate`
- `npx prisma generate`
- `npx tsc --noEmit`
- route-level smoke tests in both `DREAM_DB_PROVIDER=firebase` and `DREAM_DB_PROVIDER=postgres`
- duplicate replay detection using the same payload twice
- UI card grouping check for exact/box/both cases
