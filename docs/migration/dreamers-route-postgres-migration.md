# Dreamers Route Postgres Migration

`/api/dreamers` is the first route migrated behind the storage adapter.

## Scope

Migrated:

- `GET /api/dreamers`
- `POST /api/dreamers`
- Postgres storage functions for dreamers:
  - `createDreamer`
  - `updateDreamer`
  - `listDreamers`
  - `getDreamer`
  - `deleteDreamerCascade`

Not migrated:

- dream entries
- active dream windows
- dream hits
- personal hit mappings
- personal hit events
- backtests
- fell-before
- dictionaries
- admin repair routes

## Firebase Mode

`DREAM_DB_PROVIDER` still defaults to `firebase`.

In firebase mode, `/api/dreamers` uses the storage adapter, and the Firebase dreamers adapter uses Firebase Admin against the existing `dreamers` collection. This preserves the server-side behavior the route already had before the migration.

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, `/api/dreamers` uses Prisma through `src/lib/storage/postgres/dreamers.ts`.

`createDreamer` ensures the owner row exists before inserting a dreamer:

- `Owner.uid` is set to the Firebase Auth UID.
- No Firebase owner profile migration is required.
- The owner row may start with only `uid`; profile fields can be filled later.

The route keeps the existing response envelope:

- `GET` returns `{ ok: true, dreamers, count }`
- `POST` returns `{ ok: true, dreamerId, dreamer }`

Timestamps are serialized to ISO strings for route responses.

## Delete Behavior

The Postgres `deleteDreamerCascade` implementation removes the dreamer and dependent rows by `dreamerId` in a transaction. This function exists for adapter parity, but no admin repair route or broader cleanup route has been migrated in this pass.

## Guardrails

- Keep `DREAM_DB_PROVIDER=firebase` in production until Postgres dreamers have been tested against Railway.
- Do not bulk-import legacy Firestore dreamers as part of this route migration.
- Do not migrate `/api/fell-before`, `/api/backtest`, `/api/dreams/refresh`, active windows, hits, dictionaries, or admin repair routes in this pass.
- Do not delete Firestore data.
