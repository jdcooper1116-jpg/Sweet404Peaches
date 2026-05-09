# Storage Adapter Migration Plan

Sweet404Peaches now has a storage adapter boundary under `src/lib/storage`, but runtime behavior remains Firestore-backed. Firebase Auth remains the authentication layer.

## Provider Flag

Use `DREAM_DB_PROVIDER=firebase|postgres` to select the adapter. The default is `firebase`.

Do not set `DREAM_DB_PROVIDER=postgres` in production until a route has been explicitly migrated and its Postgres implementation is complete. The Postgres adapter currently contains typed stubs that throw if called.

## Current State

- Existing API routes still import the current Firestore functions directly.
- `src/lib/storage/firebase` delegates to the current Firestore implementation where the delegate is safe.
- `src/lib/storage/postgres` defines the same surface as typed stubs.
- `src/lib/storage/provider.ts` centralizes adapter selection.
- Domain entry points exist for dreamers, dream entries, active windows, hits, backtests, fell-before data, and dictionaries.

## Route Migration Process

Migrate routes one at a time:

1. Add or complete the matching Postgres implementation for the route's storage domain.
2. Add parity checks against the existing Firestore behavior, including ordering, null handling, cascading deletes, and derived fields.
3. Change only that route to import from `src/lib/storage/<domain>` instead of `src/lib/firebase/firestore`.
4. Run the route against `DREAM_DB_PROVIDER=firebase` first to confirm zero behavior change.
5. Run the same route against `DREAM_DB_PROVIDER=postgres` in a non-production environment.
6. Keep Firebase code in place until all routes are migrated and verified.

## Migration Order

Recommended order:

1. Dreamers, because the surface is small and owner-scoped.
2. Dream entries and active dream windows, because later hit detection depends on them.
3. Dictionaries and term-number mappings.
4. Dream hits and personal hit mappings.
5. Backtests.
6. Fell-before and lottery result ingestion.

`/fell-before` is intentionally not migrated in this pass.

## Guardrails

- Do not wire production routes to Postgres until their adapter implementation is complete.
- Do not delete Firebase collections or Firebase helper code during the migration.
- Preserve Firestore response shapes while routes still depend on them.
- Treat route migration as a behavior-preserving refactor first; database-specific improvements can happen after parity is proven.
