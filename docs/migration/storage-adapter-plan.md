# Storage Adapter Migration Plan

Sweet404Peaches now has a storage adapter boundary under `src/lib/storage`, but runtime behavior remains Firestore-backed. Firebase Auth remains the authentication layer.

The Railway Postgres migration is a fresh-start database strategy. Postgres should become the new clean dream journal database, starting empty except for small trusted smoke-test seed data. Firebase data stays available as read-only/reference-only history while the new system is verified.

## Provider Flag

Use `DREAM_DB_PROVIDER=firebase|postgres` to select the adapter. The default is `firebase`.

Do not set `DREAM_DB_PROVIDER=postgres` in production until a route has been explicitly migrated, implemented, and tested against Railway Postgres. The Postgres adapter currently contains typed stubs that throw if called.

## Current State

- Existing API routes still import the current Firestore functions directly.
- `src/lib/storage/firebase` delegates to the current Firestore implementation where the delegate is safe.
- `src/lib/storage/postgres` defines the same surface as typed stubs.
- `src/lib/storage/provider.ts` centralizes adapter selection.
- Domain entry points exist for dreamers, dream entries, active windows, hits, backtests, fell-before data, and dictionaries.
- No production route is connected to Postgres yet.

## Route Migration Process

Migrate routes one at a time:

1. Add or complete the matching Postgres implementation for the route's storage domain.
2. Seed only the small trusted records needed to smoke-test that route.
3. Change only that route to import from `src/lib/storage/<domain>` instead of `src/lib/firebase/firestore`.
4. Run the route against `DREAM_DB_PROVIDER=firebase` first to confirm zero behavior change.
5. Run the same route against `DREAM_DB_PROVIDER=postgres` in a non-production environment.
6. Verify clean Postgres behavior directly, including ownership boundaries, ordering, null handling, cascading deletes, and derived fields.
7. Keep Firebase code and data in place until all routes are migrated and verified.

Do not use a bulk Firestore-to-Postgres import as the primary migration path. Firebase contains test data, troubleshooting artifacts, duplicate hit-memory rows, owner-self attribution mistakes, repaired rows, and shadowed rows. Preserve those records as reference material, not as the base for the new Railway database.

## Migration Order

Recommended order:

1. Owner and dreamers, because the surface is small and owner-scoped.
2. Dream entries and active dream windows, using clean seed entries.
3. Dictionaries and term-number mappings, recreated from trusted terms.
4. Backtest golden case, using one known fixture before broader replay work.
5. Dream hits and personal hit mappings, recreated from new Postgres journal/results behavior.
6. Fell-before and lottery result ingestion.

`/fell-before` is intentionally not migrated in this pass.

## Fresh Start Data Policy

Recreate these cleanly in Postgres instead of migrating old Firebase rows:

- owner and owner-self identity records
- guest dreamers
- dream entries
- active dream windows
- term-number mappings
- dream hits
- personal hit mappings and personal hit events
- backtest hits and summaries

Legacy Firebase data may be exported or archived for reference, but should not be imported into the clean Postgres database:

- old `dreamHits`
- old `personalHitMappings`
- old `personalHitEvents`
- old `activeDreamWindows`
- old `backtestHits`
- troubleshooting imports, repaired rows, and duplicate hit-memory rows
- owner-self attribution mistake rows
- shadowed rows that were superseded by repair scripts

Railway volume/storage can be used later for archives, JSON exports, replay logs, and backups. It is not the primary application database.

## Seed Data Plan

Seed a tiny trusted dataset only:

- one owner matching the Firebase Auth UID used for smoke testing
- one owner-self dreamer
- one guest dreamer
- one or two dream entries with known dates and parsed terms
- several term-number mappings that cover both `cash3` and `cash4`
- one active dream window derived from a seed dream entry
- one known backtest/golden test case with a deterministic expected result

The seed dataset should be small enough to inspect manually and deterministic enough to use in route-level tests.

## Guardrails

- Do not wire production routes to Postgres until their adapter implementation is complete.
- Do not delete Firebase collections or Firebase helper code during the migration.
- Do not delete Firestore data yet.
- Do not run broad repair routes as part of the Postgres fresh start.
- Do not bulk-transfer old Firestore dream hits, hit memory, active windows, or backtest hits into Postgres.
- Preserve Firestore response shapes while routes still depend on Firestore.
- Treat route migration as a clean functionality rollout, not a historical data preservation project.
