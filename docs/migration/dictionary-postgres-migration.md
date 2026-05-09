# Dictionary Postgres Migration

Universal Dictionary term-number mapping reads and writes are now routed through the storage adapter.

## Route Migrated

Migrated behind `src/lib/storage/dictionaries`:

- `GET /api/dictionary/terms`
- `POST /api/dictionary/terms`

The route response shape remains:

- `GET` returns `{ ok, terms, count, includeHits, limit }`
- `POST` returns `{ ok, id, termLabel, number, gameType }`

## Postgres Mode

When `DREAM_DB_PROVIDER=postgres`, the route reads and writes:

- `term_number_mappings`

The Postgres adapter uses Prisma and always scopes reads and deletes by `ownerUid`. Optional filters remain owner-scoped:

- `ownerUid + dreamerId`
- `ownerUid + source`
- `ownerUid + gameType`
- `ownerUid + number`
- `ownerUid + term`

Numbers are stored and returned as strings from `number_text`, preserving leading zeros.

## Owner-Self Handling

`owner-self` remains a virtual dreamer scope. The Postgres dictionary adapter does not require or create a `Dreamer` row with id `owner-self`.

Owner/self dictionary mappings are matched by:

- `ownerUid`
- `dreamerId = "owner-self"`

## Firebase Mode

`DREAM_DB_PROVIDER` defaults to `firebase`.

In firebase mode, `/api/dictionary/terms` still reads and writes the existing Firestore `termNumberMappings` collection through Firebase Admin.

The existing `includeHits=true` personal-hit enrichment remains Firebase-only because personal hit mappings are not migrated yet.

## Current Postgres Limitation

In Postgres mode, `includeHits=true` does not join hit memory yet. Returned dictionary rows have `hasHit=false` and `hitCount=0` until `personalHitMappings` or equivalent hit-memory storage is migrated.

## Intentionally Not Migrated

These routes and domains remain Firebase/Firestore-backed or untouched:

- `/api/fell-before`
- `/api/backtest`
- `/api/dreams/refresh`
- `/api/dreams/hits`
- dream hits
- personal hit events
- personal hit mappings
- backtests
- playlists
- admin repair routes
- lottery engine calls

## Testing

Firebase mode:

1. Keep `DREAM_DB_PROVIDER=firebase`.
2. Call `/api/dictionary/terms?ownerUid=...`.
3. Add a manual dictionary mapping with `POST /api/dictionary/terms`.
4. Confirm response shapes and leading-zero numbers match previous behavior.

Postgres mode:

1. Set `DREAM_DB_PROVIDER=postgres` in a non-production environment.
2. Add a manual owner-self row with `dreamerId = "owner-self"`.
3. Confirm the row appears in `term_number_mappings`.
4. Call `/api/dictionary/terms?ownerUid=...&dreamerId=owner-self`.
5. Confirm leading-zero numbers return as strings.
6. Confirm no `Dreamer` row with id `owner-self` is created.

## Guardrails

- Do not bulk-import old Firestore dictionary rows.
- Do not enable Postgres mode in production until this route is smoke-tested against Railway.
- Do not migrate hit-memory joins in this pass.
- Do not delete Firestore data.
