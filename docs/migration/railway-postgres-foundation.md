# Railway Postgres Foundation

This pass adds the Postgres foundation only. Firebase Auth remains the identity provider, and no production API route reads from or writes to Postgres yet.

## What Was Added

- Prisma schema: `prisma/schema.prisma`
- Prisma client singleton: `src/lib/db/postgres.ts`
- Prisma config: `prisma.config.ts`
- Safe environment example: `.env.example`
- Dependencies: `prisma`, `@prisma/client`, `@prisma/adapter-pg`, and `pg`

The Prisma config and Postgres adapter use `DATABASE_URL`, which should point at the Railway Postgres database in local and deployed environments.

## Schema Strategy

The schema mirrors the migration inventory in `docs/migration/railway-postgres-migration-inventory.md`:

- `Owner` stores the Firebase Auth UID as the stable owner key.
- `Dreamer`, `DreamEntry`, `DreamTerm`, `DreamCandidate`, and `ActiveDreamWindow` model live dream intake and active window intelligence.
- `DreamHit`, `BacktestHit`, and `PersonalHitEvent` preserve event-level evidence.
- `PersonalHitMapping` stores fell-before aggregate rows, with uniqueness matching the canonical semantic key.
- `TermNumberMapping` stores the universal dictionary as one canonical row per owner, dreamer, term, number, and game type.
- `BacktestDream`, `BacktestWindow`, `BacktestResult`, and `BacktestSummary` preserve replay/backtesting state.
- `EngineRequestLog` and `AuditLog` provide future operational traceability for engine calls and admin repair actions.

Lottery numbers are `String` fields named `numberText`, `normalizedResult`, `winningNumber`, or equivalent. They are never numeric columns, so leading zeros remain intact.

## Attribution And Repair Preservation

The schema intentionally keeps denormalized `dreamerName` snapshot fields next to stable `dreamerId` fields. Existing Firestore behavior sometimes resolves display names from row data, dreamer profiles, owner profiles, or `owner-self`; the migration should preserve that lookup order before normalizing anything.

Repair and audit metadata is represented with:

- `isSuspectedMisattributed`
- `isShadowedByCorrectedMapping`
- `isDeprecated`
- `correctedTo`
- `repairMetadata`
- `metadata`

These fields appear on the hit-memory and dictionary tables that currently participate in attribution repair.

## Uniqueness Rules

The schema adds unique constraints for the duplicate-prone paths:

- `DreamHit`: one live hit per owner, source dream, dreamer, number, game, state, draw, hit type, and result.
- `BacktestHit`: one replay hit per owner, backtest dream, dreamer, term, number, game, state, draw, hit type, and result.
- `PersonalHitEvent`: one idempotent event per owner, dreamer, term, number, game, state, draw, hit type, and source context.
- `PersonalHitMapping`: one aggregate row per owner, dreamer, term, number, game, and state.
- `TermNumberMapping`: one dictionary row per owner, dreamer, term, number, and game.

These constraints are intended to eventually replace Firestore deterministic document IDs and the `dreamHitPromotions` registry.

## Migration Plan

1. Keep all current Firestore routes in place.
2. Generate and apply Prisma migrations only after the Railway database is ready.
3. Build one-time import scripts that copy Firestore data into the Prisma tables without deleting Firestore data.
4. Backfill owner rows from Firebase owner profile/Auth UID data before importing child rows.
5. Validate counts and attribution with read-only audit scripts.
6. Migrate high-quota routes first: active-window reads, dream refresh, hit-memory writes, fell-before reads, and dictionary reads.
7. Retire Firestore write paths only after side-by-side verification and a rollback plan exist.

## Open Questions

- Whether `ownerProfiles` should remain Firebase-only or be fully mirrored into `Owner`.
- Whether `BacktestWindow` remains a separate table long term or merges into `BacktestDream`.
- Whether `PersonalHitMapping` should remain a stored table or become a materialized view over `PersonalHitEvent`.
- How strict duplicate dreamer display-name prevention should be per owner.
- Which admin reset operations should be reimplemented in Postgres, and with what guardrails.
