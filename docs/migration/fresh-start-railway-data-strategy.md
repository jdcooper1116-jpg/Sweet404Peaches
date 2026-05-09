# Fresh Start Railway Data Strategy

Railway Postgres is the new clean dream journal database for Sweet404Peaches. The goal is reliable functionality on clean data, not preservation of every historical Firestore row.

Firebase Auth remains the identity provider. Existing Firestore data should not be deleted yet, but it should be treated as read-only/reference-only until the Postgres-backed system is verified.

## Strategy

Start Railway Postgres empty. Add only a small trusted seed dataset for smoke testing and golden tests. Recreate operational records from new journal activity and deterministic replay logic.

Do not make a bulk Firestore-to-Postgres import the primary path. Firebase currently includes test data, troubleshooting artifacts, duplicate hit-memory rows, owner-self attribution mistakes, repaired records, and shadowed rows. Importing that data would move known ambiguity into the new database.

## Recreate Cleanly

These records should be recreated in Postgres through new application behavior, seed scripts, or deterministic replay:

- owners, keyed by Firebase Auth UID
- owner-self dreamer records
- guest dreamers
- dream entries
- active dream windows
- term-number mappings
- dream hits
- personal hit mappings
- personal hit events
- backtest hits
- backtest summaries

Dream hits, personal hit memory, active windows, and backtest hits are derived operational data. They should be rebuilt from clean source records instead of imported from legacy Firestore collections.

## Archive But Do Not Import

These legacy Firebase records may be exported for audit, debugging, or historical reference, but should not be imported into the clean Postgres app tables:

- `dreamHits`
- `personalHitMappings`
- `personalHitEvents`
- `activeDreamWindows`
- `backtestHits`
- duplicate hit-memory rows
- owner-self attribution mistake rows
- troubleshooting imports
- broad repair-route outputs
- repaired rows that were superseded by newer records
- shadowed rows kept around during previous repair work

Use Railway volume/storage later for archives, JSON exports, replay logs, and backups. Those files are supporting artifacts, not the primary database state.

## Seed Data Plan

Seed only enough data to verify that routes and adapters work:

- one owner using the Firebase Auth UID reserved for smoke tests
- one owner-self dreamer for the owner
- one guest dreamer
- one or two dream entries with known dates, known dreamer attribution, and manually verified parsed terms
- several term-number mappings, including both `cash3` and `cash4`
- one active dream window derived from one seed dream entry
- one known backtest/golden test case with expected hit counts and expected winning number behavior

The seed data should be deterministic, small, and easy to inspect by hand. It should not contain old repair artifacts or copied production Firestore hit memory.

## Guardrails

- Do not delete Firestore data yet.
- Do not mutate legacy Firebase data as part of the fresh-start setup.
- Do not run broad repair routes to prepare Postgres data.
- Do not bulk-transfer old Firestore `dreamHits`, `personalHitMappings`, `personalHitEvents`, `activeDreamWindows`, or `backtestHits`.
- Do not enable `DREAM_DB_PROVIDER=postgres` in production until each route is implemented, tested, and explicitly switched.
- Keep Firebase data read-only/reference-only until the Postgres route set is verified.
- Keep seed data separate from archived Firebase exports.

## Verification Path

Verify Postgres by route, not by historical row count:

1. Implement the route's Postgres adapter methods.
2. Load the trusted seed data needed by that route.
3. Run the route with `DREAM_DB_PROVIDER=firebase` to confirm current behavior remains unchanged.
4. Run the same route with `DREAM_DB_PROVIDER=postgres` outside production.
5. Compare functional outcomes against seed expectations and golden test cases.
6. Switch production only after the route passes clean Postgres checks.
